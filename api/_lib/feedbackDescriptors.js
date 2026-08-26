import { INTEGRITY_DOMAIN_ID, INTEGRITY_DOMAIN_PRESET } from "../../src/utils/templateEngine.js";

// Every scored_dropdown option is stored on the template as { score, label }
// (e.g. score: 0, label: "Weak in communication"), but only the raw score
// ends up saved on the interview's feedback.domains — the label lives solely
// in the template definition. This rebuilds the score→label lookup per field
// so consumers (e.g. Academy Nexus's sync pull) can get the descriptor text
// alongside the number without us having to denormalize labels onto every
// interview at save time.
function buildScoreLabelMap(fields) {
  const map = new Map();
  for (const f of fields || []) {
    if (f.type !== "scored_dropdown") continue;
    const byScore = new Map();
    for (const opt of f.options || []) {
      byScore.set(String(opt.score), opt.label);
    }
    map.set(f.id, byScore);
  }
  return map;
}

// Shared by the sync-pull endpoint and the one-time backfill script — both
// need the same interviewId -> template lookup. NOTE: the collection is
// "interviewTemplates" (see src/api/templates.ts), not "templates".
export async function loadTemplateIndex(db) {
  const snap = await db.collection("interviewTemplates").get();
  const byId = new Map();
  snap.forEach(doc => {
    const data = doc.data();
    const domains = Array.isArray(data.domains) ? data.domains : [];
    byId.set(doc.id, {
      id: doc.id,
      name: data.name || "",
      programId: data.program || null,
      domainDefsById: new Map(domains.map(dom => [dom.id, dom])),
    });
  });
  return byId;
}

// Interview Integrity is merged live into every template from a single
// global settings doc rather than stored per-template (see
// withIntegrityDomain in src/utils/templateEngine.js), so its field
// definitions have to be fetched/passed in separately from the interview's
// own template.
export async function loadIntegrityDomainFields(db) {
  const snap = await db.collection("settings").doc("interviewIntegrity").get();
  const fields = snap.exists ? snap.data()?.domainFields : null;
  return Array.isArray(fields) && fields.length ? fields : INTEGRITY_DOMAIN_PRESET.domainFields;
}

// Returns domainData unchanged (no template match / nothing scored) or a
// shallow copy with a `descriptors` key added alongside the existing raw
// fields — additive only, so existing consumers reading the raw scores are
// unaffected.
export function attachDescriptors(domainData, domain) {
  if (!domainData || !domain) return domainData;

  const cardScoreMap = buildScoreLabelMap(domain.cardFields);
  const domainScoreMap = buildScoreLabelMap(domain.domainFields);
  if (!cardScoreMap.size && !domainScoreMap.size) return domainData;

  const descriptors = {};

  if (cardScoreMap.size && domainData.cards?.length) {
    descriptors.cards = domainData.cards.map(card => {
      const out = {};
      for (const [fieldId, byScore] of cardScoreMap) {
        const raw = card?.[fieldId];
        if (raw == null) continue;
        const label = byScore.get(String(raw));
        if (label != null) out[fieldId] = label;
      }
      return out;
    });
  }

  for (const [fieldId, byScore] of domainScoreMap) {
    const raw = domainData[fieldId];
    if (raw == null) continue;
    const label = byScore.get(String(raw));
    if (label != null) descriptors[fieldId] = label;
  }

  if (!Object.keys(descriptors).length) return domainData;
  // Re-running the backfill should be a true no-op on already-enriched
  // domains, not just equivalent content re-written every time — field
  // order is stable across runs (it follows the template's own field
  // order), so a plain JSON comparison is reliable here.
  if (domainData.descriptors && JSON.stringify(domainData.descriptors) === JSON.stringify(descriptors)) {
    return domainData;
  }
  return { ...domainData, descriptors };
}

// domainDefsById: Map<domainId, Domain> for the interview's own template.
// The "integrity" entry (if any feedback was recorded against it) is looked
// up via integrityDomainFields instead, since it's never stored per-template.
export function attachDescriptorsToDomains(feedbackDomains, domainDefsById, integrityDomainFields) {
  if (!feedbackDomains) return feedbackDomains;

  const out = {};
  for (const [domainId, domainData] of Object.entries(feedbackDomains)) {
    const domainDef = domainId === INTEGRITY_DOMAIN_ID
      ? { cardFields: [], domainFields: integrityDomainFields }
      : domainDefsById?.get(domainId);
    out[domainId] = attachDescriptors(domainData, domainDef);
  }
  return out;
}
