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

// Each interview doc IS one "try" at a template — this numbers them in the
// order they were actually meant to happen (by scheduled date/time, falling
// back to when the record was created for ones that never got a date), NOT
// the formal "Nth attempt" label used for attempt-limit messaging elsewhere
// (which only counts COMPLETED tries) — a candidate who booked, no-showed,
// then booked again should see that second one as their "2nd try" here even
// though it's still their 1st real attempt for limit purposes.
export function buildCandidateTimeline(interviews) {
  const byTemplate = new Map();
  interviews.forEach(iv => {
    const key = iv.templateId || "(no template)";
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key).push(iv);
  });

  const tryNumberById = new Map();
  byTemplate.forEach(list => {
    const sortKey = iv => `${iv.scheduledDate || iv.createdAt || ""} ${iv.scheduledTime || ""}`;
    [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .forEach((iv, i) => tryNumberById.set(iv.id, i + 1));
  });

  return interviews
    .map(iv => ({ ...iv, tryNumber: tryNumberById.get(iv.id) || 1 }))
    // Most recent first — same convention as Notifications/My Interviews.
    .sort((a, b) => {
      const ak = `${a.scheduledDate || a.createdAt || ""} ${a.scheduledTime || ""}`;
      const bk = `${b.scheduledDate || b.createdAt || ""} ${b.scheduledTime || ""}`;
      return bk.localeCompare(ak);
    });
}

const CANCELLED_BY_LABEL = {
  candidate: "You",
  admin: "Admin",
  interviewer: "Interviewer",
};

// One line summarizing how a timeline entry resolved, for the muted
// secondary text under each row — kept separate from the status badge
// itself so the badge can stay short (reusing STATUS_LABEL) while this
// carries the "who/why/what's next" detail.
export function timelineDetail(iv) {
  if (iv.status === "cancelled") {
    const by = CANCELLED_BY_LABEL[iv.cancelledBy] || "Someone";
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
