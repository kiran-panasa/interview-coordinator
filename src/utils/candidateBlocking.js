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
export function computeBlocked(template, tid, candidate, counts) {
  if (!template || !counts) return { blocked: false, blockReason: "" };
  const maxAttempts = effectiveMaxAttempts(template.maxAttempts, candidate.attemptOverrides?.[tid]);
  if (maxAttempts != null && counts.attemptsUsed >= maxAttempts) {
    return { blocked: true, blockReason: `Attempt limit reached (${counts.attemptsUsed}/${maxAttempts})` };
  }
  const maxNoShows = effectiveMaxNoShows(template.maxNoShows, candidate.noShowOverrides?.[tid]);
  if (maxNoShows != null && counts.noShowCount >= maxNoShows) {
    return { blocked: true, blockReason: `No-show limit reached (${counts.noShowCount}/${maxNoShows})` };
  }
  const maxCancellations = effectiveMaxCancellations(template.maxCancellations, candidate.cancelOverrides?.[tid]);
  if (maxCancellations != null && counts.cancelCount >= maxCancellations) {
    return { blocked: true, blockReason: `Cancellation limit reached (${counts.cancelCount}/${maxCancellations})` };
  }
  return { blocked: false, blockReason: "" };
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
