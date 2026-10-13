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
      candidate: { name: candidate.name, email: candidate.email, uid: candidate.uid || "", program: candidate.program || "" },
      interviews,
    });
  } catch (err) {
    console.error("sso/me error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
