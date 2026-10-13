import { exchangeTokenForSession } from "../../_lib/ssoExchange.js";
import { setSessionCookies } from "../../_lib/ssoSession.js";

// Frontend-driven exchange — called by the /sso/callback React page after
// Forms redirects the browser there with a one-time token. See the SSO
// spec, Section 3 ("Frontend callback").
//
// POST /api/sso/accounts/callback?auth_token=<TOKEN>
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const authToken = String(req.query?.auth_token || "");
    const result = await exchangeTokenForSession(authToken);
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    setSessionCookies(res, result.sessionId, result.csrfToken, { secure: process.env.NODE_ENV === "production" });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("sso/accounts/callback error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
