import { getDb } from "../_lib/firebaseAdmin.js";
import { getValidSession } from "../_lib/ssoSession.js";

// Session-gated read of the signed-in student's own data. Deliberately goes
// through firebase-admin here (server-side), not the client Firestore SDK —
// this project's current Firestore rules don't yet scope reads by owner, so
// every SSO-authenticated read should go through an endpoint like this one
// until that's fixed, rather than relying on client-side query scoping.
//
// GET /api/sso/me
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const session = await getValidSession(req);
    if (!session) {
      return res.status(401).json({ error: "no_session" });
    }
    const db = getDb();
    const candidateSnap = await db.collection("candidates").doc(session.candidateId).get();
    if (!candidateSnap.exists) {
      return res.status(404).json({ error: "candidate_not_found" });
    }
    const candidate = candidateSnap.data();

    // Resolve the candidate's Program name and assigned Template names for
    // the dashboard's "My Details" section — Candidate only stores ids.
    const [programSnap, templateSnaps] = await Promise.all([
      candidate.program ? db.collection("programs").doc(candidate.program).get() : Promise.resolve(null),
      Promise.all((candidate.templateIds || []).map(tid => db.collection("interviewTemplates").doc(tid).get())),
    ]);
    const programName = programSnap?.exists ? programSnap.data().name : (candidate.program || "");
    const templates = templateSnaps
      .filter(s => s.exists)
      .map(s => ({ id: s.id, name: s.data().name, durationMinutes: s.data().durationMinutes || 60 }));

    // Invites the student can still act on — not yet confirmed/cancelled —
    // so the dashboard can offer "Select Slot" straight through to the
    // existing, already-proven booking flow (SchedulePage.jsx) instead of
    // requiring a separate emailed link.
    const invitesSnap = await db.collection("scheduleInvites")
      .where("candidateId", "==", session.candidateId)
      .get();
    const pendingInvites = invitesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(inv => !["confirmed", "cancelled"].includes(inv.status))
      .map(inv => ({
        id: inv.id,
        inviteToken:    inv.inviteToken || "",
        templateName:   inv.templateName || "",
        round:          inv.round || "",
        status:         inv.status,
        dateRangeStart: inv.dateRangeStart || "",
        dateRangeEnd:   inv.dateRangeEnd || "",
      }));

    // Sorted here in JS rather than via Firestore's orderBy — a compound
    // where+orderBy on different fields needs a composite index, and this
    // collection has none for candidateId+scheduledDate yet. Fine at a
    // single candidate's interview-count scale.
    const interviewsSnap = await db.collection("interviews")
      .where("candidateId", "==", session.candidateId)
      .get();
    const interviews = interviewsSnap.docs
      .map(d => {
        const iv = d.data();
        // Only what a student needs to see — never leak internal fields
        // like interviewer contact details, admin notes, or scoring data.
        return {
          id: d.id,
          templateName:  iv.templateName  || "",
          round:         iv.round         || "",
          scheduledDate: iv.scheduledDate || "",
          scheduledTime: iv.scheduledTime || "",
          duration:      iv.duration      || 60,
          status:        iv.status,
          meetLink:      iv.meetLink      || "",
        };
      })
      .sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));

    return res.status(200).json({
      candidate: { name: candidate.name, email: candidate.email, uid: candidate.uid || "", program: programName },
      templates,
      interviews,
      pendingInvites,
    });
  } catch (err) {
    console.error("sso/me error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
