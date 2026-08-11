import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail, Lock, Eye, EyeOff, LogIn, UserPlus, AlertCircle, Loader2,
  Smartphone, ArrowLeft, CheckCircle2, MailCheck, User, CalendarCheck2,
} from "lucide-react";
import { auth } from "../../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getUserByPhone } from "../../api/firestore";
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
};

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
  const [resetMethod, setResetMethod] = useState(""); // "" | "email" | "phone"
  const [resetSent,   setResetSent]   = useState(false);

  // Phone-based reset — looks the account up by phone number, then sends
  // the same Firebase reset email used by the "email" method. No SMS/OTP
  // involved: Firebase Phone Auth requires the Blaze billing plan, which
  // this project isn't on, so SMS delivery can never work here regardless
  // of app code. This just gives people who don't remember their email a
  // way to find their account and get the reset link the same way.
  const [phoneStep,    setPhoneStep]    = useState(1); // 1=enter phone, 2=done
  const [phone,        setPhone]        = useState("");
  const [maskedEmail,  setMaskedEmail]  = useState(""); // e.g. m***@nxtwave.co.in

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

  // ── Phone-lookup reset ────────────────────────────────────────────────────────

  const handlePhoneReset = async (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a valid phone number."); return; }
    setError(""); setLoading(true);
    try {
      const user = await getUserByPhone(phone.trim());
      if (!user) { setError("No account found with this phone number. Contact your admin."); return; }
      if (!user.email) { setError("Account found but has no email on file. Contact your admin."); return; }

      await sendPasswordResetEmail(auth, user.email);
      setMaskedEmail(maskEmail(user.email));
      setPhoneStep(2);
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const openReset = () => {
    setResetMode(true); setResetMethod(""); setResetSent(false);
    setPhoneStep(1); setPhone(""); setMaskedEmail("");
    setError("");
  };

  const backFromReset = () => {
    if (!resetMethod) {
      setResetMode(false);
    } else {
      setResetMethod("");
      setResetSent(false);
      setPhoneStep(1);
    }
    setError("");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex flex-col items-center justify-center px-4 py-12">
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

                  {/* Phone-lookup option */}
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="button"
                    onClick={() => { setResetMethod("phone"); setError(""); }}
                    className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left group">
                    <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                      <Smartphone className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Find account by phone</p>
                      <p className="text-xs text-gray-500 mt-0.5">Don't remember your email? We'll look up your account and email you a reset link</p>
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

              {/* Phone-lookup reset */}
              {resetMethod === "phone" && (
                <>
                  {/* Step 1 — find account */}
                  {phoneStep === 1 && (
                    <form onSubmit={handlePhoneReset} className="space-y-4 animate-fade-in">
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">Find account by phone</p>
                        <p className="text-sm text-gray-500 mb-4">
                          Enter your registered phone number and we'll email a reset link to the account on file.
                        </p>
                        <label className={labelClass}>Phone Number</label>
                        <div className="relative">
                          <Smartphone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input type="tel" placeholder="+91 98765 43210" value={phone}
                            onChange={e => setPhone(e.target.value)} required
                            className={inputClass.replace("focus:ring-brand-500/10 focus:border-brand-400", "focus:ring-emerald-500/10 focus:border-emerald-400")} />
                        </div>
                      </div>
                      <ErrorBox>{error}</ErrorBox>
                      <Button type="submit" disabled={loading} size="lg"
                        icon={loading ? SpinIcon : Smartphone} className="w-full bg-emerald-600 shadow-soft hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                        {loading ? "Looking up…" : "Find account & send reset link"}
                      </Button>
                      <button type="button" onClick={backFromReset}
                        className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>
                    </form>
                  )}

                  {/* Step 2 — success */}
                  {phoneStep === 2 && (
                    <div className="text-center animate-fade-in">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-full mb-4">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600" strokeWidth={2.2} />
                      </div>
                      <p className="font-semibold text-gray-900 mb-1">Account found!</p>
                      <p className="text-sm text-gray-500 mb-2">
                        A password reset link has been sent to
                      </p>
                      <p className="text-sm font-semibold text-brand-700 mb-6">{maskedEmail}</p>
                      <p className="text-xs text-gray-400 mb-6">
                        Can't find the email? Check your spam folder or ask your admin to resend it.
                      </p>
                      <button onClick={() => { setResetMode(false); setResetMethod(""); setPhoneStep(1); }}
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
