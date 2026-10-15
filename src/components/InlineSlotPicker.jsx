import { useState, useEffect } from "react";
import { Loader2, CalendarCheck2, RefreshCw } from "lucide-react";
import { formatDateLong, formatDate, parseInterviewStart, timeToMinutes, hhmmToMinutes } from "../utils/dates";
import {
  updateScheduleInvite, getAvailableSlots, bookSlotForCandidate, getActiveAdmins,
} from "../api/firestore";
import { callAppsScript } from "../lib/appsScript";
import { collapseSlotsByDurationGrouped, mergeSlotsAcrossInterviewers } from "../utils/slotAvailability";
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
  const perInterviewer = collapseSlotsByDurationGrouped(rawSlots.filter(withinTimeWindow), invite?.duration || 60, busyWindowsByInterviewer);
  return mergeSlotsAcrossInterviewers(perInterviewer);
}

// The same slot-browse-and-book experience as SchedulePage.jsx's "Pick a
// Slot" step, minus the email+OTP steps (the SSO session already proved
// who the student is) — plus a date-first picker. Panelist identity is
// never shown here, same privacy stance as the public SchedulePage.jsx
// link flow — the candidate only ever sees a date and a time.
export default function InlineSlotPicker({ invite, onBooked }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slots, setSlots] = useState([]);
  const [busyWindowsByInterviewer, setBusyWindowsByInterviewer] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
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

  // Beyond this email, a booking is also already visible live in-app —
  // bookSlotForCandidate flips the invite to "pending_confirmation", which
  // subscribeToPendingScheduleInvites (badge on the admin's Nudge nav item,
  // and the Candidates tab list) picks up immediately.
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

  const fetchSlots = async (forceRefresh = false) => {
    try {
      const { slots: s, busyWindowsByInterviewer: bw } = await getAvailableSlots(
        invite.dateRangeStart, invite.dateRangeEnd, invite.interviewerIds || null, forceRefresh
      );
      setSlots(s);
      setBusyWindowsByInterviewer(bw);
      if (!forceRefresh && computeBookableSlots(invite, s, bw).length === 0) notifyAdminsNoSlotsAvailable(invite);
      return { s, bw };
    } catch {
      setSlots([]);
      return { s: [], bw: {} };
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (invite.status === "sent") {
        await updateScheduleInvite(invite.id, { status: "otp_verified" }).catch(() => {});
      }
      await fetchSlots(false);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setSelected(null);
    await fetchSlots(true);
    setRefreshing(false);
  };

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
        const { bw: freshBw } = { bw: (await fetchSlots(true)).bw };
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
          <p className="text-xs text-emerald-600 mt-0.5">
            Pending admin confirmation. You'll get a Meet invite by email once confirmed.
          </p>
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
  const dates = [...new Set(bookableSlots.map(s => s.date))].sort();
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[0];

  if (dates.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400 py-4 text-center">No slots available right now — please check back later.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-brand-600 hover:text-brand-700 py-2 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh Slots"}
        </button>
      </div>
    );
  }

  const slotsForDate = bookableSlots.filter(s => s.date === activeDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pick a date</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Violet, not brand-blue — a different accent from the time-slot
         buttons below, so it's visually clear these two rows are separate
         pickers (which date vs which time) rather than one continuous group. */}
      <div className="flex flex-wrap gap-2">
        {dates.map(d => (
          <button key={d} onClick={() => { setSelectedDate(d); setSelected(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              d === activeDate ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
            }`}>
            {formatDateLong(d).split(",").slice(0, 2).join(",")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
        {slotsForDate.map(s => {
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

      {selected && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-brand-800 font-medium">
          Selected: {formatDateLong(selected.date)} · {selected.time}
        </div>
      )}
      <Button variant="primary" size="lg" onClick={handleBook} disabled={!selected || busy}>
        {busy ? "Booking…" : "Confirm This Slot"}
      </Button>
    </div>
  );
}
