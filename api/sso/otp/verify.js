import { getDb } from "../../_lib/firebaseAdmin.js";
import { createSession } from "../../_lib/ssoExchange.js";
import { setSessionCookies } from "../../_lib/ssoSession.js";

// Mobile-number login, step 2 — verifies the code from /api/sso/otp/request
// and establishes the same kind of session the Forms SSO path creates, so
// the dashboard works identically regardless of how the student signed in.
//
// POST /api/sso/otp/verify
// Body: { "phone": "9876543210", "otp": "123456" }
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const phone = String(req.body?.phone || "").trim();
    const otp   = String(req.body?.otp   || "").trim();
    if (!phone || !otp) {
      return res.status(400).json({ error: "invalid_parameter" });
    }

    const db = getDb();
    // Most recent code for this phone — a student who asks for a new code
    // after not receiving the first should only ever be checked against
    // the latest one.
    const snap = await db.collection("otpLoginCodes")
      .where("phone", "==", phone)
      .where("used", "==", false)
      .get();
    const candidates = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const record = candidates[0];

    if (!record) {
      return res.status(401).json({ error: "no_code_requested" });
    }
    if (new Date(record.expiresAt) < new Date()) {
      return res.status(401).json({ error: "code_expired" });
    }
    if (record.otp !== otp) {
      return res.status(401).json({ error: "incorrect_code" });
    }

    await db.collection("otpLoginCodes").doc(record.id).update({ used: true, usedAt: new Date().toISOString() });

    const session = await createSession(record.candidateId);
    setSessionCookies(res, session.sessionId, session.csrfToken, { secure: process.env.NODE_ENV === "production" });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("sso/otp/verify error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
