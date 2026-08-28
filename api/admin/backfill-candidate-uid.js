import { getDb } from "../_lib/firebaseAdmin.js";

// One-time, server-side backfill so interviews created BEFORE
// withCandidateUid started snapshotting Candidate.uid onto the interview
// doc (see src/api/interviews.ts) get it too. Needed for the same reason
// as the feedback-descriptors backfill: Academy Nexus reads interview docs
// straight off Firestore via its own service account, so a field only
// present on newly-created interviews never reaches historical ones.
//
// Safe to run more than once — an interview that already has candidateUid
// (whether from withCandidateUid or a previous run of this) is skipped.
//
// POST /api/admin/backfill-candidate-uid
// Auth: "x-internal-secret: <FEEDBACK_BACKFILL_SECRET>" (same secret as
// the feedback-descriptors backfill — both are one-off admin utilities).

async function loadCandidateUidIndex(db) {
  const snap = await db.collection("candidates").get();
  const byId = new Map();
  snap.forEach(doc => {
    const uid = doc.data()?.uid;
    if (uid) byId.set(doc.id, uid);
  });
  return byId;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const expectedSecret = process.env.FEEDBACK_BACKFILL_SECRET;
  const providedSecret = req.headers["x-internal-secret"];
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  try {
    const db = getDb();
    const candidateUidById = await loadCandidateUidIndex(db);

    const snap = await db.collection("interviews").get();
    const targets = snap.docs.filter(doc => {
      const data = doc.data();
      return !data.candidateUid && !!data.candidateId && candidateUidById.has(data.candidateId);
    });

    let updated = 0;
    const BATCH_SIZE = 450;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const doc of chunk) {
        const uid = candidateUidById.get(doc.data().candidateId);
        batch.update(doc.ref, { candidateUid: uid });
        updated++;
      }

      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      scannedInterviews: snap.size,
      updated,
    });
  } catch (err) {
    console.error("backfill-candidate-uid error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
}
