import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";

const FORMS_SSO_URL     = import.meta.env.VITE_FORMS_SSO_URL || "https://forms.ccbp.in";
const FORMS_SSO_LINK_ID = import.meta.env.VITE_FORMS_SSO_LINK_ID;

// Every distinct failure exchangeTokenForSession (api/_lib/ssoExchange.js)
// can return, plus the ones this page detects on its own (missing_token,
// network_error) — each with its own wording instead of collapsing into
// one generic "something went wrong." invalid_token specifically means the
// token in the URL doesn't match any doc in ssoLoginTokens at all (as
// opposed to token_expired/token_already_used, which DO exist but are no
// longer usable) — distinct enough from "try again" that it's worth its
// own line, since it usually means the link itself was malformed rather
// than just stale.
const ERROR_MESSAGES = {
  token_expired:      "This sign-in link has expired.",
  token_already_used:  "This sign-in link was already used.",
  student_not_found:  "We couldn't find your account — please check with your team.",
  invalid_token:       "This sign-in link isn't valid — it may be incomplete or already reset. Please try signing in again.",
  missing_token:       "This sign-in link is missing some required information. Please try signing in again from your Academy dashboard.",
  network_error:       "We couldn't reach the sign-in service — please check your connection and try again.",
};

// Lands here when Forms redirects the browser back with a one-time token
// (the "frontend callback" path — see the SSO spec, Section 3). Exchanges
// it for a session, then moves on to the dashboard.
export default function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const authToken = searchParams.get("auth_token");
    if (!authToken) { setError("missing_token"); return; }
    (async () => {
      try {
        const res = await fetch(`/api/sso/accounts/callback?auth_token=${encodeURIComponent(authToken)}`, {
          method: "POST",
          credentials: "include", // so the Set-Cookie session is actually stored
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.error || "sign_in_failed");
          return;
        }
        navigate("/student/dashboard", { replace: true });
      } catch {
        setError("network_error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StudentLayout>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-8 text-center">
        {error ? (
          <>
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-900">Sign-in failed</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              {ERROR_MESSAGES[error] || "Something went wrong signing you in."}
            </p>
            {!ERROR_MESSAGES[error] && (
              <p className="text-xs text-gray-400 mt-1">Error code: {error}</p>
            )}
            {FORMS_SSO_LINK_ID && (
              <a href={`${FORMS_SSO_URL}/mid/${FORMS_SSO_LINK_ID}`}
                className="inline-flex items-center justify-center gap-1.5 bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-brand-700 transition-colors mt-4">
                Try Signing In Again
              </a>
            )}
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 text-brand-600 mx-auto mb-3 animate-spin" />
            <h2 className="text-lg font-bold text-gray-900">Signing you in…</h2>
            <p className="text-sm text-gray-500 mt-1.5">Just a moment.</p>
          </>
        )}
      </div>
    </StudentLayout>
  );
}
