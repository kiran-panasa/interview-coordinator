import { getDb } from "../../_lib/firebaseAdmin.js";
import { sendWhatsAppOtp } from "../../_lib/whatsapp.js";

// Mobile-number login, step 1 — looks up the candidate by phone, generates
// a 10-minute one-time code, and sends it via WhatsApp. If WhatsApp isn't
// configured yet (see api/_lib/whatsapp.js), the code is returned directly
// in the response instead, clearly flagged — a dev-only fallback so this
// flow is testable before real WhatsApp credentials exist. It stops
// working automatically the moment those env vars are set.
//
// POST /api/sso/otp/request
// Body: { "phone": "9876543210" }

const RATE_LIMIT = 10; // requests/minute/IP, per server process
const rateLimitState = new Map();

function underRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    rateLimitState.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    if (!underRateLimit(ip)) {
      return res.status(429).json({ error: "rate_limited" });
    }

    const phone = String(req.body?.phone || "").trim();
    if (!phone) {
      return res.status(400).json({ error: "invalid_parameter", message: "phone is required." });
    }

    const db = getDb();
    const snap = await db.collection("candidates").where("phone", "==", phone).get();
    if (snap.size !== 1) {
      return res.status(404).json({ error: "student_not_found", message: "No account found for this mobile number." });
    }
    const candidate = snap.docs[0];

    const otp = generateOtp();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    await db.collection("otpLoginCodes").add({
      candidateId: candidate.id,
      phone,
      otp,
      createdAt:   createdAt.toISOString(),
      expiresAt:   expiresAt.toISOString(),
      used:        false,
    });

    const whatsapp = await sendWhatsAppOtp(phone, otp);
    if (whatsapp.sent) {
      return res.status(200).json({ success: true, channel: "whatsapp" });
    }
    // Dev fallback — only reachable while WHATSAPP_ACCESS_TOKEN etc. are unset.
    console.warn(`OTP for ${phone} (WhatsApp not configured: ${whatsapp.reason}):`, otp);
    return res.status(200).json({ success: true, channel: "dev_fallback", devOtp: otp, reason: whatsapp.reason });
  } catch (err) {
    console.error("sso/otp/request error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
