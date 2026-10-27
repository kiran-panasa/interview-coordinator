import { useState, useEffect } from "react";
import { Loader2, CalendarCheck2, RefreshCw } from "lucide-react";
import { formatDateLong, formatDate, parseInterviewStart, timeToMinutes, hhmmToMinutes, addMinutesToTimeLabel } from "../utils/dates";
import {
  updateScheduleInvite, getAvailableSlots, bookSlotForCandidate, getActiveAdmins,
} from "../api/firestore";
import { callAppsScript } from "../lib/appsScript";
import { collapseSlotsByDurationGrouped, mergeSlotsAcrossInterviewers } from "../utils/slotAvailability";
import { resolveActionAdminRecipients } from "../utils/adminNotify";
import { confirmSelfBooking } from "../services/booking.service";
import Button from "./Button";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function computeBookableSlots(invite, rawSlots, busyWindowsByInterviewer, loadByInterviewer) {
  const windowStartMin = hhmmToMinutes(invite?.timeRangeStart);
  const windowEndMin   = hhmmToMinutes(invite?.timeRangeEnd);
  const withinTimeWindow = (slot) => {
    if (windowStartMin == null || windowEndMin == null) return true;
    const startMin = timeToMinutes(slot.time);
    return startMin >= windowStartMin && startMin <= windowEndMin;
  };
  const perInterviewer = collapseSlotsByDurationGrouped(rawSlots.filter(withinTimeWindow), invite?.duration || 60, busyWindowsByInterviewer);
  return mergeSlotsAcrossInterviewers(perInterviewer, loadByInterviewer);
}

// The same slot-browse-and-book experience as SchedulePage.jsx's "Pick a
// Slot" step, minus the email+OTP steps (the SSO session already proved
// who the student is) — plus a date-first picker. Panelist identity is
// never shown here, same privacy stance as the public SchedulePage.jsx
// link flow — the candidate only ever sees a date and a time.
//
// `invite` can be "virtual" — no `.id` yet (self-book's draft preview,
// see StudentDashboardPage's selfBookDraft) — so nothing gets written to
// Firestore just for browsing slots. `ensureInvite`, if provided, is
// called once, right before the actual booking write, to create the real
// ScheduleInvite and return `{ id, duration }` to book against. Abandoning
// the picker without confirming a slot then leaves nothing behind at all.
export default function InlineSlotPicker({ invite, onBooked, ensureInvite }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slots, setSlots] = useState([]);
  const [busyWindowsByInterviewer, setBusyWindowsByInterviewer] = useState({});
  const [loadByInterviewer, setLoadByInterviewer] = useState({});
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

  const fetchSlots = async (forceRefresh = false) => {
    try {
      const { slots: s, busyWindowsByInterviewer: bw, loadByInterviewer: load } = await getAvailableSlots(
        invite.dateRangeStart, invite.dateRangeEnd, invite.interviewerIds || null, forceRefresh
      );
      setSlots(s);
      setBusyWindowsByInterviewer(bw);
      setLoadByInterviewer(load);
      // Only worth emailing admins about once a real invite exists to
      // reference — a virtual (not-yet-created) draft has no id to attach
      // the notification/flag to.
      if (!forceRefresh && invite.id && computeBookableSlots(invite, s, bw, load).length === 0) notifyAdminsNoSlotsAvailable(invite);
      return { s, bw };
    } catch {
      setSlots([]);
      return { s: [], bw: {} };
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (invite.id && invite.status === "sent") {
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
      let realInvite = invite;
      if (!realInvite.id && ensureInvite) {
        // Creates the ScheduleInvite only now, right before it's actually
        // needed — if this fails or the candidate never gets here, nothing
        // was ever written.
        realInvite = await ensureInvite();
        if (!realInvite) { setBusy(false); return; } // ensureInvite already reported its own error
      }
      await bookSlotForCandidate(
        selected.interviewerId, selected.slotId, realInvite.id,
        selected.date, selected.time, realInvite.duration || 60
      );
      // Self-book skips admin review entirely — confirmSelfBooking creates
      // the Interview record straight at "scheduled" and generates the Meet
      // link right here, same as CandidateSchedulingTab's admin-confirm
      // flow does for the Nudge email-link path (which keeps its manual
      // review step; only this authenticated self-book path doesn't need
      // one). If this fails after the slot itself was successfully
      // reserved, the invite is simply left at "pending_confirmation" —
      // the existing admin Pending Confirmations queue (and its retry,
      // which reuses the same interview record once one exists) is the
      // fallback, so a transient failure here never strands the booking.
      let meetLink = "";
      try {
        const result = await confirmSelfBooking(realInvite.id);
        meetLink = result?.meetLink || "";
      } catch (confirmErr) {
        console.error("Self-book auto-confirm failed — booking stays pending for admin follow-up:", confirmErr);
      }
      setBooked({ date: selected.date, time: selected.time, meetLink });
      // Delayed, not immediate — onBooked typically refreshes/re-renders
      // the parent dashboard (see StudentDashboardPage), which can unmount
      // this panel once the booking moves out of "pending"/"draft" state.
      // Giving the candidate a few seconds to actually read/click the Meet
      // link above before that happens.
      setTimeout(() => onBooked?.(), 4000);
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
          <p className="text-sm font-bold text-emerald-800">Interview confirmed — {formatDateLong(booked.date)} · {booked.time}</p>
          {booked.meetLink ? (
            <p className="text-xs text-emerald-600 mt-0.5">
              Meet link: <a href={booked.meetLink} target="_blank" rel="noreferrer" className="underline font-semibold">{booked.meetLink}</a> — also emailed to you.
            </p>
          ) : (
            <p className="text-xs text-emerald-600 mt-0.5">
              You'll get your Meet link by email shortly.
            </p>
          )}
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

  const bookableSlots = computeBookableSlots(invite, slots, busyWindowsByInterviewer, loadByInterviewer);
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

      {/* Horizontally-scrolling date strip (day label / date number / month),
         not a wrapping row of full-text pills — picks one date out of a
         short window at a glance, same pattern as a food-delivery app's
         slot picker. Violet, not brand-blue — a different accent from the
         time-slot buttons below, so it's visually clear these two rows are
         separate pickers (which date vs which time) rather than one
         continuous group. */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {dates.map(d => {
          const dt = new Date(d + "T12:00:00");
          const todayStr    = new Date().toISOString().slice(0, 10);
          const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const dayLabel = d === todayStr ? "Today" : d === tomorrowStr ? "Tomorrow" : dt.toLocaleDateString("en-US", { weekday: "short" });
          const isActive = d === activeDate;
          return (
            <button key={d} onClick={() => { setSelectedDate(d); setSelected(null); }}
              className={`flex-shrink-0 flex flex-col items-center justify-center w-16 py-2.5 rounded-[1.75rem] border-2 transition-all ${
                isActive ? "bg-violet-600 border-violet-600 text-white shadow-md" : "bg-white border-gray-100 text-gray-600 hover:border-violet-300"
              }`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? "text-white/80" : "text-gray-400"}`}>{dayLabel}</span>
              <span className="text-lg font-bold leading-tight mt-0.5">{dt.getDate()}</span>
              <span className={`text-[10px] font-semibold ${isActive ? "text-white/80" : "text-gray-400"}`}>{dt.toLocaleDateString("en-US", { month: "short" })}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
        {slotsForDate.map(s => {
          const isSelected = selected?.slotId === s.slotId && selected?.interviewerId === s.interviewerId;
          const slotStart  = parseInterviewStart(s.date, s.time);
          const isPastSlot = slotStart ? slotStart < new Date() : false;
          const isDisabled = s.isBooked || isPastSlot;
          // Shows the FULL span the interview actually holds (e.g. a
          // 90-minute round at 9:00 AM shows "9:00 – 10:30 AM"), not just
          // the start time — otherwise a merged multi-slot booking reads
          // identically to a plain 30/60-minute one, with no visible way
          // to tell they're not independently bookable every 30 minutes.
          const slotEnd = addMinutesToTimeLabel(s.time, invite?.duration || 60);
          return (
            <button key={`${s.interviewerId}-${s.slotId}`}
              onClick={() => { if (!isDisabled) setSelected(s); }}
              title={s.isBooked ? "Already booked" : isPastSlot ? "Already passed" : undefined}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all flex flex-col items-center leading-tight ${
                isDisabled
                  ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                  : isSelected
                    ? "bg-brand-600 text-white border-brand-600 shadow-card"
                    : "bg-white text-gray-700 border-gray-200 shadow-soft hover:border-brand-300 hover:bg-brand-50 hover:-translate-y-0.5"
              }`}>
              {s.time} – {slotEnd}
              {/* Visible label, not just a hover tooltip — easy to miss on
                 a greyed-out button, especially on mobile where hover
                 doesn't exist at all. */}
              {s.isBooked && <span className="text-[9px] font-bold uppercase tracking-wide">Booked</span>}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="bg-brand-50 border border-brand-200 rounded-full px-4 py-2.5 text-sm text-brand-800 font-medium text-center">
          Selected: {formatDateLong(selected.date)} · {selected.time}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center">Select a slot above to continue.</p>
      )}
      <Button variant="primary" size="lg" onClick={handleBook} disabled={!selected || busy} className="w-full">
        {busy ? "Booking…" : "Confirm This Slot"}
      </Button>
    </div>
  );
}
