import { useState } from "react";
import { formatDate } from "../../utils/dates";
import { Link } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  createOtpVerification, getLatestOtpByToken, markOtpUsed,
  getScheduleInvitesByEmail,
} from "../../api/firestore";
import StudentLayout from "../../components/StudentLayout";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      {children}
    </div>
  );
}

export default function CandidatePortal() {
  const [step,       setStep]       = useState("email");
  const [email,      setEmail]      = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp,        setOtp]        = useState("");
  const [otpError,   setOtpError]   = useState("");
  const [busy,       setBusy]       = useState(false);
  const [invites,    setInvites]    = useState([]);

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
      {step === "email" && (
        <Card>
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-gray-900">My Interviews</h2>
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
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                autoFocus
              />
              {emailError && <p className="text-xs text-red-500 mt-1.5">{emailError}</p>}
            </div>
            <button onClick={handleSendOtp} disabled={busy}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {busy ? "Sending OTP…" : "Send One-Time Code →"}
            </button>
          </div>
        </Card>
      )}

      {step === "otp" && (
        <Card>
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-gray-900">Verify Your Email</h2>
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
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
              autoFocus
            />
            {otpError && <p className="text-xs text-red-500 mt-1.5 text-center">{otpError}</p>}
            <button onClick={handleVerifyOtp} disabled={busy || otp.length !== 6}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {busy ? "Verifying…" : "Verify Code →"}
            </button>
            <button onClick={() => { setStep("email"); setOtp(""); setOtpError(""); }}
              className="w-full text-sm text-gray-400 hover:text-indigo-600 transition-colors">
              Didn't receive it? Go back to resend
            </button>
          </div>
        </Card>
      )}

      {step === "invites" && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-gray-900">Your Scheduling Invites</h2>
            <p className="text-sm text-gray-500 mt-1">{email}</p>
          </div>

          {invites.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-gray-400 py-6">No invites found for this email.</p>
            </Card>
          ) : (
            <>
              {/* Active invites */}
              {activeInvites.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pending</p>
                  {activeInvites.map(inv => (
                    <div key={inv.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{inv.templateName || "Interview"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                          </p>
                        </div>
                        <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {STATUS_LABEL[inv.status] || inv.status}
                        </span>
                      </div>

                      {inv.status === "pending_confirmation" || inv.status === "slot_selected" ? (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-800 font-medium">
                          Slot selected — waiting for admin confirmation.
                        </div>
                      ) : (
                        <Link
                          to={`/student/schedule?invite=${inv.inviteToken}`}
                          className="block w-full text-center bg-indigo-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition-colors">
                          Schedule Now →
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
                          <p className="font-semibold text-gray-700 text-sm">{inv.templateName || "Interview"}</p>
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
        </div>
      )}
    </StudentLayout>
  );
}
