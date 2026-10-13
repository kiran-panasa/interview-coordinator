import { getDb } from "../_lib/firebaseAdmin.js";
import { getValidSession, clearSessionCookies, requireCsrf } from "../_lib/ssoSession.js";

// POST /api/sso/logout — requires the CSRF header (double-submit cookie),
// per the SSO spec's "profile changes and logout require a CSRF token."
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    if (!requireCsrf(req)) {
      return res.status(403).json({ error: "csrf_mismatch" });
    }
    const session = await getValidSession(req);
    if (session) {
      await getDb().collection("ssoSessions").doc(session.id).delete().catch(() => {});
    }
    clearSessionCookies(res, { secure: process.env.NODE_ENV === "production" });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("sso/logout error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
