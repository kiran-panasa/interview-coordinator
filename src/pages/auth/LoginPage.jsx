import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

const BOOTSTRAP_EMAIL = "kiran.p@nxtwave.tech";

const FIREBASE_ERRORS = {
  "auth/user-not-found":       "No account with this email.",
  "auth/wrong-password":       "Incorrect password.",
  "auth/invalid-credential":   "Invalid email or password.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password":        "Password must be at least 6 characters.",
  "auth/invalid-email":        "Enter a valid email address.",
  "auth/too-many-requests":    "Too many attempts. Try again later.",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode,      setMode]      = useState(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [email,     setEmail]     = useState(searchParams.get("email") || "");
  const [password,  setPassword]  = useState("");
  const [name,      setName]      = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetMode,    setResetMode]    = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "signup") {
        // Profile creation (with invite check) is handled by AuthContext's onAuthStateChanged
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate("/");
    } catch (err) {
      setError(FIREBASE_ERRORS[err.code] || "Something went wrong.");
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(""); setLoading(true);
    try { await sendPasswordResetEmail(auth, email.trim()); setResetSent(true); }
    catch (err) { setError(FIREBASE_ERRORS[err.code] || "Could not send reset email."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-xl mb-4 shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Coordinator</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {resetMode ? (
            resetSent ? (
              <div className="text-center">
                <p className="text-4xl mb-3">📬</p>
                <p className="font-semibold text-gray-900 mb-1">Check your inbox</p>
                <p className="text-sm text-gray-500 mb-6">Reset link sent to <strong>{email}</strong></p>
                <button onClick={() => { setResetMode(false); setResetSent(false); }}
                  className="text-indigo-600 text-sm font-medium hover:underline">
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Reset password</p>
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
                <button type="button" onClick={() => { setResetMode(false); setError(""); }}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
                  Back to sign in
                </button>
              </form>
            )
          ) : (
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
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
                <button type="button" onClick={() => { setResetMode(true); setError(""); }}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600">
                  Forgot password?
                </button>
              )}
              <p className="text-center text-sm text-gray-500">
                {mode === "login" ? "No account? " : "Already have one? "}
                <button type="button" onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); setPassword(""); setName(""); }}
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
