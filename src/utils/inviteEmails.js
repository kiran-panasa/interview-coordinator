import { callAppsScript } from "../lib/appsScript";
import { formatDate } from "./dates";
import { getPreInterviewResources } from "../api/firestore";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

// Sends the two confirmation emails for "this interview now has a Meet
// link" — the interviewer's "Action Required" email and the candidate's
// "Interview Confirmed" email (with admin-managed pre-interview resources
// attached; interviewers never see those). Shared by every path that can
// attach a Meet link to an interview, so wording/content never drifts
// between them: the admin's "Send Invite"/"Retry Send Invite" action,
// "Add Meet Link Manually", a candidate self-booking a slot
// (handleConfirmBooking in CandidateSchedulingTab.jsx), and an interviewer
// accepting an admin-scheduled interview (handleAccept in InterviewDetail.jsx).
export async function sendInviteConfirmationEmails(iv, meetLink) {
  if (iv.interviewerEmail) {
    callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
      action:  "sendEmail",
      subject: "Action Required: Interview Assigned",
      body:
        `Hi ${iv.interviewerName || "there"},\n\nYour interview meeting link is ready:\n\n` +
        `Candidate: ${iv.candidateName || "—"}\nRound: ${iv.round || iv.templateName || "Interview"}\n` +
        `Date: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
        `Meeting Link: ${meetLink}\n\n` +
        `Thank you.`,
      recipients: [{ email: iv.interviewerEmail, name: iv.interviewerName || iv.interviewerEmail }],
    }).catch(() => {});
  }

  // Candidate confirmation — separate from the interviewer email above, and
  // the only place the admin-managed pre-interview resources get attached.
  if (iv.candidateEmail) {
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
      subject: `Interview Confirmed — ${iv.round || iv.templateName || "Interview"}`,
      body:
        `Hi ${iv.candidateName || "there"},\n\nYour interview has been confirmed:\n\n` +
        `Round: ${iv.round || iv.templateName || "Interview"}\nDate: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
        `Meeting Link: ${meetLink}\n` +
        instructionsBlock + referenceBlock +
        `\nNxtWave Interview Team`,
      recipients: [{ email: iv.candidateEmail, name: iv.candidateName || iv.candidateEmail }],
    }).catch(() => {});
  }
}
