// Shared by the Student Dashboard's own "History" tab and the admin
// Candidates page's per-candidate History modal — same underlying question
// ("what actually happened across every interview this candidate has ever
// had"), just two different audiences looking at it, so the logic lives in
// one place instead of being reimplemented twice and drifting apart.
//
// No new Firestore fields or writes — this is purely a read-side annotation
// over the candidate's existing interview documents (createdAt, scheduledDate/
// scheduledTime, status, cancelledBy, cancelReason, rescheduledTo), which
// already carry everything needed to reconstruct the story.

// Same attempt-number rule InterviewsPage.jsx already uses (see its
// attemptLabelByInterviewId effect): the number only advances once an
// attempt actually COMPLETES — a cancelled/no-show/declined booking is just
// a retry of the SAME attempt, not a new one, so it shares that attempt's
// number instead of bumping it. Sorted chronologically per template first
// (by scheduled date/time, falling back to when the record was created for
// ones that never got a date) so the numbering follows the real order
// things happened in, then re-sorted newest-first for display below.
export function buildCandidateTimeline(interviews) {
  const byTemplate = new Map();
  interviews.forEach(iv => {
    const key = iv.templateId || "(no template)";
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key).push(iv);
  });

  const attemptNumberById = new Map();
  byTemplate.forEach(list => {
    const sortKey = iv => `${iv.scheduledDate || iv.createdAt || ""} ${iv.scheduledTime || ""}`;
    let n = 1;
    [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .forEach(iv => {
        attemptNumberById.set(iv.id, n);
        if (iv.status === "completed") n++;
      });
  });

  return interviews
    .map(iv => ({ ...iv, attemptNumber: attemptNumberById.get(iv.id) || 1 }))
    // Most recent first — same convention as Notifications/My Interviews.
    .sort((a, b) => {
      const ak = `${a.scheduledDate || a.createdAt || ""} ${a.scheduledTime || ""}`;
      const bk = `${b.scheduledDate || b.createdAt || ""} ${b.scheduledTime || ""}`;
      return bk.localeCompare(ak);
    });
}

// "candidate" (own self-cancel) is the one blank-cancelledBy ALREADY
// defaults to elsewhere in this app — see StudentDashboardPage.jsx's
// `(!iv.cancelledBy || iv.cancelledBy === "candidate")` check — because
// every cancellation that predates this field being tracked went through
// the candidate's own self-cancel/reschedule path. Reusing that same
// fallback here (instead of a vague "Someone") both matches that existing
// convention and is the historically accurate guess for those older
// records.
function cancelledByLabel(iv, audience) {
  const by = iv.cancelledBy || "candidate";
  if (by === "admin") return "Admin";
  if (by === "interviewer") return "Interviewer";
  return audience === "student" ? "You" : "Candidate";
}

// One line summarizing how a timeline entry resolved, for the muted
// secondary text under each row — kept separate from the status badge
// itself so the badge can stay short (reusing STATUS_LABEL) while this
// carries the "who/why/what's next" detail. `audience` is "student" (the
// Student Dashboard's own History tab — "You" cancelled makes sense there)
// or "admin" (the admin Candidates page's History modal, looking at
// someone else's timeline — "Candidate" instead of "You").
export function timelineDetail(iv, audience = "admin") {
  if (iv.status === "cancelled") {
    const by = cancelledByLabel(iv, audience);
    const reason = iv.cancelReason ? ` — "${iv.cancelReason}"` : "";
    const resched = iv.rescheduledTo ? " · rescheduled to a new slot" : "";
    return `Cancelled by ${by}${reason}${resched}`;
  }
  if (iv.status === "no_show") return "Candidate didn't join — marked No-Show";
  if (iv.status === "declined") return "Interviewer declined — being reassigned/rescheduled";
  if (iv.status === "completed") return "Interview completed";
  if (iv.status === "partially_completed") return "Interview partially completed";
  if (iv.status === "scheduled") return "Upcoming";
  if (iv.status === "pending_acceptance") return "Scheduling in progress";
  return "";
}
