import { DEFAULT_NO_SHOW_LIMIT, DEFAULT_CANCEL_LIMIT } from "../constants/templateAttempts";

// Shared with CandidatesPage.jsx (Blocked status filter) and
// ScheduleInterviewModal.jsx (admin scheduling warning) — mirrors the exact
// same override precedence and defaults as the real enforcement in
// api/sso-handler.js's resolveSelfBookTarget, just computed client-side from
// already-fetched data instead of at booking time.
export function effectiveMaxAttempts(templateMaxAttempts, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  return templateMaxAttempts ?? null;
}
export function effectiveMaxNoShows(templateMaxNoShows, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  if (templateMaxNoShows === 0) return null;
  if (typeof templateMaxNoShows === "number" && templateMaxNoShows > 0) return templateMaxNoShows;
  return DEFAULT_NO_SHOW_LIMIT;
}
export function effectiveMaxCancellations(templateMaxCancellations, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  if (templateMaxCancellations === 0) return null;
  if (typeof templateMaxCancellations === "number" && templateMaxCancellations > 0) return templateMaxCancellations;
  return DEFAULT_CANCEL_LIMIT;
}

// Checked in the same order the dashboard checks it — first exhausted limit
// wins, since that's the one message a student actually sees there too.
// blockKind tells CandidatesPage.jsx which of the three this actually is —
// "attempt" is a normal, successful outcome (they finished what they were
// allowed to) and gets shown as "Closed", not the alarm-red "Blocked" that
// "no_show"/"cancel" still get.
//
// latestStatus (optional — only CandidatesPage.jsx's display passes it,
// ScheduleInterviewModal's booking-time warning doesn't) suppresses the
// result entirely while this candidate has a genuinely in-flight interview
// for this template ("scheduled"/"pending_acceptance") — showing "Blocked"
// or "Closed" next to a status that says they're currently scheduled reads
// as a contradiction, and whatever that interview resolves to will update
// the real picture anyway.
const IN_FLIGHT_STATUSES = ["scheduled", "pending_acceptance"];
export function computeBlocked(template, tid, candidate, counts, latestStatus) {
  if (!template || !counts) return { blocked: false, blockReason: "", blockKind: null };
  if (latestStatus != null && IN_FLIGHT_STATUSES.includes(latestStatus)) {
    return { blocked: false, blockReason: "", blockKind: null };
  }
  const maxAttempts = effectiveMaxAttempts(template.maxAttempts, candidate.attemptOverrides?.[tid]);
  if (maxAttempts != null && counts.attemptsUsed >= maxAttempts) {
    return { blocked: true, blockReason: `Attempt limit reached (${counts.attemptsUsed}/${maxAttempts})`, blockKind: "attempt" };
  }
  const maxNoShows = effectiveMaxNoShows(template.maxNoShows, candidate.noShowOverrides?.[tid]);
  if (maxNoShows != null && counts.noShowCount >= maxNoShows) {
    return { blocked: true, blockReason: `No-show limit reached (${counts.noShowCount}/${maxNoShows})`, blockKind: "no_show" };
  }
  const maxCancellations = effectiveMaxCancellations(template.maxCancellations, candidate.cancelOverrides?.[tid]);
  if (maxCancellations != null && counts.cancelCount >= maxCancellations) {
    return { blocked: true, blockReason: `Cancellation limit reached (${counts.cancelCount}/${maxCancellations})`, blockKind: "cancel" };
  }
  return { blocked: false, blockReason: "", blockKind: null };
}

// Same "only a COMPLETED interview advances attemptsUsed" rule the student
// dashboard itself counts against its limits — no_show/candidate-cancelled
// never advance attemptsUsed but still count toward their own limits.
export function countAttemptsNoShowsCancellations(interviews) {
  let attemptsUsed = 0, noShowCount = 0, cancelCount = 0;
  for (const iv of interviews) {
    if (iv.status === "completed") attemptsUsed++;
    else if (iv.status === "no_show") noShowCount++;
    else if (iv.status === "cancelled" && iv.cancelledBy === "candidate") cancelCount++;
  }
  return { attemptsUsed, noShowCount, cancelCount };
}
