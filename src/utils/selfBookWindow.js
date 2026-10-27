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
