import { compareTimeLabels, timeToMinutes } from "./dates";

// True if [startMin, startMin+durationMinutes) overlaps any of an
// interviewer's real, current busy windows on that date — see
// getInterviewerBusyWindows / getBusyWindowsForInterviewers in
// api/availability.ts, which build these from the interviewer's ACTUAL
// interviews (manually scheduled, a confirmed nudge booking, CSV import —
// any source), not from a flag some write path has to remember to set.
// This is what makes a manually-scheduled interview correctly block a
// nudge candidate from double-booking the same time, and vice versa.
function overlapsBusyWindow(date, startMin, durationMinutes, busyWindows) {
  if (!busyWindows || !busyWindows.length) return false;
  const endMin = startMin + durationMinutes;
  return busyWindows.some(w => w.date === date && startMin < w.endMin && endMin > w.startMin);
}

// busyWindowsByInterviewer: a Map (or plain object) of interviewerId -> that
// interviewer's busy windows. Accepts either since callers sometimes only
// have one interviewer's array to hand.
function windowsFor(busyWindowsByInterviewer, interviewerId) {
  if (!busyWindowsByInterviewer) return [];
  if (busyWindowsByInterviewer instanceof Map) return busyWindowsByInterviewer.get(interviewerId) || [];
  return busyWindowsByInterviewer[interviewerId] || [];
}

// Given one interviewer's raw availability slots for one date, returns only
// the ones that can actually be offered as independent interview start times
// for a `durationMinutes`-long interview — i.e. a slot whose start falls
// inside an earlier KEPT slot's [start, start+duration) window is dropped,
// since booking that earlier slot would occupy the interviewer through that
// whole window.
//
// A slot is unusable as a start — not just skipped, but returned flagged
// isBooked so it's shown disabled rather than silently missing — when
// EITHER: another raw slot anywhere within its own [start, start+duration)
// span is itself booked (a pending nudge hold), or a real interview
// overlaps any part of that span (busyWindows), regardless of whether that
// interview has a matching raw slot doc at all — a manually-scheduled
// interview usually doesn't.
//
// Example: raw slots 6:30/7:00/7:30/8:00 PM with a 90-minute duration and
// nothing else booked -> 6:30 PM is kept (occupies 6:30-8:00), 7:00 and 7:30
// fall inside that window and are dropped, 8:00 PM starts exactly when it
// ends so it's kept too. Result: [6:30 PM, 8:00 PM].
export function collapseSlotsByDuration(slots, durationMinutes, busyWindowsByInterviewer = new Map()) {
  const withMin = [...slots]
    .sort((a, b) => compareTimeLabels(a.time, b.time))
    .map(s => ({ ...s, __min: timeToMinutes(s.time) }));

  const kept = [];
  let blockedUntil = -Infinity;
  for (const slot of withMin) {
    const startMin = slot.__min;
    if (startMin < blockedUntil) continue;
    const endMin = startMin + durationMinutes;

    const spanHasBookedSlot = withMin.some(o => o.__min >= startMin && o.__min < endMin && o.isBooked);
    const busyWindows = windowsFor(busyWindowsByInterviewer, slot.interviewerId);
    const usable = !spanHasBookedSlot && !overlapsBusyWindow(slot.date, startMin, durationMinutes, busyWindows);

    const { __min, ...clean } = slot;
    kept.push(usable ? clean : { ...clean, isBooked: true });
    blockedUntil = endMin;
  }
  return kept;
}

// Same as above but for a flat list spanning multiple interviewers/dates —
// groups by (interviewerId, date) first so one interviewer's slots never
// consume another's.
export function collapseSlotsByDurationGrouped(slots, durationMinutes, busyWindowsByInterviewer = new Map()) {
  const groups = new Map();
  for (const s of slots) {
    const key = `${s.interviewerId}|${s.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const group of groups.values()) {
    out.push(...collapseSlotsByDuration(group, durationMinutes, busyWindowsByInterviewer));
  }
  return out;
}

// Merges per-interviewer collapsed slots (collapseSlotsByDurationGrouped)
// down to one entry per (date, time) — multiple interviewers offering the
// same start time used to render as one button PER interviewer, so a
// popular time (e.g. 5 panelists all free at 9:00 AM) showed up repeated
// 5 times, mostly disabled once a few got booked. That was especially
// confusing once panelist identity stopped being shown to the candidate at
// all (InlineSlotPicker.jsx, SchedulePage.jsx) — the repeats looked like a
// glitch, not 5 distinct options. Now that time shows once, and only goes
// from pickable to blocked once EVERY interviewer offering it is booked —
// not the moment the first one is. When still open, the merged slot points
// at whichever underlying interviewer slot is free, so booking it behaves
// exactly as if that one interviewer's slot had been picked directly.
export function mergeSlotsAcrossInterviewers(slots) {
  const byKey = new Map();
  for (const s of slots) {
    const key = `${s.date}|${s.time}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  return [...byKey.values()]
    .map(group => {
      const open = group.find(s => !s.isBooked);
      return open ? { ...open } : { ...group[0], isBooked: true };
    })
    .sort((a, b) => compareTimeLabels(a.time, b.time));
}

// Used by displays that show every raw slot individually rather than
// collapsing by duration (Slot Overview) — a slot is "really" booked if
// either its own isBooked flag says so, or its start time falls inside a
// real interview's busy window (covers a manually-scheduled interview that
// has no matching availability slot doc at all, which is the common case).
export function isSlotEffectivelyBooked(slot, busyWindowsByInterviewer) {
  if (slot.isBooked) return true;
  const startMin = timeToMinutes(slot.time);
  const busyWindows = windowsFor(busyWindowsByInterviewer, slot.interviewerId);
  return busyWindows.some(w => w.date === slot.date && startMin >= w.startMin && startMin < w.endMin);
}
