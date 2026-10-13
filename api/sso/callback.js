import { exchangeTokenForSession } from "../_lib/ssoExchange.js";
import { setSessionCookies } from "../_lib/ssoSession.js";

// Backend-driven exchange — Forms redirects the browser straight here
// instead of to a frontend page; this establishes the session and redirects
// directly to the student dashboard. See the SSO spec, Section 3 ("Backend
// callback"). Which of the two callback paths Forms is actually configured
// to use needs confirming on their side before go-live — both are
// implemented here so either works.
//
// GET /api/sso/callback?auth_token=<TOKEN>
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const authToken = String(req.query?.auth_token || "");
    const result = await exchangeTokenForSession(authToken);
    if (result.error) {
      return res.redirect(302, `/student/portal?sso_error=${encodeURIComponent(result.error)}`);
    }
    setSessionCookies(res, result.sessionId, result.csrfToken, { secure: process.env.NODE_ENV === "production" });
    return res.redirect(302, "/student/dashboard");
  } catch (err) {
    console.error("sso/callback error:", err);
    return res.redirect(302, "/student/portal?sso_error=internal_error");
  }
}
