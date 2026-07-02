import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { getUserByEmail } from "../../api/firestore";

const BOOTSTRAP_EMAIL = "kiran.p@nxtwave.tech";

const FIREBASE_ERRORS = {
  "auth/user-not-found":              "No account with this email.",
  "auth/wrong-password":              "Incorrect password.",
  "auth/invalid-credential":          "Invalid email or password.",
  "auth/email-already-in-use":        "An account with this email already exists.",
  "auth/weak-password":               "Password must be at least 6 characters.",
  "auth/invalid-email":               "Enter a valid email address.",
  "auth/too-many-requests":           "Too many attempts. Try again later.",
  "auth/invalid-phone-number":        "Invalid phone number. Contact your admin.",
  "auth/quota-exceeded":              "SMS quota exceeded. Try again later.",
  "auth/invalid-verification-code":   "Incorrect code. Try again.",
  "auth/code-expired":                "Code expired. Go back and request a new one.",
  "auth/missing-phone-number":        "No phone number found. Contact your admin.",
};

function toE164(raw = "") {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length > 10) return `+${d}`;
  return null;
}

function maskPhone(raw = "") {
  const d = raw.replace(/\D/g, "");
  return d.length >= 4 ? `×× ×× ×× ${d.slice(-4)}` : "your registered number";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Login / signup
  const [mode,         setMode]         = useState(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [email,        setEmail]        = useState(searchParams.get("email") || "");
  const [password,     setPassword]     = useState("");
  const [name,         setName]         = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Shared
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // Reset — method picker + email flow
  const [resetMode,   setResetMode]   = useState(false);
  const [resetMethod, setResetMethod] = useState(""); // "" | "email" | "otp"
  const [resetSent,   setResetSent]   = useState(false);

  // OTP flow
  const [otpStep,      setOtpStep]      = useState(1); // 1=enter email, 2=enter code, 3=done
  const [otpEmail,     setOtpEmail]     = useState("");
  const [otpPhoneHint, setOtpPhoneHint] = useState("");
  const [otpE164,      setOtpE164]      = useState("");
  const [otpCode,      setOtpCode]      = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const recaptchaRef = useRef(null);
  const verifierRef  = useRef(null);

  useEffect(() => {
    return () => { verifierRef.current?.clear?.(); };
  }, []);

  // ── Login / signup ────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate("/");
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Something went wrong.");
    } finally { setLoading(false); }
  };

  // ── Email reset ───────────────────────────────────────────────────────────────

  const handleEmailReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(""); setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Could not send reset email.");
    } finally { setLoading(false); }
  };

  // ── OTP reset — step 1: find account ─────────────────────────────────────────

  const handleFindAccount = async (e) => {
    e.preventDefault();
    if (!otpEmail.trim()) { setError("Enter your email address."); return; }
    setError(""); setLoading(true);
    try {
      const user = await getUserByEmail(otpEmail.trim());
      if (!user) { setError("No account found with this email."); setLoading(false); return; }

      const rawPhone = user.phone || user.phoneNumber;
      if (!rawPhone) {
        setError("No phone number on this account. Please contact your admin.");
        setLoading(false); return;
      }
      const e164 = toE164(rawPhone);
      if (!e164) {
        setError("Phone number format not recognised. Contact your admin.");
        setLoading(false); return;
      }
      setOtpE164(e164);
      setOtpPhoneHint(maskPhone(rawPhone));

      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, e164, verifierRef.current);
      setConfirmResult(result);
      setOtpStep(2);
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Could not send OTP. Try again.");
      verifierRef.current = null; // reset so it can be recreated
    }
    setLoading(false);
  };

  // ── OTP reset — step 2: verify code ──────────────────────────────────────────

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.replace(/\D/g, "").length < 6) { setError("Enter the 6-digit code."); return; }
    setError(""); setLoading(true);
    try {
      await confirmResult.confirm(otpCode.replace(/\D/g, ""));
      // AuthContext detects phone-only sign-in and immediately signs out.
      // We fire the reset email here; no auth state changes needed.
      await sendPasswordResetEmail(auth, otpEmail.trim());
      setOtpStep(3);
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Invalid code. Try again.");
    }
    setLoading(false);
  };

  const handleResendOtp = async () => {
    setError(""); setLoading(true);
    try {
      verifierRef.current = null; // force new reCAPTCHA
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, { size: "invisible" });
      const result = await signInWithPhoneNumber(auth, otpE164, verifierRef.current);
      setConfirmResult(result);
      setOtpCode("");
      setError("");
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Could not resend OTP.");
      verifierRef.current = null;
    }
    setLoading(false);
  };

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const openReset = () => {
    setResetMode(true); setResetMethod(""); setResetSent(false);
    setOtpStep(1); setOtpEmail(email); setOtpCode(""); setConfirmResult(null);
    setError("");
  };

  const backFromReset = () => {
    if (!resetMethod) {
      setResetMode(false);
    } else {
      setResetMethod("");
      setResetSent(false);
      setOtpStep(1); setOtpCode(""); setConfirmResult(null);
    }
    setError("");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center px-4">
      {/* invisible reCAPTCHA anchor — must be in the DOM when OTP is requested */}
      <div ref={recaptchaRef} />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-xl mb-4 shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Coordinator</h1>
          <p className="text-sm text-gray-500 mt-1">
            {resetMode ? "Reset your password" : mode === "login" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* ── Reset flow ── */}
          {resetMode ? (
            <>
              {/* Method picker */}
              {!resetMethod && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-5">Choose how you'd like to reset your password.</p>

                  {/* Email option */}
                  <button type="button" onClick={() => { setResetMethod("email"); setError(""); }}
                    className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left group">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 group-hover:bg-indigo-200 rounded-xl flex items-center justify-center transition-colors">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Send reset email</p>
                      <p className="text-xs text-gray-500 mt-0.5">We'll email you a link to reset your password</p>
                    </div>
                  </button>

                  {/* Phone OTP option */}
                  <button type="button" onClick={() => { setResetMethod("otp"); setError(""); }}
                    className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left group">
                    <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Verify via phone OTP</p>
                      <p className="text-xs text-gray-500 mt-0.5">Get a one-time code on your registered phone number</p>
                    </div>
                  </button>

                  <button type="button" onClick={backFromReset}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700 pt-1">
                    ← Back to sign in
                  </button>
                </div>
              )}

              {/* Email reset */}
              {resetMethod === "email" && (
                resetSent ? (
                  <div className="text-center">
                    <p className="text-4xl mb-3">📬</p>
                    <p className="font-semibold text-gray-900 mb-1">Check your inbox</p>
                    <p className="text-sm text-gray-500 mb-6">Reset link sent to <strong>{email}</strong></p>
                    <button onClick={() => { setResetMode(false); setResetSent(false); setResetMethod(""); }}
                      className="text-indigo-600 text-sm font-medium hover:underline">
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleEmailReset} className="space-y-4">
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Reset via email</p>
                      <p className="text-sm text-gray-500 mb-4">Enter your email and we'll send a reset link.</p>
                      <input type="email" placeholder="you@example.com" value={email}
                        onChange={e => setEmail(e.target.value)} required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                    <button type="submit" disabled={loading}
                      className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                      {loading ? "Sending…" : "Send reset link"}
                    </button>
                    <button type="button" onClick={backFromReset}
                      className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
                      ← Back
                    </button>
                  </form>
                )
              )}

              {/* Phone OTP reset */}
              {resetMethod === "otp" && (
                <>
                  {/* Step 1 — find account */}
                  {otpStep === 1 && (
                    <form onSubmit={handleFindAccount} className="space-y-4">
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">Verify via phone OTP</p>
                        <p className="text-sm text-gray-500 mb-4">
                          Enter your account email. We'll send a code to your registered phone.
                        </p>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                          Email
                        </label>
                        <input type="email" placeholder="you@example.com" value={otpEmail}
                          onChange={e => setOtpEmail(e.target.value)} required
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                      <button type="submit" disabled={loading}
                        className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                        {loading ? "Looking up…" : "Send OTP"}
                      </button>
                      <button type="button" onClick={backFromReset}
                        className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
                        ← Back
                      </button>
                    </form>
                  )}

                  {/* Step 2 — enter OTP */}
                  {otpStep === 2 && (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <div className="text-center mb-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-3">
                          <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="font-semibold text-gray-900">Enter the 6-digit code</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Sent to <span className="font-mono font-semibold">{otpPhoneHint}</span>
                        </p>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="— — — — — —"
                        maxLength={6}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                      <button type="submit" disabled={loading || otpCode.length < 6}
                        className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                        {loading ? "Verifying…" : "Verify & send reset link"}
                      </button>
                      <div className="flex items-center justify-between text-sm">
                        <button type="button" onClick={() => { setOtpStep(1); setOtpCode(""); setError(""); }}
                          className="text-gray-500 hover:text-gray-700">
                          ← Change email
                        </button>
                        <button type="button" onClick={handleResendOtp} disabled={loading}
                          className="text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50">
                          Resend code
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 3 — success */}
                  {otpStep === 3 && (
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-full mb-4">
                        <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-semibold text-gray-900 mb-1">Phone verified!</p>
                      <p className="text-sm text-gray-500 mb-2">
                        A password reset link has been sent to
                      </p>
                      <p className="text-sm font-semibold text-indigo-700 mb-6">{otpEmail}</p>
                      <p className="text-xs text-gray-400 mb-6">
                        Can't find the email? Check your spam folder or ask your admin to resend it.
                      </p>
                      <button onClick={() => { setResetMode(false); setResetMethod(""); setOtpStep(1); }}
                        className="text-indigo-600 text-sm font-medium hover:underline">
                        Back to sign in
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* ── Login / signup form ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Full Name</label>
                  <input type="text" placeholder="Your name" value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email</label>
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
              </button>
              {mode === "login" && (
                <button type="button" onClick={openReset}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600">
                  Forgot password?
                </button>
              )}
              <p className="text-center text-sm text-gray-500">
                {mode === "login" ? "No account? " : "Already have one? "}
                <button type="button"
                  onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); setPassword(""); setName(""); }}
                  className="text-indigo-600 font-semibold hover:underline">
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">NxtWave Internal Tool · Restricted Access</p>
      </div>
    </div>
  );
}
