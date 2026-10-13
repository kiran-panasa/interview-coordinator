import { useState, useEffect } from "react";
import { Loader2, CalendarCheck2 } from "lucide-react";
import { formatDateLong, parseInterviewStart, timeToMinutes, hhmmToMinutes } from "../utils/dates";
import {
  updateScheduleInvite, getAvailableSlots, bookSlotForCandidate, getActiveAdmins,
} from "../api/firestore";
import { callAppsScript } from "../lib/appsScript";
import { formatDate } from "../utils/dates";
import { collapseSlotsByDurationGrouped } from "../utils/slotAvailability";
import { resolveActionAdminRecipients } from "../utils/adminNotify";
import Button from "./Button";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function computeBookableSlots(invite, rawSlots, busyWindowsByInterviewer) {
  const windowStartMin = hhmmToMinutes(invite?.timeRangeStart);
  const windowEndMin   = hhmmToMinutes(invite?.timeRangeEnd);
  const withinTimeWindow = (slot) => {
    if (windowStartMin == null || windowEndMin == null) return true;
    const startMin = timeToMinutes(slot.time);
    return startMin >= windowStartMin && startMin <= windowEndMin;
  };
  return collapseSlotsByDurationGrouped(rawSlots.filter(withinTimeWindow), invite?.duration || 60, busyWindowsByInterviewer);
}

// The same slot-browse-and-book experience as SchedulePage.jsx's "Pick a
// Slot" step, minus the email+OTP steps — reused here because the SSO
// session has already proven who the student is, so re-verifying by email
// per invite would be redundant. Needs the caller to have already called
// signInAnonymously() (same Firestore anon-auth requirement as the rest of
// the student-facing booking flow).
export default function InlineSlotPicker({ invite, onBooked }) {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const [busyWindowsByInterviewer, setBusyWindowsByInterviewer] = useState({});
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState(null);

  const notifyAdminsNoSlotsAvailable = async (inv) => {
    if (inv.noSlotsNotifiedAt) return;
    updateScheduleInvite(inv.id, { noSlotsNotifiedAt: new Date().toISOString() }).catch(() => {});
    try {
      const activeAdmins = await getActiveAdmins();
      const admins = resolveActionAdminRecipients(activeAdmins, inv.sentBy);
      if (!admins.length || !APPS_SCRIPT_URL) return;
      const round = inv.round || inv.templateName || "Interview";
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject: `No available slots for ${inv.candidateName} — ${round}`,
        body:
          "Hi {{name}},\n\n" +
          `${inv.candidateName} opened their scheduling link but there are currently no bookable interview slots for them:\n\n` +
          `• Round:       ${round}\n` +
          `• Date Range:  ${formatDate(inv.dateRangeStart)} – ${formatDate(inv.dateRangeEnd)}\n` +
          `• Duration:    ${inv.duration || 60} minutes\n\n` +
          `Please add more interviewer availability for this window so ${inv.candidateName} can book.\n\n— NxtWave Interview Coordinator`,
        recipients: admins.map(a => ({ email: a.email, name: a.displayName || "" })),
      });
    } catch { /* best-effort */ }
  };

  const notifyAdminsBookingPending = async (inv, sel) => {
    try {
      const activeAdmins = await getActiveAdmins();
      const admins = resolveActionAdminRecipients(activeAdmins, inv.sentBy);
      if (!admins.length || !APPS_SCRIPT_URL) return;
      const round = inv.round || inv.templateName || "Interview";
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject: `Action needed: ${inv.candidateName} selected a slot for ${round}`,
        body:
          "Hi {{name}},\n\n" +
          `${inv.candidateName} has selected an interview slot and it's waiting for your approval:\n\n` +
          `• Round:       ${round}\n` +
          `• Interviewer: ${sel.interviewerName || "-"}\n` +
          `• Date:        ${formatDate(sel.date)}\n` +
          `• Time:        ${sel.time}\n\n` +
          `Please review and confirm it from the Nudge → Candidates tab:\n${window.location.origin}/admin/nudge\n\n— NxtWave Interview Coordinator`,
        recipients: admins.map(a => ({ email: a.email, name: a.displayName || "" })),
      });
    } catch { /* best-effort */ }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (invite.status === "sent") {
          await updateScheduleInvite(invite.id, { status: "otp_verified" }).catch(() => {});
        }
        const { slots: s, busyWindowsByInterviewer: bw } = await getAvailableSlots(
          invite.dateRangeStart, invite.dateRangeEnd, invite.interviewerIds || null
        );
        setSlots(s);
        setBusyWindowsByInterviewer(bw);
        if (computeBookableSlots(invite, s, bw).length === 0) notifyAdminsNoSlotsAvailable(invite);
      } catch {
        setSlots([]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.id]);

  const handleBook = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await bookSlotForCandidate(
        selected.interviewerId, selected.slotId, invite.id,
        selected.date, selected.time, invite.duration || 60
      );
      setBooked({ date: selected.date, time: selected.time });
      notifyAdminsBookingPending(invite, selected);
      onBooked?.();
    } catch (e) {
      if (e.message.includes("already booked") || e.message.includes("already passed")) {
        const { slots: fresh, busyWindowsByInterviewer: freshBw } =
          await getAvailableSlots(invite.dateRangeStart, invite.dateRangeEnd, invite.interviewerIds || null, true);
        setSlots(fresh);
        setBusyWindowsByInterviewer(freshBw);
        setSelected(null);
        alert(e.message);
      } else {
        alert("Booking failed: " + e.message);
      }
    }
    setBusy(false);
  };

  if (booked) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5">
        <CalendarCheck2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-800">Slot reserved — {formatDateLong(booked.date)} · {booked.time}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Pending admin confirmation. You'll get a Meet invite by email once confirmed.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  const bookableSlots = computeBookableSlots(invite, slots, busyWindowsByInterviewer);
  const slotsByDate = bookableSlots.reduce((acc, s) => {
    (acc[s.date] ||= []).push(s);
    return acc;
  }, {});

  if (Object.keys(slotsByDate).length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No slots available right now — please check back later.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {Object.entries(slotsByDate).map(([date, daySlots]) => (
          <div key={date}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{formatDateLong(date)}</p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map(s => {
                const isSelected = selected?.slotId === s.slotId && selected?.interviewerId === s.interviewerId;
                const slotStart  = parseInterviewStart(s.date, s.time);
                const isPastSlot = slotStart ? slotStart < new Date() : false;
                const isDisabled = s.isBooked || isPastSlot;
                return (
                  <button key={`${s.interviewerId}-${s.slotId}`}
                    onClick={() => { if (!isDisabled) setSelected(s); }}
                    title={s.isBooked ? "Already booked" : isPastSlot ? "Already passed" : undefined}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
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
      {selected && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-brand-800 font-medium">
          Selected: {formatDateLong(selected.date)} · {selected.time}
        </div>
      )}
      <Button variant="primary" onClick={handleBook} disabled={!selected || busy} className="w-full">
        {busy ? "Booking…" : "Confirm This Slot"}
      </Button>
    </div>
  );
}
