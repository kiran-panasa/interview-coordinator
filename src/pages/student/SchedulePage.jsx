import { useState, useEffect } from "react";
import { formatDate, formatDateLong, parseInterviewStart } from "../../utils/dates";
import { useSearchParams } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, ShieldCheck, Calendar, CheckCircle2, Loader2,
  XCircle, AlertTriangle, AlertCircle, Check, CalendarCheck2,
} from "lucide-react";
import {
  getScheduleInviteByToken, updateScheduleInvite,
  createOtpVerification, getLatestOtpByToken, markOtpUsed,
  getAvailableSlotsForTemplate, bookSlotForCandidate,
  getAllUsers,
} from "../../api/firestore";
import StudentLayout from "../../components/StudentLayout";
import Button from "../../components/Button";
import { callAppsScript } from "../../lib/appsScript";
import { maskEmail } from "../../utils/strings";
import { ROLE } from "../../constants/roles";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}



// ── Step components ───────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-8">
      {children}
    </div>
  );
}

function StepDots({ step }) {
  const steps = ["Email", "Verify", "Pick Slot"];
  const idx = { email: 0, otp: 1, slots: 1, booked: 2 }[step] ?? 0;
  return (
    <div className="flex items-center gap-2 mb-8 justify-center">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            i < idx ? "bg-brand-600 text-white" :
            i === idx ? "bg-brand-600 text-white ring-4 ring-brand-100" :
            "bg-gray-100 text-gray-400"
          }`}>{i < idx ? "✓" : i + 1}</div>
          <span className={`text-xs font-medium ${i === idx ? "text-brand-700" : "text-gray-400"}`}>{label}</span>
          {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < idx ? "bg-brand-400" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [params]   = useSearchParams();
  const token      = params.get("invite") || "";

  const [step,       setStep]       = useState("loading");
  const [invite,     setInvite]     = useState(null);
  const [email,      setEmail]      = useState("");
  const [emailError, setEmailError] = useState("");
  const [otp,        setOtp]        = useState("");
  const [otpError,   setOtpError]   = useState("");
  const [otpId,      setOtpId]      = useState(null);
  const [slots,      setSlots]      = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [bookedInfo, setBookedInfo] = useState(null);

  // Anon auth + load invite on mount
  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    (async () => {
      try {
        await signInAnonymously(auth);
        const inv = await getScheduleInviteByToken(token);
        if (!inv) { setStep("invalid"); return; }
        if (new Date(inv.expiresAt) < new Date()) { setStep("expired"); return; }
        if (inv.status === "confirmed") { setStep("already_confirmed"); setInvite(inv); return; }
        if (inv.status === "pending_confirmation" || inv.status === "slot_selected") {
          setInvite(inv);
          setBookedInfo({ date: inv.bookedDate, time: inv.bookedTime });
          setStep("booked");
          return;
        }
        if (inv.status === "otp_verified") {
          setInvite(inv);
          await loadSlots(inv);
          return;
        }
        setInvite(inv);
        setStep("email");
      } catch (e) {
        console.error(e);
        setStep("invalid");
      }
    })();
  }, [token]);

  const loadSlots = async (inv) => {
    setStep("loading_slots");
    try {
      const s = await getAvailableSlotsForTemplate(
        inv.templateId, inv.dateRangeStart, inv.dateRangeEnd
      );
      setSlots(s);
      setStep("slots");
    } catch (e) {
      console.error(e);
      setStep("slots");
      setSlots([]);
    }
  };

  const handleSendOtp = async () => {
    setEmailError("");
    if (!email.trim()) { setEmailError("Please enter your email."); return; }
    if (email.trim().toLowerCase() !== invite.candidateEmail.toLowerCase()) {
      setEmailError("This email doesn't match our records. Please use the email you registered with.");
      return;
    }
    setBusy(true);
    try {
      const code      = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const id = await createOtpVerification({ inviteToken: token, email: email.trim().toLowerCase(), otp: code, expiresAt, used: false });
      setOtpId(id);
      const link = `${window.location.origin}/student/schedule?invite=${token}`;
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:    "sendOtp",
        email:     email.trim(),
        name:      invite.candidateName || "Candidate",
        otp:       code,
        link,
        template:  invite.round || invite.templateName || "Interview",
        dateStart: formatDate(invite.dateRangeStart),
        dateEnd:   formatDate(invite.dateRangeEnd),
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
      const record = await getLatestOtpByToken(token);
      if (!record) { setOtpError("No OTP found. Please request a new one."); setBusy(false); return; }
      if (new Date(record.expiresAt) < new Date()) { setOtpError("OTP expired. Please request a new one."); setBusy(false); return; }
      if (record.otp !== otp.trim()) { setOtpError("Incorrect code. Please try again."); setBusy(false); return; }
      await markOtpUsed(record.id);
      await updateScheduleInvite(invite.id, { status: "otp_verified" });
      await loadSlots(invite);
    } catch (e) {
      setOtpError("Verification failed. Please try again.");
    }
    setBusy(false);
  };

  const notifyAdminsBookingPending = async () => {
    try {
      const allUsers = await getAllUsers();
      const admins = allUsers.filter(u => u.role === ROLE.ADMIN && u.status === "active");
      if (!admins.length || !APPS_SCRIPT_URL) return;
      const round = invite.round || invite.templateName || "Interview";
      const subject = `Action needed: ${invite.candidateName} selected a slot for ${round}`;
      const body =
        "Hi {{name}},\n\n" +
        `${invite.candidateName} has selected an interview slot and it's waiting for your approval:\n\n` +
        `• Round:       ${round}\n` +
        `• Interviewer: ${selected.interviewerName || "-"}\n` +
        `• Date:        ${formatDate(selected.date)}\n` +
        `• Time:        ${selected.time}\n\n` +
        `Please review and confirm it from the Nudge → Candidates tab:\n${window.location.origin}/admin/nudge\n\n` +
        "— NxtWave Interview Coordinator";
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject,
        body,
        recipients: admins.map(a => ({ email: a.email, name: a.displayName || "" })),
      });
    } catch (e) {
      console.error("Failed to notify admins of pending booking:", e);
    }
  };

  const handleBook = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await bookSlotForCandidate(
        selected.interviewerId,
        selected.slotId,
        invite.id,
        selected.date,
        selected.time
      );
      setBookedInfo({ date: selected.date, time: selected.time });
      setStep("booked");
      notifyAdminsBookingPending();
    } catch (e) {
      if (e.message.includes("already booked") || e.message.includes("already passed")) {
        // Refresh slots (bypassing the cache) so the now-stale one shows as
        // booked/disabled instead of silently failing again on retry.
        const fresh = await getAvailableSlotsForTemplate(invite.templateId, invite.dateRangeStart, invite.dateRangeEnd, true);
        setSlots(fresh);
        setSelected(null);
        alert(e.message);
      } else {
        alert("Booking failed: " + e.message);
      }
    }
    setBusy(false);
  };

  // Group slots by date
  const slotsByDate = slots.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {});

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === "loading" || step === "loading_slots") {
    return (
      <StudentLayout>
        <Card>
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" strokeWidth={2} />
            <p className="text-sm text-gray-500">{step === "loading_slots" ? "Loading available slots…" : "Verifying your invite…"}</p>
          </div>
        </Card>
      </StudentLayout>
    );
  }

  if (step === "invalid") {
    return (
      <StudentLayout>
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-red-500" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-sm text-gray-500">This scheduling link is invalid or has already been used.</p>
          </div>
        </Card>
      </StudentLayout>
    );
  }

  if (step === "expired") {
    return (
      <StudentLayout>
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Link Expired</h2>
            <p className="text-sm text-gray-500">This scheduling link has expired. Please contact the team for a new one.</p>
          </div>
        </Card>
      </StudentLayout>
    );
  }

  if (step === "already_confirmed") {
    return (
      <StudentLayout>
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Already Scheduled</h2>
            <p className="text-sm text-gray-500">Your interview has been confirmed. Check your email for the calendar invite.</p>
            {invite?.bookedDate && (
              <p className="mt-3 text-sm font-semibold text-brand-700">{formatDateLong(invite.bookedDate)} · {invite.bookedTime}</p>
            )}
          </div>
        </Card>
      </StudentLayout>
    );
  }

  if (step === "booked") {
    return (
      <StudentLayout>
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
              <CalendarCheck2 className="w-6 h-6 text-brand-600" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Slot Reserved!</h2>
            {bookedInfo && (
              <p className="text-base font-semibold text-brand-700 mb-3">
                {formatDateLong(bookedInfo.date)} · {bookedInfo.time}
              </p>
            )}
            <p className="text-sm text-gray-500 leading-relaxed">
              Your slot is pending admin confirmation.<br/>
              Once confirmed, you'll receive a Google Meet invite at your registered email.
            </p>
          </div>
        </Card>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <Card>
        <StepDots step={step} />
        <AnimatePresence mode="wait">

        {/* ── Step 1: Email ── */}
        {step === "email" && (
          <motion.div key="email" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Schedule Your Interview</h2>
              <p className="text-sm text-gray-500 mt-1">
                {[
                  invite?.programName,
                  invite?.round || invite?.templateName,
                  `${formatDate(invite?.dateRangeStart)} – ${formatDate(invite?.dateRangeEnd)}`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Your registered email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                placeholder="Enter your email address"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                onKeyDown={e => e.key === "Enter" && handleSendOtp()}
              />
              {emailError && <p className="text-xs text-red-500 mt-1.5">{emailError}</p>}
            </div>
            <Button variant="primary" size="lg" onClick={handleSendOtp} disabled={busy} className="w-full">
              {busy ? "Sending OTP…" : "Send One-Time Code →"}
            </Button>
          </motion.div>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <motion.div key="otp" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Enter Verification Code</h2>
              <p className="text-sm text-gray-500 mt-1">
                We sent a 6-digit code to <span className="font-semibold">{maskEmail(invite?.candidateEmail)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Code expires in 10 minutes</p>
            </div>
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                placeholder="000000"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand-500"
                onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                autoFocus
              />
              {otpError && <p className="text-xs text-red-500 mt-1.5 text-center">{otpError}</p>}
            </div>
            <Button variant="primary" size="lg" onClick={handleVerifyOtp} disabled={busy || otp.length !== 6} className="w-full">
              {busy ? "Verifying…" : "Verify Code →"}
            </Button>
            <button onClick={() => { setStep("email"); setOtp(""); setOtpError(""); }}
              className="w-full text-sm text-gray-400 hover:text-brand-600 transition-colors">
              Didn't receive it? Go back to resend
            </button>
          </motion.div>
        )}

        {/* ── Step 3: Slots ── */}
        {step === "slots" && (
          <motion.div key="slots" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="space-y-5">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-gray-900">Pick a Slot</h2>
              <p className="text-sm text-gray-500 mt-1">
                {[invite?.programName, invite?.round || invite?.templateName].filter(Boolean).join(" · ")}
              </p>
            </div>

            {slots.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-400">No slots available right now.</p>
                <p className="text-xs text-gray-300 mt-1">Please contact the team.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {Object.entries(slotsByDate).map(([date, daySlots]) => (
                  <div key={date}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{formatDateLong(date)}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map(s => {
                        const isSelected = selected?.slotId === s.slotId && selected?.interviewerId === s.interviewerId;
                        const slotStart  = parseInterviewStart(s.date, s.time);
                        const isPastSlot = slotStart ? slotStart < new Date() : false;
                        const isDisabled = s.isBooked || isPastSlot;
                        const handleClick = () => {
                          if (s.isBooked) {
                            alert("This slot is already booked. Please choose another available slot.");
                            return;
                          }
                          if (!isPastSlot) setSelected(s);
                        };
                        return (
                          <button key={`${s.interviewerId}-${s.slotId}`}
                            onClick={handleClick}
                            title={s.isBooked ? "This slot is already booked. Please choose another available slot." : isPastSlot ? "This slot has already passed" : undefined}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                              isDisabled
                                ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                : isSelected
                                  ? "bg-brand-600 text-white border-brand-600"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50"
                            }`}>
                            {s.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-brand-800 font-medium">
                Selected: {formatDateLong(selected.date)} · {selected.time}
              </div>
            )}

            <Button variant="primary" size="lg" onClick={handleBook} disabled={!selected || busy} className="w-full">
              {busy ? "Booking…" : "Confirm This Slot →"}
            </Button>
          </motion.div>
        )}
        </AnimatePresence>
      </Card>
    </StudentLayout>
  );
}
