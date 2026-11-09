import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, AlertTriangle, Smartphone } from "lucide-react";
import StudentLayout from "../../components/StudentLayout";

// Hardcoded, not read from VITE_FORMS_SSO_URL/VITE_FORMS_SSO_LINK_ID — those
// env vars are set in Vercel to forms-gamma.earlywave.in, which doesn't
// serve a working page at all (confirmed: 404 at its root). The actual
// link students are given and use to reach this app is
// forms.ccbp.in/mid/interview-coordinator — hardcoding it here means the
// retry button works regardless of what those env vars are set to.
const FORMS_SIGN_IN_URL = "https://forms.ccbp.in/mid/interview-coordinator";

// Every distinct failure exchangeTokenForSession (api/_lib/ssoExchange.js)
// can return, plus the ones this page detects on its own (missing_token,
// network_error) — each with its own wording instead of collapsing into
// one generic "something went wrong." invalid_token specifically means the
// token in the URL doesn't match any doc in ssoLoginTokens at all (as
// opposed to token_expired/token_already_used, which DO exist but are no
// longer usable) — distinct enough from "try again" that it's worth its
// own line, since it usually means the link itself was malformed rather
// than just stale.
// Forms sometimes redirects here with the auth_token missing or
// malformed — confirmed intermittent (a burst of failures across many
// different students/devices within one ~25-minute window, not
// constant), so a fresh attempt through Forms has a real chance of
// succeeding. Capped at 2 automatic attempts, tracked per tab via
// sessionStorage, so a student whose failure genuinely isn't transient
// doesn't get bounced back and forth forever — they fall through to the
// manual "Try Signing In Again" button instead. Only these two error
// codes are eligible: token_already_used/student_not_found/
// token_expired aren't going to be fixed by retrying the same way.
const AUTO_RETRY_KEY = "ic_sso_auto_retry_count";
const MAX_AUTO_RETRIES = 2;
const AUTO_RETRY_ELIGIBLE = new Set(["missing_token", "invalid_token"]);

function getAutoRetryCount() {
  try { return Number(sessionStorage.getItem(AUTO_RETRY_KEY) || "0"); } catch { return 0; }
}
function setAutoRetryCount(n) {
  try { sessionStorage.setItem(AUTO_RETRY_KEY, String(n)); } catch { /* ignore */ }
}
function clearAutoRetryCount() {
  try { sessionStorage.removeItem(AUTO_RETRY_KEY); } catch { /* ignore */ }
}

const ERROR_MESSAGES = {
  token_expired:      "This sign-in link has expired.",
  token_already_used:  "This sign-in link was already used.",
  student_not_found:  "We couldn't find your account — please check with your team.",
  invalid_token:       "This sign-in link isn't valid — it may be incomplete or already reset. Please try signing in again.",
  missing_token:       "This sign-in link is missing some required information. Please try signing in again from your student dashboard.",
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
    // Always call the backend, even with no token at all — it already
    // returns the same "missing_token" error either way (exchangeTokenFor
    // Session treats an empty token as missing_token too), but routing
    // through accountsCallback is what gets this logged to
    // ssoTokenRequestLog with the referer/user-agent that would actually
    // explain WHERE a broken link with no auth_token came from. Handling
    // it client-side only (the old short-circuit here) meant this exact
    // case — confirmed happening — left zero trace anywhere.
    const authToken = searchParams.get("auth_token") || "";
    // The HTTP Referer header on this fetch is always THIS page's own URL
    // (same-origin request), never whatever external site actually
    // navigated the browser here — confirmed: every missing_token log
    // entry so far shows referer "https://.../sso/callback" itself,
    // telling us nothing. document.referrer is the browser's real
    // navigation history and DOES carry the external page. Sending the
    // full query string too, in case Forms is attaching the token under
    // a different param name entirely rather than not sending one at all
    // — that would otherwise look identical to a genuinely missing token.
    const browserReferrer = document.referrer || "";
    const fullSearch = window.location.search || "";
    (async () => {
      try {
        const res = await fetch(
          `/api/sso/accounts/callback?auth_token=${encodeURIComponent(authToken)}` +
          `&browser_referrer=${encodeURIComponent(browserReferrer)}` +
          `&full_search=${encodeURIComponent(fullSearch)}`,
          {
            method: "POST",
            credentials: "include", // so the Set-Cookie session is actually stored
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          // This handshake failing doesn't necessarily mean the student
          // isn't signed in — "Book an Interview" re-triggers a whole new
          // SSO round-trip through Forms even when they're already on the
          // dashboard with a perfectly valid session, and that's exactly
          // the leg that's been arriving broken (confirmed: Forms
          // sometimes redirects here with no auth_token at all). If their
          // ORIGINAL session cookie is still valid, there's no reason to
          // throw that away and show an error — just continue on.
          const meRes = await fetch("/api/sso/me", { credentials: "include" }).catch(() => null);
          if (meRes?.ok) {
            clearAutoRetryCount();
            navigate("/student/dashboard", { replace: true });
            return;
          }
          // No existing session either (first-time sign-in, or it's
          // genuinely expired) — for the two error codes a fresh attempt
          // can actually fix, silently bounce back through the real sign-
          // in link up to MAX_AUTO_RETRIES times before giving up and
          // showing the error screen.
          const errorCode = data.error || "sign_in_failed";
          if (AUTO_RETRY_ELIGIBLE.has(errorCode)) {
            const retryCount = getAutoRetryCount();
            if (retryCount < MAX_AUTO_RETRIES) {
              setAutoRetryCount(retryCount + 1);
              window.location.href = FORMS_SIGN_IN_URL;
              return;
            }
          }
          // Retries exhausted (or this error code was never eligible —
          // token_already_used/student_not_found aren't fixed by trying
          // again the same way). Show the error screen here, with manual
          // options (mobile-number sign-in or retrying the original link)
          // — reverted from auto-navigating to /student/portal per
          // explicit request.
          setError(errorCode);
          return;
        }
        clearAutoRetryCount();
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
            {/* Retrying the same Academy link lands back on this exact
               screen for a student whose failure isn't transient — that's
               not a real second option, just a loop. Mobile number is a
               genuinely different sign-in path (phone + OTP), independent
               of whatever's failing on the Academy redirect, so it leads
               with that instead. */}
            <Link to="/student/portal"
              className="flex items-center justify-center gap-1.5 bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-brand-700 transition-colors mt-4">
              <Smartphone className="w-4 h-4" /> Sign In With Mobile Number Instead
            </Link>
            <a href={FORMS_SIGN_IN_URL}
              className="inline-flex items-center justify-center gap-1.5 text-gray-500 font-medium text-xs mt-3 hover:text-gray-700 transition-colors underline underline-offset-2">
              or try the original sign-in link again
            </a>
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
