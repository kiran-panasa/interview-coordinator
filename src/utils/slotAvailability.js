import { compareTimeLabels, timeToMinutes } from "./dates";

// Given one interviewer's raw 30-min-granularity availability slots for one
// date, returns only the ones that can actually be offered as independent
// interview start times for a `durationMinutes`-long interview — i.e. a
// slot whose start falls inside an earlier KEPT slot's [start, start+duration)
// window is dropped, since booking that earlier slot would occupy the
// interviewer through that whole window.
//
// Example: raw slots 6:30/7:00/7:30/8:00 PM with a 90-minute duration ->
// 6:30 PM is kept (occupies 6:30-8:00), 7:00 and 7:30 fall inside that
// window and are dropped, 8:00 PM starts exactly when it ends so it's kept
// too. Result: [6:30 PM, 8:00 PM].
//
// A BOOKED slot is still kept (never hidden — an admin/candidate needs to
// see it's taken) but it blocks the same way: any later raw slot inside its
// duration window is dropped too, since the interviewer is genuinely busy
// then regardless of whether the slot they're now busy for was itself
// pre-filtered.
export function collapseSlotsByDuration(slots, durationMinutes) {
  const sorted = [...slots].sort((a, b) => compareTimeLabels(a.time, b.time));
  const kept = [];
  let blockedUntil = -Infinity;
  for (const slot of sorted) {
    const startMin = timeToMinutes(slot.time);
    if (startMin < blockedUntil) continue;
    kept.push(slot);
    blockedUntil = startMin + durationMinutes;
  }
  return kept;
}

// Same as above but for a flat list spanning multiple interviewers/dates —
// groups by (interviewerId, date) first so one interviewer's slots never
// consume another's.
export function collapseSlotsByDurationGrouped(slots, durationMinutes) {
  const groups = new Map();
  for (const s of slots) {
    const key = `${s.interviewerId}|${s.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const group of groups.values()) {
    out.push(...collapseSlotsByDuration(group, durationMinutes));
  }
  return out;
}
