// Pure date-math for the self-book rule: same-day booking is never
// allowed, and the next bookable day depends on a daily cutoff time (admin-
// configurable, Settings -> General -> "Self-Book Window") — before the
// cutoff, tomorrow is bookable; at/after it, tomorrow closes too and the
// earliest becomes the day after. Shared between the client (the countdown
// banner on the Student Dashboard) and api/sso-handler.js (the actual
// enforcement, computing dateRangeStart for self-book/reschedule), so both
// always agree on the exact same moment — plain .js, not dates.ts/.ts,
// specifically so it stays importable from the serverless function without
// a TS build step, same reasoning as src/constants/templateAttempts.js.
export const DEFAULT_SELF_BOOK_CUTOFF_TIME = "17:30"; // 5:30 PM IST

function addDaysIso(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// `now` — the real current instant (a Date). All interview/booking times in
// this app are IST regardless of the viewer's own machine/browser timezone
// (same assumption toInterviewDateTime in dates.ts makes) — shifting `now`
// by IST's fixed +5:30 offset before reading its UTC calendar date is what
// makes "today" mean the same calendar day in India no matter where this
// runs (a Vercel function in UTC, a browser in any other timezone).
export function computeSelfBookWindow(now, cutoffTime = DEFAULT_SELF_BOOK_CUTOFF_TIME) {
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayIso = istNow.toISOString().slice(0, 10);
  const cutoffInstant = new Date(`${todayIso}T${cutoffTime}:00+05:30`);
  const pastCutoff = now >= cutoffInstant;
  const earliestDate = addDaysIso(todayIso, pastCutoff ? 2 : 1);
  return { earliestDate, cutoffInstant, pastCutoff, todayIso };
}

// "Fixed cycle" self-book window — the alternative to the rolling window
// above. Instead of a window that slides forward by one day every day (so a
// student who never books always sees a fresh N days, with nothing ever
// actually closing), this anchors the window to a specific day-of-week that
// recurs every 7 days no matter when a template is turned on or looked at —
// e.g. "Sunday to Sunday": everyone sees the same Sun-Sat block, and the
// moment today crosses that Sunday boundary it flips to the next one on its
// own, no cron job needed (it's recomputed fresh from `now` every call).
//
// anchorWeekday: 0 (Sun) - 6 (Sat) — which weekday each week's cycle OPENS on.
// windowDays: how many days from that opening are visible. 7 = a seamless
//   back-to-back weekly cycle (every day belongs to exactly one cycle).
//   Less than 7 (e.g. 5 for "Wed-Sun") leaves a dead gap on the remaining
//   weekdays (Mon-Tue) where nothing is open — the next cycle still only
//   ever opens on the next occurrence of anchorWeekday, 7 days after the
//   current cycle's start, never early. More than 7 shows further ahead
//   than one week; the window still re-anchors the moment the next
//   occurrence of anchorWeekday arrives.
//
// The cutoff time (same Settings -> General -> Self-Book Window setting the
// rolling window uses) still trims the FRONT edge — same-day/after-cutoff
// booking is never allowed even inside an otherwise-open cycle — but never
// moves the cycle's own end boundary, which is what makes it "fixed."
export function computeFixedCycleWindow(now, anchorWeekday, windowDays, cutoffTime = DEFAULT_SELF_BOOK_CUTOFF_TIME) {
  const { earliestDate: cutoffEarliest } = computeSelfBookWindow(now, cutoffTime);
  // The active cycle is picked by where the EARLIEST BOOKABLE date falls,
  // not by today's raw date — otherwise a Saturday visitor (tomorrow =
  // Sunday = the next anchor) would wrongly see "closed" for the last day
  // of a perfectly fine still-open-until-tomorrow cycle, and someone
  // checking the day before a gap-mode cycle reopens (tomorrow = the
  // anchor weekday) would wrongly stay stuck seeing "closed" one day too
  // long. Calendar weekday of a YYYY-MM-DD string is timezone-independent
  // once the string itself is already the correct IST calendar date (as
  // computeSelfBookWindow's earliestDate always is), so this parses it as
  // plain UTC rather than re-shifting by +5:30 a second time.
  const earliestWeekday = new Date(cutoffEarliest + "T00:00:00Z").getUTCDay();
  const diff = (earliestWeekday - anchorWeekday + 7) % 7;
  const cycleStart = addDaysIso(cutoffEarliest, -diff);
  const cycleEnd = addDaysIso(cycleStart, windowDays);
  const nextCycleStart = addDaysIso(cycleStart, 7);
  const dateRangeStart = cutoffEarliest > cycleStart ? cutoffEarliest : cycleStart;
  // Nothing left to book either because today has moved past this cycle's
  // own end (the Mon-Tue "gap" case above) or because the cutoff ate
  // whatever was left of it — both mean the same thing to a student: no
  // slots right now, come back when the next cycle opens.
  const closed = dateRangeStart >= cycleEnd;
  return { cycleStart, cycleEnd, nextCycleStart, dateRangeStart, dateRangeEnd: cycleEnd, closed };
}
