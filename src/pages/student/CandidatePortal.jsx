import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ShieldCheck, CalendarClock, Clock3, ArrowRight, Inbox, LogIn, Smartphone, AlertTriangle } from "lucide-react";
import { formatDate } from "../../utils/dates";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  createOtpVerification, getLatestOtpByToken, markOtpUsed,
  getScheduleInvitesByEmail,
} from "../../api/firestore";
import StudentLayout from "../../components/StudentLayout";
import Button from "../../components/Button";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;
const FORMS_SSO_URL     = import.meta.env.VITE_FORMS_SSO_URL || "https://forms.ccbp.in";
const FORMS_SSO_LINK_ID = import.meta.env.VITE_FORMS_SSO_LINK_ID;

async function callAppsScript(payload) {
  if (!APPS_SCRIPT_URL) return;
  await fetch(APPS_SCRIPT_URL, {
    method: "POST", redirect: "follow",
    body: JSON.stringify({ ...payload, secret: APPS_SCRIPT_SECRET }),
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email = "") {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.slice(0, 2) + "***" + (local.length > 4 ? local.slice(-1) : "");
  return `${masked}@${domain}`;
}


const STATUS_LABEL = {
  sent:                 "Invite Sent",
  otp_verified:         "Verified",
  slot_selected:        "Slot Selected",
  pending_confirmation: "Pending Confirmation",
  confirmed:            "Confirmed",
  cancelled:            "Cancelled",
};

const STATUS_STYLE = {
  sent:                 "bg-blue-50 text-blue-700 border-blue-200",
  otp_verified:         "bg-amber-50 text-amber-700 border-amber-200",
  slot_selected:        "bg-amber-50 text-amber-700 border-amber-200",
  pending_confirmation: "bg-violet-50 text-violet-700 border-violet-200",
  confirmed:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:            "bg-gray-100 text-gray-400 border-gray-200",
};

function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-8">
      {children}
    </div>
  );
}

const stepMotion = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.25, ease: "easeOut" },
};

// backendCallback (api/sso-handler.js) redirects HERE with ?sso_error=... on
// a failed token exchange — previously silently dropped, so a student whose
// sign-in link expired or got reused (e.g. a link-preview bot pre-fetching
// it) just landed back on the plain sign-in page with zero explanation.
const SSO_ERROR_COPY = {
  token_expired: "That sign-in link expired before you finished — tap \"Sign In via Academy Account\" again to get a fresh one.",
  token_already_used: "That sign-in link was already used — tap \"Sign In via Academy Account\" again to get a fresh one.",
  invalid_token: "That sign-in link isn't valid anymore — tap \"Sign In via Academy Account\" again.",
  student_not_found: "We couldn't find your account. Please check with your team.",
};

export default function CandidatePortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ssoError = searchParams.get("sso_error");
  const [step,       setStep]       = useState("mobile");
  const [email,      setEmail]      = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp,        setOtp]        = useState("");
  const [otpError,   setOtpError]   = useState("");
  const [busy,       setBusy]       = useState(false);
  const [invites,    setInvites]    = useState([]);

  // Mobile-number login — a separate path from the legacy email+OTP flow
  // above; both end up signed in, but mobile creates a real SSO session
  // (/api/sso/*) landing on the Student Dashboard, while email stays the
  // older invite-list-only view for anyone who prefers it.
  const [phone,          setPhone]          = useState("");
  const [phoneError,     setPhoneError]     = useState("");
  const [mobileOtp,      setMobileOtp]      = useState("");
  const [mobileOtpError, setMobileOtpError] = useState("");
  const [devOtpHint,     setDevOtpHint]     = useState("");

  const handleRequestMobileOtp = async () => {
    setPhoneError("");
    const trimmed = phone.trim();
    if (!trimmed) { setPhoneError("Please enter your mobile number."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/sso/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error === "student_not_found"
          ? "No access — you're not registered. Please connect with your team."
          : "Failed to send code. Please try again.");
        setBusy(false);
        return;
      }
      // Only ever set when WhatsApp delivery isn't configured yet — see
      // api/sso/otp/request.js. Disappears automatically once it is.
      setDevOtpHint(data.channel === "dev_fallback" ? data.devOtp : "");
      setStep("mobile-otp");
    } catch {
      setPhoneError("Failed to send code. Please try again.");
    }
    setBusy(false);
  };

  const handleVerifyMobileOtp = async () => {
    setMobileOtpError("");
    if (mobileOtp.trim().length !== 6) { setMobileOtpError("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/sso/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim(), otp: mobileOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMobileOtpError(
          data.error === "code_expired" ? "Code expired. Please request a new one."
          : data.error === "incorrect_code" ? "Incorrect code. Please try again."
          : "Verification failed. Please try again."
        );
        setBusy(false);
        return;
      }
      navigate("/student/dashboard");
    } catch {
      setMobileOtpError("Verification failed. Please try again.");
    }
    setBusy(false);
  };

  // Use a stable portal token per email so OTP infra works unchanged
  const portalToken = `portal_${email.trim().toLowerCase()}`;

  const handleSendOtp = async () => {
    setEmailError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setEmailError("Please enter your email."); return; }
    setBusy(true);
    try {
      await signInAnonymously(auth);
      // Check there's at least one invite for this email before sending OTP
      const existing = await getScheduleInvitesByEmail(trimmed);
      if (existing.length === 0) {
        setEmailError("No scheduling invites found for this email. Contact the admin.");
        setBusy(false);
        return;
      }
      const code      = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await createOtpVerification({ inviteToken: portalToken, email: trimmed, otp: code, expiresAt, used: false });
      await callAppsScript({
        action: "sendOtp",
        email:  trimmed,
        name:   existing[0]?.candidateName || "Candidate",
        otp:    code,
        link:   `${window.location.origin}/student/portal`,
      });
      setStep("otp");
    } catch (e) {
      setEmailError("Failed to send OTP. Please try again.");
    }
    setBusy(false);
  };

  const handleVerifyOtp = async () => {
    setOtpError("");
    if (otp.trim().length !== 6) { setOtpError("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const record = await getLatestOtpByToken(portalToken);
      if (!record)                                    { setOtpError("No OTP found. Please request a new one."); setBusy(false); return; }
      if (new Date(record.expiresAt) < new Date())    { setOtpError("OTP expired. Please request a new one.");  setBusy(false); return; }
      if (record.otp !== otp.trim())                  { setOtpError("Incorrect code. Please try again.");        setBusy(false); return; }
      await markOtpUsed(record.id);
      const list = await getScheduleInvitesByEmail(email.trim().toLowerCase());
      setInvites(list);
      setStep("invites");
    } catch (e) {
      setOtpError("Verification failed. Please try again.");
    }
    setBusy(false);
  };

  const activeInvites = invites.filter(i => !["cancelled", "confirmed"].includes(i.status));
  const pastInvites   = invites.filter(i =>  ["cancelled", "confirmed"].includes(i.status));

  return (
    <StudentLayout>
      <AnimatePresence mode="wait">
        {step === "mobile" && (
          <motion.div key="mobile" {...stepMotion}>
            {ssoError && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 max-w-md mx-auto">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-xs text-amber-800">{SSO_ERROR_COPY[ssoError] || "Something went wrong signing you in. Please try again."}</p>
              </div>
            )}
            <Card>
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Student Sign In</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your registered mobile number</p>
              </div>
              <div className="space-y-4">
                {FORMS_SSO_LINK_ID && (
                  <>
                    <a
                      href={`${FORMS_SSO_URL}/mid/${FORMS_SSO_LINK_ID}`}
                      className="flex items-center justify-center gap-1.5 w-full text-center bg-gray-900 text-white font-semibold py-3 rounded-full text-sm hover:bg-gray-800 transition-colors">
                      <LogIn className="w-4 h-4" /> Sign In via Academy Account
                    </a>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <div className="flex-1 h-px bg-gray-100" /> or use mobile number <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setPhoneError(""); }}
                    placeholder="9876543210"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    onKeyDown={e => e.key === "Enter" && handleRequestMobileOtp()}
                    autoFocus
                  />
                  {phoneError && <p className="text-xs text-red-500 mt-1.5">{phoneError}</p>}
                </div>
                <Button variant="primary" size="lg" icon={busy ? undefined : ArrowRight}
                  onClick={handleRequestMobileOtp} disabled={busy} className="w-full">
                  {busy ? "Sending Code…" : "Send One-Time Code"}
                </Button>
                <button onClick={() => setStep("email")}
                  className="w-full text-sm text-gray-400 hover:text-brand-600 transition-colors">
                  Use your email instead
                </button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === "mobile-otp" && (
          <motion.div key="mobile-otp" {...stepMotion}>
            <Card>
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Verify Your Mobile Number</h2>
                <p className="text-sm text-gray-500 mt-1">
                  We sent a 6-digit code to <span className="font-semibold">{phone}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Code expires in 10 minutes</p>
                {devOtpHint && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                    SMS isn't configured yet — for testing, your code is <span className="font-bold">{devOtpHint}</span>
                  </p>
                )}
              </div>
              <div className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mobileOtp}
                  onChange={e => { setMobileOtp(e.target.value.replace(/\D/g, "")); setMobileOtpError(""); }}
                  placeholder="000000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                  onKeyDown={e => e.key === "Enter" && handleVerifyMobileOtp()}
                  autoFocus
                />
                {mobileOtpError && <p className="text-xs text-red-500 mt-1.5 text-center">{mobileOtpError}</p>}
                <Button variant="primary" size="lg" icon={busy ? undefined : ArrowRight}
                  onClick={handleVerifyMobileOtp} disabled={busy || mobileOtp.length !== 6} className="w-full">
                  {busy ? "Verifying…" : "Verify Code"}
                </Button>
                <button onClick={() => { setStep("mobile"); setMobileOtp(""); setMobileOtpError(""); setDevOtpHint(""); }}
                  className="w-full text-sm text-gray-400 hover:text-brand-600 transition-colors">
                  Didn't receive it? Go back to resend
                </button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === "email" && (
          <motion.div key="email" {...stepMotion}>
            <Card>
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">My Interviews</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your registered email to view your scheduling invites</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Registered Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                    placeholder="your@email.com"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                    autoFocus
                  />
                  {emailError && <p className="text-xs text-red-500 mt-1.5">{emailError}</p>}
                </div>
                <Button variant="primary" size="lg" icon={busy ? undefined : ArrowRight}
                  onClick={handleSendOtp} disabled={busy} className="w-full">
                  {busy ? "Sending OTP…" : "Send One-Time Code"}
                </Button>
                <button onClick={() => { setStep("mobile"); setEmail(""); setEmailError(""); }}
                  className="w-full text-sm text-gray-400 hover:text-brand-600 transition-colors">
                  Use your mobile number instead
                </button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div key="otp" {...stepMotion}>
            <Card>
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Verify Your Email</h2>
                <p className="text-sm text-gray-500 mt-1">
                  We sent a 6-digit code to <span className="font-semibold">{maskEmail(email)}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Code expires in 10 minutes</p>
              </div>
              <div className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  placeholder="000000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                  onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                  autoFocus
                />
                {otpError && <p className="text-xs text-red-500 mt-1.5 text-center">{otpError}</p>}
                <Button variant="primary" size="lg" icon={busy ? undefined : ArrowRight}
                  onClick={handleVerifyOtp} disabled={busy || otp.length !== 6} className="w-full">
                  {busy ? "Verifying…" : "Verify Code"}
                </Button>
                <button onClick={() => { setStep("email"); setOtp(""); setOtpError(""); }}
                  className="w-full text-sm text-gray-400 hover:text-brand-600 transition-colors">
                  Didn't receive it? Go back to resend
                </button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === "invites" && (
          <motion.div key="invites" {...stepMotion} className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Your Scheduling Invites</h2>
              <p className="text-sm text-gray-500 mt-1">{email}</p>
            </div>

            {invites.length === 0 ? (
              <Card>
                <div className="text-center py-6">
                  <Inbox className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No invites found for this email.</p>
                </div>
              </Card>
            ) : (
              <>
                {/* Active invites */}
                {activeInvites.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pending</p>
                    {activeInvites.map(inv => (
                      <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-bold text-gray-900">{inv.round || inv.templateName || "Interview"}</p>
                            <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <CalendarClock className="w-3 h-3" />
                              {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {STATUS_LABEL[inv.status] || inv.status}
                          </span>
                        </div>

                        {inv.status === "pending_confirmation" || inv.status === "slot_selected" ? (
                          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-800 font-medium">
                            <Clock3 className="w-4 h-4 flex-shrink-0" />
                            Slot selected — waiting for admin confirmation.
                          </div>
                        ) : (
                          <Link
                            to={`/student/schedule?invite=${inv.inviteToken}`}
                            className="flex items-center justify-center gap-1.5 w-full text-center bg-brand-600 text-white font-semibold py-2.5 rounded-full text-sm hover:bg-brand-700 transition-colors">
                            Schedule Now <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Past invites */}
                {pastInvites.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">Past</p>
                    {pastInvites.map(inv => (
                      <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 p-5 opacity-70">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-700 text-sm">{inv.round || inv.templateName || "Interview"}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_STYLE[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {STATUS_LABEL[inv.status] || inv.status}
                          </span>
                        </div>
                        {inv.status === "confirmed" && inv.bookedDate && (
                          <p className="text-xs text-emerald-700 font-semibold mt-2">
                            {formatDate(inv.bookedDate)} · {inv.bookedTime}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <button onClick={() => { setStep("email"); setOtp(""); setEmail(""); setInvites([]); }}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-2">
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </StudentLayout>
  );
}
