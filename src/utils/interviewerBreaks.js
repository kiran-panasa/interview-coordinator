// "Two interviews back-to-back is fine; after that, the interviewer gets a
// break before a third can be booked" — this computes the EXTRA synthetic
// busy windows that enforce that, from an interviewer's real busy windows
// (their actual booked interviews). These get merged into
// busyWindowsByInterviewer (see getAvailableSlots in api/availability.ts)
// so the break period is simply never offered as a bookable start time —
// same mechanism as a real interview blocking overlapping slots, just a
// synthetic window instead of a real one.
//
// "Back-to-back" means the next interview's start is EXACTLY the previous
// one's end — no gap at all. A run of `afterCount` of these in a row gets a
// break window of `breakMinutes` inserted right after it; the run then
// resets, so the pattern repeats through the day (2 on, break, 2 on, break,
// ...) rather than demanding a break only once total.
export const DEFAULT_BREAK_AFTER_COUNT = 2;
export const DEFAULT_BREAK_MINUTES = 30;

export function injectConsecutiveBreaks(busyWindows, afterCount = DEFAULT_BREAK_AFTER_COUNT, breakMinutes = DEFAULT_BREAK_MINUTES) {
  if (!busyWindows?.length || !afterCount || !breakMinutes) return busyWindows || [];

  const byDate = new Map();
  for (const w of busyWindows) {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(w);
  }

  const extraWindows = [];
  for (const [date, windows] of byDate) {
    const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
    let runLength = 0;
    let runEnd = null;
    for (const w of sorted) {
      runLength = (runEnd !== null && w.startMin === runEnd) ? runLength + 1 : 1;
      runEnd = w.endMin;
      if (runLength === afterCount) {
        extraWindows.push({ date, startMin: runEnd, endMin: runEnd + breakMinutes });
        runLength = 0; // next window (if truly contiguous) starts a fresh run after this break
      }
    }
  }
  return extraWindows.length ? [...busyWindows, ...extraWindows] : busyWindows;
}
