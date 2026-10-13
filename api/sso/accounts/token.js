import { getDb } from "../../_lib/firebaseAdmin.js";
import { randomToken } from "../../_lib/ssoSession.js";

// Server-to-server endpoint the Forms/Accounts backend calls to mint a
// one-time login token for a student about to be redirected back here —
// mirrors "SSO Login — Implementation Details" (12 Oct 2026), Section 2,
// adapted for interview-coordinator's own FORMS_SSO_API_KEY (a separate
// credential from the Edge app's — each relying app gets its own).
//
// POST /api/sso/accounts/token
// Header: x-api-key: <FORMS_SSO_API_KEY>
// Body:   { "user_id": "<student's external/BQ candidate id>" }
// Reply:  { "auth_token": "<token>", "expires_in": 300 }
//
// Matching is by that external id alone (our Candidate.uid field), never
// email or phone — same rule the spec states for Edge.

const RATE_LIMIT = 30; // requests/minute/IP, per server process — an
// in-memory counter is sufficient since it only needs to hold for one warm
// Lambda instance, not be globally accurate across all of them.
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || !process.env.FORMS_SSO_API_KEY || apiKey !== process.env.FORMS_SSO_API_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    if (!underRateLimit(ip)) {
      return res.status(429).json({ error: "rate_limited" });
    }

    const userId = String(req.body?.user_id || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "invalid_parameter", message: "user_id is required." });
    }

    const db = getDb();
    const snap = await db.collection("candidates").where("uid", "==", userId).get();
    if (snap.size !== 1) {
      return res.status(404).json({ error: "student_not_found" });
    }
    const candidate = snap.docs[0];

    const token = randomToken();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000); // 300s
    await db.collection("ssoLoginTokens").doc(token).set({
      candidateId: candidate.id,
      studentUid:  userId,
      createdAt:   createdAt.toISOString(),
      expiresAt:   expiresAt.toISOString(),
      used:        false,
    });

    return res.status(200).json({ auth_token: token, expires_in: 300 });
  } catch (err) {
    console.error("sso/accounts/token error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
