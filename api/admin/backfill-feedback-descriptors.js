import { getDb } from "../_lib/firebaseAdmin.js";
import { attachDescriptorsToDomains, loadIntegrityDomainFields, loadTemplateIndex } from "../_lib/feedbackDescriptors.js";

// One-time, server-side backfill so interviews whose feedback was saved
// BEFORE materializeFeedback started baking descriptor text onto
// feedback.domains (see src/utils/templateEngine.js) get it too.
//
// A client-triggered equivalent (backfillFeedbackDescriptorsOnce in
// src/api/interviews.ts) already exists, but it only actually runs once an
// admin opens the Interviews page on a browser that has picked up the new
// frontend build — which can lag behind this API deploying by an unknown
// amount, and there's no way to confirm from here that it's happened. This
// endpoint does the same enrichment via the Admin SDK, callable directly
// (curl/Postman) the moment this deploy is live, with no dependency on
// anyone's browser cache. Safe to run more than once — already-enriched
// domains are left untouched (see attachDescriptors' no-op-if-unchanged
// behavior), and interviews are only ever added to, never overwritten
// destructively.
//
// POST /api/admin/backfill-feedback-descriptors
// Auth: "x-internal-secret: <FEEDBACK_BACKFILL_SECRET>"

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
    const [templateById, integrityDomainFields] = await Promise.all([
      loadTemplateIndex(db),
      loadIntegrityDomainFields(db),
    ]);

    const snap = await db.collection("interviews")
      .where("status", "in", ["completed", "partially_completed"])
      .get();

    const targets = snap.docs.filter(d => !!d.data()?.feedback?.domains);

    let updated = 0;
    let skippedNoTemplate = 0;
    const BATCH_SIZE = 450;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      let batchHasWrites = false;

      for (const doc of chunk) {
        const data = doc.data();
        const template = templateById.get(data.templateId);
        if (!template) { skippedNoTemplate++; continue; }

        const domains = data.feedback.domains;
        const enriched = attachDescriptorsToDomains(domains, template.domainDefsById, integrityDomainFields);

        const changed = Object.keys(domains).some(id => enriched[id] !== domains[id]);
        if (!changed) continue;

        batch.update(doc.ref, { "feedback.domains": enriched });
        batchHasWrites = true;
        updated++;
      }

      if (batchHasWrites) await batch.commit();
    }

    return res.status(200).json({
      success: true,
      scanned: targets.length,
      updated,
      skippedNoTemplate,
      skippedAlreadyEnriched: targets.length - updated - skippedNoTemplate,
    });
  } catch (err) {
    console.error("backfill-feedback-descriptors error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
}
