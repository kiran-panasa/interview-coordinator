// Confirms a candidate's own self-book slot selection immediately — no
// admin review step. This is the self-book counterpart to
// CandidateSchedulingTab.jsx's handleConfirmBooking (admin-triggered
// confirm for the Nudge email-link flow, which still keeps its manual
// review step — only self-book, from the authenticated Student Dashboard,
// skips it), and intentionally mirrors that function's logic closely so
// both paths stay in sync: create the Interview record straight at
// "scheduled" (the interviewer isn't asked to Accept/Decline here either —
// the slot was already theirs to begin with), generate the Meet link, and
// notify the interviewer + candidate by email exactly as admin-confirmed
// bookings already do.
//
// Called right after bookSlotForCandidate (api/scheduling.ts) succeeds, so
// `invite` is the ScheduleInvite doc as it now stands — already carrying
// bookedInterviewerId/bookedSlotId/bookedDate/bookedTime.
import {
  getUsersByIds, getTemplate, createInterview, updateScheduleInvite,
  logInviteHistory, createNotification, getPreInterviewResources,
  getInterview, markInterviewCancelled, updateInterview, freeSlotsForInterview,
  getScheduleInvite,
} from "../api/firestore";
import { formatDate } from "../utils/dates";
import { callAppsScript } from "../lib/appsScript";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

// Best-effort: cancels the OLD interview this booking is rescheduling,
// crediting the candidate (not "admin") as the one who cancelled it, with
// the same "Rescheduled by candidate — picked a new slot on ..." reason
// admin-confirmed reschedules already use — never blocks confirming the
// NEW booking if any of this fails.
async function cancelReplacedInterview(replacingInterviewId, newInterviewId, bookedDate, bookedTime) {
  try {
    const oldIv = await getInterview(replacingInterviewId);
    if (oldIv && oldIv.status !== "cancelled") {
      if (oldIv.eventId) {
        await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, { action: "cancel", eventId: oldIv.eventId }).catch(() => {});
      }
      if (oldIv.interviewerId && oldIv.scheduledDate && oldIv.scheduledTime) {
        await freeSlotsForInterview(oldIv.interviewerId, oldIv.scheduledDate, oldIv.scheduledTime, oldIv.duration).catch(() => {});
      }
      await markInterviewCancelled(replacingInterviewId, {
        reason: `Rescheduled by candidate — picked a new slot on ${formatDate(bookedDate)} at ${bookedTime}.`,
        cancelledBy: "candidate",
      });
      if (APPS_SCRIPT_URL && oldIv.interviewerEmail) {
        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action:  "sendEmail",
          subject: `Interview Cancelled: ${oldIv.round || oldIv.templateName || "Interview"}`,
          body:
            "Hi {{name}},\n\nThe following interview has been cancelled — the candidate rescheduled to a new slot:\n\n" +
            `Candidate: ${oldIv.candidateName || "—"}\nRound: ${oldIv.round || oldIv.templateName || "Interview"}\n` +
            `Date: ${formatDate(oldIv.scheduledDate)}\nTime: ${oldIv.scheduledTime}\n\n` +
            "They'll be interviewed at the new time instead — you may be assigned again depending on availability.\n\n— NxtWave Team",
          recipients: [{ email: oldIv.interviewerEmail, name: oldIv.interviewerName || "Panelist" }],
        }).catch(() => {});
      }
    }
    await updateInterview(replacingInterviewId, { rescheduledTo: newInterviewId });
  } catch (e) {
    console.error("Failed to cancel/link the rescheduled-from interview:", e);
  }
}

// A plain cancel — the candidate isn't rebooking anything right now (the
// "I'm not free for any slot this week, I'll come back next week" case —
// see the Book an Interview FAQ), just giving up the one they already hold.
// Unlike cancelReplacedInterview above, this is the direct result of a user
// action (the Cancel Interview modal), so it throws on failure instead of
// swallowing it — the caller shows a real error rather than silently doing
// nothing.
export async function cancelInterviewByCandidate(interviewId, reason) {
  const iv = await getInterview(interviewId);
  if (!iv) throw new Error("This interview could not be found.");
  if (iv.status === "cancelled") return; // already cancelled — nothing to do

  if (iv.eventId) {
    await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, { action: "cancel", eventId: iv.eventId }).catch(() => {});
  }
  if (iv.interviewerId && iv.scheduledDate && iv.scheduledTime) {
    await freeSlotsForInterview(iv.interviewerId, iv.scheduledDate, iv.scheduledTime, iv.duration).catch(() => {});
  }
  await markInterviewCancelled(interviewId, { reason, cancelledBy: "candidate" });
  if (APPS_SCRIPT_URL && iv.interviewerEmail) {
    callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
      action:  "sendEmail",
      subject: `Interview Cancelled: ${iv.round || iv.templateName || "Interview"}`,
      body:
        "Hi {{name}},\n\nThe following interview has been cancelled by the candidate:\n\n" +
        `Candidate: ${iv.candidateName || "—"}\nRound: ${iv.round || iv.templateName || "Interview"}\n` +
        `Date: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
        `Reason: ${reason}\n\n— NxtWave Team`,
      recipients: [{ email: iv.interviewerEmail, name: iv.interviewerName || "Panelist" }],
    }).catch(() => {});
  }
}

// Takes the invite's id, not the invite object itself, and re-fetches it
// fresh — called right after bookSlotForCandidate's transaction commits, so
// this is the only way to see the bookedInterviewerId/bookedSlotId/
// bookedDate/bookedTime it just wrote, on top of whatever selfBookStart's
// thin client-side draft (StudentDashboardPage's selfBookDraft) was missing
// to begin with (candidateId/candidateEmail/round/etc. only ever existed on
// the real Firestore doc, never in that draft).
//
// Returns { meetLink, hostManagementWarning } on success — callers decide
// their own UI feedback, this never shows a toast itself (it's not a
// component). Throws on a real failure (missing interviewer, scheduling
// error) — same as bookSlotForCandidate, for the caller to catch.
export async function confirmSelfBooking(inviteId) {
  const invite = await getScheduleInvite(inviteId);
  if (!invite) throw new Error("This booking could not be found — please try again.");

  const [ivr] = await getUsersByIds([invite.bookedInterviewerId]);
  if (!ivr?.email || !invite.candidateEmail) {
    throw new Error("Missing interviewer or candidate email — cannot schedule.");
  }
  const tmpl = invite.templateId ? await getTemplate(invite.templateId) : null;
  const roundLabel = invite.round || tmpl?.name || "Interview";
  const durationMinutes = invite.duration || 60;

  const interviewId = await createInterview({
    candidateId:      invite.candidateId,
    candidateName:    invite.candidateName,
    candidateEmail:   invite.candidateEmail,
    interviewerId:    invite.bookedInterviewerId,
    interviewerName:  ivr.displayName || ivr.email || "",
    interviewerEmail: ivr.email || "",
    scheduledDate:    invite.bookedDate,
    scheduledTime:    invite.bookedTime,
    duration:         durationMinutes,
    round:            roundLabel,
    templateId:       invite.templateId || "",
    templateName:     invite.templateName || "",
    // Candidate slots come from the panelist's own published availability —
    // skip the interviewer's separate manual accept/decline step, same as
    // the admin-confirmed path.
    status:           "scheduled",
    // Lets the Interviews page's "Booked via" filter and badge isolate
    // these from admin-scheduled/Nudge-confirmed interviews — see
    // InterviewsPage.jsx.
    bookingSource:    "self_book",
  });
  await updateScheduleInvite(invite.id, { status: "confirmed", interviewId });
  logInviteHistory(invite.id, "confirmed", "Booking auto-confirmed by candidate — no admin review needed for self-book.").catch(() => {});

  if (invite.replacingInterviewId) {
    // Fire-and-forget, deliberately not awaited — same as the admin path —
    // so a slow cancel-the-old-one step never delays the candidate seeing
    // their new booking confirmed.
    cancelReplacedInterview(invite.replacingInterviewId, interviewId, invite.bookedDate, invite.bookedTime);
  }

  const { scheduleInterviewMeet } = await import("../api/interviews");
  const result = await scheduleInterviewMeet(interviewId);

  if (result.inProgress) return { meetLink: "", inProgress: true };
  const alreadyDone = !!result.alreadyScheduled;

  if (!alreadyDone && ivr.id) {
    createNotification({
      type:           "interview_approval",
      recipientId:    ivr.id,
      recipientEmail: ivr.email,
      interviewId,
      candidateName:  invite.candidateName,
      message:        `You have a new interview with ${invite.candidateName} on ${formatDate(invite.bookedDate)} at ${invite.bookedTime}.`,
      status:         "unread",
    }).catch(() => {});
  }
  if (!alreadyDone && APPS_SCRIPT_URL && ivr.email) {
    callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
      action:  "sendEmail",
      subject: "Action Required: Interview Assigned",
      body:
        `Hi ${ivr.displayName || ivr.email},\n\nYou have a new interview scheduled:\n\n` +
        `Candidate: ${invite.candidateName || "—"}\nRound: ${roundLabel}\n` +
        `Date: ${formatDate(invite.bookedDate)}\nTime: ${invite.bookedTime}\nDuration: ${durationMinutes} minutes\n` +
        (result?.meetLink ? `Meeting Link: ${result.meetLink}\n` : "") +
        "\nThank you.",
      recipients: [{ email: ivr.email, name: ivr.displayName || ivr.email }],
    }).catch(() => {});
  }

  if (!alreadyDone && APPS_SCRIPT_URL && invite.candidateEmail) {
    const resources = await getPreInterviewResources().catch(() => null);
    const instructionLines = [];
    if (resources?.videoGuideUrl) {
      instructionLines.push(`${resources.videoGuideLabel || "Video Setup Guide"}: ${resources.videoGuideUrl}`);
    }
    (resources?.documents || [])
      .filter(d => d.type === "instruction" && d.url)
      .forEach(d => instructionLines.push(`${d.label || "Interview Instructions"}: ${d.url}`));
    const referenceLines = (resources?.documents || [])
      .filter(d => d.type === "reference" && d.url)
      .map(d => `${d.label || "Reference Document"}: ${d.url}`);

    const instructionsBlock = instructionLines.length
      ? `\nPlease review the following before joining your interview:\n${instructionLines.map(l => `• ${l}`).join("\n")}\n`
      : "";
    const referenceBlock = referenceLines.length
      ? `\nAdditional Reference Documents:\n${referenceLines.map(l => `• ${l}`).join("\n")}\n`
      : "";

    callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
      action:  "sendEmail",
      subject: `Interview Confirmed — ${roundLabel}`,
      body:
        `Hi ${invite.candidateName},\n\nYour interview has been confirmed:\n\n` +
        `Round: ${roundLabel}\nDate: ${formatDate(invite.bookedDate)}\nTime: ${invite.bookedTime}\n` +
        `Your interview has been scheduled for ${durationMinutes} minutes.\n` +
        (result?.meetLink ? `Meeting Link: ${result.meetLink}\n` : "") +
        instructionsBlock + referenceBlock +
        "\nNxtWave Interview Team",
      recipients: [{ email: invite.candidateEmail, name: invite.candidateName }],
    }).catch(() => {});
  }

  return { meetLink: result?.meetLink || "", hostManagementWarning: result?.hostManagementWarning };
}
