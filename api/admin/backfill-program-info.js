import { getDb } from "../_lib/firebaseAdmin.js";

// One-time, server-side backfill so interviews created BEFORE
// withProgramInfo (src/api/interviews.ts) started snapshotting the
// template's Program assignment (programId/programName) onto the
// interview doc get it too. Same reasoning as backfill-candidate-uid.js:
// Academy Nexus reads interview docs straight off Firestore via its own
// service account, so a field only present on newly-created interviews
// never reaches historical ones on its own.
//
// Safe to run more than once — an interview that already has programId
// is skipped.
//
// POST /api/admin/backfill-program-info
// Auth: "x-internal-secret: <FEEDBACK_BACKFILL_SECRET>" (same secret as
// the other one-off admin backfills).

async function loadProgramByTemplateId(db) {
  const [templatesSnap, programsSnap] = await Promise.all([
    db.collection("interviewTemplates").get(),
    db.collection("programs").get(),
  ]);

  const programById = new Map();
  programsSnap.forEach(doc => programById.set(doc.id, { id: doc.id, name: doc.data()?.name || "" }));

  const programByTemplateId = new Map();
  templatesSnap.forEach(doc => {
    const programId = doc.data()?.program;
    if (programId && programById.has(programId)) {
      programByTemplateId.set(doc.id, programById.get(programId));
    }
  });
  return programByTemplateId;
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
    const programByTemplateId = await loadProgramByTemplateId(db);

    const snap = await db.collection("interviews").get();
    const targets = snap.docs.filter(doc => {
      const data = doc.data();
      return !data.programId && !!data.templateId && programByTemplateId.has(data.templateId);
    });

    let updated = 0;
    const BATCH_SIZE = 450;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const doc of chunk) {
        const program = programByTemplateId.get(doc.data().templateId);
        batch.update(doc.ref, { programId: program.id, programName: program.name });
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
    console.error("backfill-program-info error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
}
