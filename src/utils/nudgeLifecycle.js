/**
 * Candidate nudge lifecycle status — computed live from a ScheduleInvite
 * (+ its linked Interview, if one exists) rather than stored/persisted.
 * Storing it would mean actively keeping it in sync every time an
 * interview's status changes anywhere in the app (cancel, no-show,
 * feedback-complete...); deriving it here means it can never drift.
 *
 * Values match <Badge>'s existing snake_case key convention (src/components/Badge.jsx)
 * — "scheduled"/"completed"/"cancelled"/"no_show" are the EXACT same keys Badge
 * already renders for Interview statuses, reused as-is rather than duplicated
 * under a new name.
 */

export const LIFECYCLE_STATUS = {
  NUDGE_SENT:           "nudge_sent",
  REMINDER_1_SENT:      "reminder_1_sent",
  REMINDER_2_SENT:      "reminder_2_sent",
  NO_RESPONSE:          "no_response",
  SLOT_BOOKED:          "slot_booked",
  INTERVIEW_SCHEDULED:  "scheduled",
  INTERVIEW_COMPLETED:  "completed",
  INTERVIEW_CANCELLED:  "cancelled",
  NO_SHOW:              "no_show",
};

export const LIFECYCLE_LABELS = {
  [LIFECYCLE_STATUS.NUDGE_SENT]:          "Nudge Sent",
  [LIFECYCLE_STATUS.REMINDER_1_SENT]:     "Reminder 1 Sent",
  [LIFECYCLE_STATUS.REMINDER_2_SENT]:     "Reminder 2 Sent",
  [LIFECYCLE_STATUS.NO_RESPONSE]:         "No Response After 2 Reminders",
  [LIFECYCLE_STATUS.SLOT_BOOKED]:         "Slot Booked",
  [LIFECYCLE_STATUS.INTERVIEW_SCHEDULED]: "Interview Scheduled",
  [LIFECYCLE_STATUS.INTERVIEW_COMPLETED]: "Interview Completed",
  [LIFECYCLE_STATUS.INTERVIEW_CANCELLED]: "Interview Cancelled",
  [LIFECYCLE_STATUS.NO_SHOW]:             "No Show",
};

// Statuses that roll up into the "Pending Slot Booking" summary metric —
// candidate hasn't booked yet, but we haven't given up on them either.
const AWAITING_BOOKING = new Set([
  LIFECYCLE_STATUS.NUDGE_SENT,
  LIFECYCLE_STATUS.REMINDER_1_SENT,
  LIFECYCLE_STATUS.REMINDER_2_SENT,
]);

export function isAwaitingBooking(lifecycleStatus) {
  return AWAITING_BOOKING.has(lifecycleStatus);
}

// Statuses that represent a closed-out candidate — nothing further will
// happen automatically, so these count as a "Final Outcome" in reporting.
const FINAL_OUTCOMES = new Set([
  LIFECYCLE_STATUS.INTERVIEW_COMPLETED,
  LIFECYCLE_STATUS.INTERVIEW_CANCELLED,
  LIFECYCLE_STATUS.NO_SHOW,
  LIFECYCLE_STATUS.NO_RESPONSE,
]);

export function isFinalOutcome(lifecycleStatus) {
  return FINAL_OUTCOMES.has(lifecycleStatus);
}

/** Latest of sentAt/reminder1SentAt/reminder2SentAt — "Last Nudge Date". */
export function lastNudgeAt(invite) {
  return [invite.sentAt, invite.reminder1SentAt, invite.reminder2SentAt]
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

/**
 * @param {object} invite - a ScheduleInvite
 * @param {object|null} interview - the linked Interview (invite.interviewId), if any
 * @returns {string} one of LIFECYCLE_STATUS's values
 */
export function deriveLifecycleStatus(invite, interview) {
  if (interview) {
    if (interview.status === "completed") return LIFECYCLE_STATUS.INTERVIEW_COMPLETED;
    if (interview.status === "no_show")   return LIFECYCLE_STATUS.NO_SHOW;
    if (interview.status === "cancelled" || interview.status === "declined") {
      return LIFECYCLE_STATUS.INTERVIEW_CANCELLED;
    }
    return LIFECYCLE_STATUS.INTERVIEW_SCHEDULED; // pending_acceptance / scheduled
  }

  if (invite.status === "cancelled") return LIFECYCLE_STATUS.INTERVIEW_CANCELLED;
  if (invite.status === "pending_confirmation") return LIFECYCLE_STATUS.SLOT_BOOKED;
  if (invite.noResponseFlaggedAt) return LIFECYCLE_STATUS.NO_RESPONSE;
  if (invite.reminder2SentAt) return LIFECYCLE_STATUS.REMINDER_2_SENT;
  if (invite.reminder1SentAt) return LIFECYCLE_STATUS.REMINDER_1_SENT;
  return LIFECYCLE_STATUS.NUDGE_SENT;
}

/** Builds the requirement's 10-metric summary from { status, invite } rows. */
export function summarizeLifecycle(rows) {
  const counts = {
    totalNudgesSent:     rows.length,
    reminder1Sent:       0,
    reminder2Sent:       0,
    slotsBooked:         0,
    interviewsScheduled: 0,
    interviewsCompleted: 0,
    noShows:             0,
    cancelledInterviews: 0,
    pendingSlotBooking:  0,
    noResponse:          0,
  };
  for (const { status, invite } of rows) {
    if (invite.reminder1SentAt) counts.reminder1Sent++;
    if (invite.reminder2SentAt) counts.reminder2Sent++;
    if (isAwaitingBooking(status)) counts.pendingSlotBooking++;
    if (status === LIFECYCLE_STATUS.NO_RESPONSE) counts.noResponse++;
    if (status === LIFECYCLE_STATUS.SLOT_BOOKED) counts.slotsBooked++;
    if (status === LIFECYCLE_STATUS.INTERVIEW_SCHEDULED) counts.interviewsScheduled++;
    if (status === LIFECYCLE_STATUS.INTERVIEW_COMPLETED) counts.interviewsCompleted++;
    if (status === LIFECYCLE_STATUS.NO_SHOW) counts.noShows++;
    if (status === LIFECYCLE_STATUS.INTERVIEW_CANCELLED) counts.cancelledInterviews++;
  }
  return counts;
}
