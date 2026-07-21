import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail, Lock, Eye, EyeOff, LogIn, UserPlus, AlertCircle, Loader2,
  Smartphone, ArrowLeft, CheckCircle2, MailCheck, User, ShieldCheck,
  RefreshCw, CalendarCheck2,
} from "lucide-react";
import { auth } from "../../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { getUserByPhone } from "../../api/firestore";
import { BOOTSTRAP_EMAIL } from "../../constants/roles";
import { maskEmail } from "../../utils/strings";
import Button from "../../components/Button";

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
  "auth/operation-not-allowed":       "SMS for this region is not enabled. Go to Firebase Console → Authentication → Sign-in method → Phone → SMS regions and enable India (+91).",
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

// Small helper so the Button component's fixed icon slot can render a spinner.
function SpinIcon({ className = "" }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

const inputClass =
  "w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 " +
  "focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-400 transition-colors";

const labelClass = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5";

function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 animate-fade-in">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
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
  const [otpStep,       setOtpStep]       = useState(1); // 1=enter phone, 2=enter code, 3=done
  const [otpPhone,      setOtpPhone]      = useState("");
  const [otpE164,       setOtpE164]       = useState("");
  const [foundEmail,    setFoundEmail]    = useState(""); // account email found by phone lookup
  const [maskedEmail,   setMaskedEmail]   = useState(""); // e.g. m***@nxtwave.co.in
  const [otpCode,       setOtpCode]       = useState("");
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
    if (!otpPhone.trim()) { setError("Enter your phone number."); return; }
    setError(""); setLoading(true);
    try {
      const e164 = toE164(otpPhone.trim());
      if (!e164) { setError("Enter a valid phone number (e.g. +91 98765 43210)."); setLoading(false); return; }

      const user = await getUserByPhone(otpPhone.trim());
      if (!user) {
        setError("No account found with this phone number. Contact your admin.");
        setLoading(false); return;
      }
      if (!user.email) {
        setError("Account found but has no email on file. Contact your admin.");
        setLoading(false); return;
      }
      setFoundEmail(user.email);
      setMaskedEmail(maskEmail(user.email));
      setOtpE164(e164);

      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, e164, verifierRef.current);
      setConfirmResult(result);
      setOtpStep(2);
    } catch (err) {
      console.error("OTP send error:", err.code, err.message, "project:", auth.app.options.projectId);
      setError(FIREBASE_ERRORS[err.code] || `Could not send OTP. (${err.code || err.message})`);
      verifierRef.current?.clear?.();
      verifierRef.current = null;
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
      await sendPasswordResetEmail(auth, foundEmail);
      setOtpStep(3);
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Invalid code. Try again.");
    }
    setLoading(false);
  };

  const handleResendOtp = async () => {
    setError(""); setLoading(true);
    try {
      verifierRef.current?.clear?.();
      verifierRef.current = null;
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, { size: "invisible" });
      const result = await signInWithPhoneNumber(auth, otpE164, verifierRef.current);
      setConfirmResult(result);
      setOtpCode("");
      setError("");
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Could not resend OTP.");
      verifierRef.current?.clear?.();
      verifierRef.current = null;
    }
    setLoading(false);
  };

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const openReset = () => {
    setResetMode(true); setResetMethod(""); setResetSent(false);
    setOtpStep(1); setOtpPhone(""); setOtpCode(""); setFoundEmail(""); setMaskedEmail(""); setConfirmResult(null);
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
    <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex flex-col items-center justify-center px-4 py-12">
      {/* invisible reCAPTCHA anchor — must be in the DOM when OTP is requested */}
      <div ref={recaptchaRef} />

      <div className="w-full max-w-md">
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex items-center gap-2.5 mb-8 justify-center"
        >
          <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-brand-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
            <CalendarCheck2 className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">Interview</p>
            <p className="text-xs text-brand-600 font-semibold leading-tight">Coordinator</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
          className="text-center mb-6"
        >
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {resetMode ? "Reset your password" : mode === "login" ? "Sign in to continue" : "Create your account"}
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-white rounded-2xl shadow-card border border-gray-100 p-8"
        >

          {/* ── Reset flow ── */}
          {resetMode ? (
            <>
              {/* Method picker */}
              {!resetMethod && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-gray-600 mb-5">Choose how you'd like to reset your password.</p>

                  {/* Email option */}
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="button"
                    onClick={() => { setResetMethod("email"); setError(""); }}
                    className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-colors text-left group">
                    <div className="flex-shrink-0 w-10 h-10 bg-brand-100 group-hover:bg-brand-200 rounded-xl flex items-center justify-center transition-colors">
                      <Mail className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Send reset email</p>
                      <p className="text-xs text-gray-500 mt-0.5">We'll email you a link to reset your password</p>
                    </div>
                  </motion.button>

                  {/* Phone OTP option */}
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="button"
                    onClick={() => { setResetMethod("otp"); setError(""); }}
                    className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left group">
                    <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                      <Smartphone className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Verify via phone OTP</p>
                      <p className="text-xs text-gray-500 mt-0.5">Get a one-time code on your registered phone number</p>
                    </div>
                  </motion.button>

                  <button type="button" onClick={backFromReset}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 pt-1 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                  </button>
                </div>
              )}

              {/* Email reset */}
              {resetMethod === "email" && (
                resetSent ? (
                  <div className="text-center animate-fade-in">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-100 rounded-full mb-4">
                      <MailCheck className="w-7 h-7 text-brand-600" />
                    </div>
                    <p className="font-semibold text-gray-900 mb-1">Check your inbox</p>
                    <p className="text-sm text-gray-500 mb-6">Reset link sent to <strong>{email}</strong></p>
                    <button onClick={() => { setResetMode(false); setResetSent(false); setResetMethod(""); }}
                      className="text-brand-600 text-sm font-medium hover:underline">
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleEmailReset} className="space-y-4 animate-fade-in">
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Reset via email</p>
                      <p className="text-sm text-gray-500 mb-4">Enter your email and we'll send a reset link.</p>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input type="email" placeholder="you@example.com" value={email}
                          onChange={e => setEmail(e.target.value)} required
                          className={inputClass} />
                      </div>
                    </div>
                    <ErrorBox>{error}</ErrorBox>
                    <Button type="submit" disabled={loading} variant="primary" size="lg"
                      icon={loading ? SpinIcon : Mail} className="w-full">
                      {loading ? "Sending…" : "Send reset link"}
                    </Button>
                    <button type="button" onClick={backFromReset}
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                  </form>
                )
              )}

              {/* Phone OTP reset */}
              {resetMethod === "otp" && (
                <>
                  {/* Step 1 — find account */}
                  {otpStep === 1 && (
                    <form onSubmit={handleFindAccount} className="space-y-4 animate-fade-in">
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">Verify via phone OTP</p>
                        <p className="text-sm text-gray-500 mb-4">
                          Enter your registered phone number. We'll send a one-time code to verify it's you.
                        </p>
                        <label className={labelClass}>Phone Number</label>
                        <div className="relative">
                          <Smartphone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input type="tel" placeholder="+91 98765 43210" value={otpPhone}
                            onChange={e => setOtpPhone(e.target.value)} required
                            className={inputClass.replace("focus:ring-brand-500/10 focus:border-brand-400", "focus:ring-emerald-500/10 focus:border-emerald-400")} />
                        </div>
                      </div>
                      <ErrorBox>{error}</ErrorBox>
                      <Button type="submit" disabled={loading} size="lg"
                        icon={loading ? SpinIcon : Smartphone} className="w-full bg-emerald-600 shadow-soft hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                        {loading ? "Looking up…" : "Send OTP"}
                      </Button>
                      <button type="button" onClick={backFromReset}
                        className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>
                    </form>
                  )}

                  {/* Step 2 — enter OTP */}
                  {otpStep === 2 && (
                    <form onSubmit={handleVerifyOtp} className="space-y-4 animate-fade-in">
                      <div className="text-center mb-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-3">
                          <Smartphone className="w-6 h-6 text-emerald-600" />
                        </div>
                        <p className="font-semibold text-gray-900">Enter the 6-digit code</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Sent to <span className="font-mono font-semibold">{maskPhone(otpPhone)}</span>
                        </p>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="— — — — — —"
                        maxLength={6}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-xl font-mono tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-colors"
                      />
                      <ErrorBox>{error}</ErrorBox>
                      <Button type="submit" disabled={loading || otpCode.length < 6} size="lg"
                        icon={loading ? SpinIcon : ShieldCheck} className="w-full bg-emerald-600 shadow-soft hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                        {loading ? "Verifying…" : "Verify & send reset link"}
                      </Button>
                      <div className="flex items-center justify-between text-sm">
                        <button type="button" onClick={() => { setOtpStep(1); setOtpCode(""); setError(""); }}
                          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors">
                          <ArrowLeft className="w-3.5 h-3.5" /> Change number
                        </button>
                        <button type="button" onClick={handleResendOtp} disabled={loading}
                          className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50 transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" /> Resend code
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 3 — success */}
                  {otpStep === 3 && (
                    <div className="text-center animate-fade-in">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-full mb-4">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600" strokeWidth={2.2} />
                      </div>
                      <p className="font-semibold text-gray-900 mb-1">Phone verified!</p>
                      <p className="text-sm text-gray-500 mb-2">
                        A password reset link has been sent to
                      </p>
                      <p className="text-sm font-semibold text-brand-700 mb-6">{maskedEmail}</p>
                      <p className="text-xs text-gray-400 mb-6">
                        Can't find the email? Check your spam folder or ask your admin to resend it.
                      </p>
                      <button onClick={() => { setResetMode(false); setResetMethod(""); setOtpStep(1); }}
                        className="text-brand-600 text-sm font-medium hover:underline">
                        Back to sign in
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* ── Login / signup form ── */
            <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
              {mode === "signup" && (
                <div>
                  <label className={labelClass}>Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Your name" value={name}
                      onChange={e => setName(e.target.value)}
                      className={inputClass} />
                  </div>
                </div>
              )}
              <div>
                <label className={labelClass}>Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className={`${inputClass} pr-10`} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <ErrorBox>{error}</ErrorBox>
              <Button type="submit" disabled={loading} variant="primary" size="lg"
                icon={loading ? SpinIcon : mode === "login" ? LogIn : UserPlus} className="w-full">
                {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
              </Button>
              {mode === "login" && (
                <button type="button" onClick={openReset}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Forgot password?
                </button>
              )}
              <p className="text-center text-sm text-gray-500">
                {mode === "login" ? "No account? " : "Already have one? "}
                <button type="button"
                  onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); setPassword(""); setName(""); }}
                  className="text-brand-600 font-semibold hover:underline">
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </form>
          )}
        </motion.div>

        <p className="text-center text-xs text-gray-400 mt-6">NxtWave Internal Tool · Restricted Access</p>
      </div>
    </div>
  );
}
