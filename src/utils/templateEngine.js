// Canonical domain-type definitions — field structure shared by all templates of that type
export const DOMAIN_PRESETS = {
  coding: {
    id: "coding",
    type: "coding",
    label: "Coding",
    order: 0,
    enabled: true,
    weightInVerdict: 25,
    defaultCardCount: 1,
    cardFields: [
      { id: "question", label: "Question", type: "text", placeholder: "Enter the coding problem statement" },
      {
        id: "ps_rating", label: "Problem Solving", type: "scored_dropdown", weight: 50, options: [
          { label: "Solved independently with the most efficient solution, explained clearly", score: 5 },
          { label: "Solved with 1 minor nudge, reached optimal approach with good reasoning", score: 4 },
          { label: "Solved with a working but non-optimal approach, understood the logic", score: 3 },
          { label: "Partial basic solution only, needed multiple hints to get there", score: 2 },
          { label: "Minimal progress, could not reach even a basic working approach", score: 1 },
        ],
      },
      { id: "ps_remarks", label: "Remarks on Problem Solving", type: "text", placeholder: "Approach, reasoning, hints given…" },
      {
        id: "ci_rating", label: "Code Implementation", type: "scored_dropdown", weight: 50, options: [
          { label: "Clean, optimal, well-structured implementation with clear explanation", score: 5 },
          { label: "Clean code with minor issues, good structure and readability", score: 4 },
          { label: "Working but non-optimal code, understood the structure", score: 3 },
          { label: "Wrote some code but with significant errors and gaps", score: 2 },
          { label: "Could not write any meaningful code", score: 1 },
        ],
      },
    ],
    domainFields: [
      { id: "domain_remarks", label: "Domain Remarks", type: "text", placeholder: "Overall remarks for the coding domain" },
    ],
  },
  theory: {
    id: "theory",
    type: "theory",
    label: "Theory",
    order: 1,
    enabled: true,
    weightInVerdict: 25,
    defaultCardCount: 1,
    cardFields: [
      { id: "subject", label: "Subject", type: "dropdown", options: [] },
      { id: "question", label: "Question", type: "text", placeholder: "Enter the theory question asked" },
      {
        id: "question_rating", label: "Question Rating", type: "scored_dropdown", weight: 100, options: [
          { label: "Excellent depth, handled all follow-ups confidently", score: 5 },
          { label: "Good understanding with solid follow-up answers", score: 4 },
          { label: "Correct but textbook answer, struggled when follow-ups pushed deeper", score: 3 },
          { label: "Partial answer, follow-ups frequently exposed gaps in understanding", score: 2 },
          { label: "Incorrect or could not answer", score: 1 },
        ],
      },
    ],
    domainFields: [
      { id: "domain_remarks", label: "Domain Remarks", type: "text", placeholder: "Overall remarks for the theory domain" },
    ],
  },
  project: {
    id: "project",
    type: "project",
    label: "Project",
    order: 2,
    enabled: true,
    weightInVerdict: 25,
    defaultCardCount: 1,
    cardFields: [
      { id: "project_type", label: "Project Type", type: "dropdown", options: ["Individual", "Team", "Open Source Contribution", "Capstone / Guided project"] },
      { id: "project_link", label: "Project Link", type: "text", placeholder: "GitHub or live demo link" },
      { id: "build_approach", label: "Build Approach", type: "dropdown", options: ["Built from scratch", "Tutorial-based (modified)", "Fork/Clone (customized)", "Template-based"] },
      { id: "explanation", label: "Project Explanation", type: "text", placeholder: "How well did the candidate explain the project?" },
      {
        id: "project_rating", label: "Project Rating", type: "scored_dropdown", weight: 100, options: [
          { label: "Deep understanding, articulated all decisions and trade-offs clearly", score: 5 },
          { label: "Good understanding, can explain most decisions and challenges", score: 4 },
          { label: "Understands the project broadly, vague on specific decisions or challenges", score: 3 },
          { label: "Thin understanding, likely limited hands-on involvement", score: 2 },
          { label: "No meaningful understanding of the project", score: 1 },
        ],
      },
    ],
    domainFields: [
      { id: "domain_remarks", label: "Domain Remarks", type: "text", placeholder: "Overall remarks for the project domain" },
    ],
  },
  resume: {
    id: "resume",
    type: "resume",
    label: "Resume",
    order: 3,
    enabled: true,
    weightInVerdict: 25,
    defaultCardCount: 0,
    cardFields: [],
    domainFields: [
      {
        id: "domain_rating", label: "Resume Rating", type: "scored_dropdown", options: [
          { label: "Strong, well-rounded profile with clear evidence of depth", score: 5 },
          { label: "Solid skills demonstrated with good examples", score: 4 },
          { label: "Knows the surface, basic understanding demonstrated", score: 3 },
          { label: "Familiar — surface-level knowledge only", score: 2 },
          { label: "No relevant skills or experience demonstrated", score: 1 },
        ],
      },
      { id: "domain_remarks", label: "Resume Remarks", type: "text", placeholder: "Overall remarks on resume" },
    ],
  },
  overall_feedback: {
    id: "overall_feedback",
    type: "overall_feedback",
    label: "Overall Feedback",
    order: 4,
    enabled: true,
    weightInVerdict: 0,
    defaultCardCount: 0,
    cardFields: [],
    domainFields: [
      { id: "domain_remarks", label: "Overall Remarks", type: "text", placeholder: "Final overall remarks about the candidate" },
    ],
  },
};

export const DOMAIN_TYPE_ORDER = ["coding", "theory", "project", "resume", "overall_feedback"];

// ── Interview Integrity ─────────────────────────────────────────────────────
// A fixed checklist domain injected into every template (see ensureIntegrityDomain
// below) — excluded from the Final Interview Verdict (weightInVerdict: 0) and
// scored separately via computeIntegrityScore, normalized to a 0–10 scale.

export const INTEGRITY_DOMAIN_ID = "integrity";

const INTEGRITY_OPTIONS = [
  { label: "Compliant", score: 5 },
  { label: "Partially Compliant / Needs Attention", score: 3 },
  { label: "Non-Compliant / Violation", score: 1 },
];

// Weights below match the requested table exactly (sums to 15) — admins can
// still edit label/options/weight per template via the normal domain editor.
export const INTEGRITY_DOMAIN_PRESET = {
  id: INTEGRITY_DOMAIN_ID,
  type: "integrity",
  label: "Interview Integrity",
  order: 5,
  enabled: true,
  weightInVerdict: 0,
  defaultCardCount: 0,
  cardFields: [],
  domainFields: [
    { id: "camera_compliance",      label: "Student camera is ON",                          type: "scored_dropdown", weight: 1, options: INTEGRITY_OPTIONS },
    { id: "screen_sharing",         label: "Screen sharing is enabled",                      type: "scored_dropdown", weight: 1, options: INTEGRITY_OPTIONS },
    { id: "single_desktop",         label: "Only one desktop/monitor is in use",             type: "scored_dropdown", weight: 1, options: INTEGRITY_OPTIONS },
    { id: "browser_extensions",     label: "Browser extensions are verified",                type: "scored_dropdown", weight: 1, options: INTEGRITY_OPTIONS },
    { id: "mobile_position",        label: "Mobile is positioned correctly",                 type: "scored_dropdown", weight: 3, options: INTEGRITY_OPTIONS },
    { id: "room_laptop_scan",       label: "Room and laptop setup scan is completed",        type: "scored_dropdown", weight: 2, options: INTEGRITY_OPTIONS },
    { id: "bluetooth_compliance",   label: "No Bluetooth/wireless audio devices are in use", type: "scored_dropdown", weight: 1, options: INTEGRITY_OPTIONS },
    { id: "av_quality",             label: "Audio and video quality is acceptable",          type: "scored_dropdown", weight: 2, options: INTEGRITY_OPTIONS },
    { id: "no_suspicious_behavior", label: "No suspicious behavior is observed",             type: "scored_dropdown", weight: 3, options: INTEGRITY_OPTIONS },
    { id: "integrity_remarks",      label: "Integrity Remarks", type: "text", placeholder: "Any additional notes on integrity/compliance observations" },
  ],
};

// Appends the Integrity domain to a template's domains array if it isn't
// already present (by id) — used both when saving a template (so it's
// impossible to create/edit a template without it) and by the one-time
// background migration for templates that existed before this feature.
export function ensureIntegrityDomain(domains) {
  const list = domains || [];
  if (list.some(d => d.id === INTEGRITY_DOMAIN_ID)) return list;
  const maxOrder = list.reduce((m, d) => Math.max(m, d.order ?? 0), -1);
  return [...list, { ...INTEGRITY_DOMAIN_PRESET, order: maxOrder + 1 }];
}

// ── State initializer ─────────────────────────────────────────────────────────

export function initFeedbackState(template, existing = {}) {
  if (!template?.domains) return existing || {};

  const domains = {};
  const sorted = [...template.domains].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const domain of sorted) {
    if (domain.enabled === false) continue;

    const prev = existing?.domains?.[domain.id] || {};

    const emptyCard = {};
    for (const f of domain.cardFields || []) {
      emptyCard[f.id] = f.type === "text" ? "" : null;
    }

    const cardCount = Math.max(prev.cards?.length || 0, domain.defaultCardCount || 0);
    const cards = cardCount > 0
      ? Array.from({ length: cardCount }, (_, i) => ({ ...emptyCard, ...(prev.cards?.[i] || {}) }))
      : [];

    const domainState = { cards };
    for (const f of domain.domainFields || []) {
      domainState[f.id] = prev[f.id] ?? (f.type === "text" ? "" : null);
    }

    domains[domain.id] = domainState;
  }

  return { domains };
}

// ── Computation helpers ───────────────────────────────────────────────────────

// Card rating = weighted avg of all scored_dropdown values in the card
// Each scored_dropdown field has an optional `weight` (% out of 100). Falls back to equal weight if absent.
export function computeCardRating(cardFields, cardData) {
  const scoredFields = (cardFields || []).filter(f => f.type === "scored_dropdown");
  if (!scoredFields.length) return null;

  const hasWeights = scoredFields.some(f => f.weight != null);
  let totalWeight = 0;
  let weightedSum = 0;

  for (const f of scoredFields) {
    const score = parseFloat(cardData?.[f.id]);
    if (isNaN(score)) continue;
    const w = hasWeights ? (parseFloat(f.weight) || 0) : 1;
    weightedSum += score * w;
    totalWeight += w;
  }

  if (!totalWeight) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

// Domain rating: avg of card ratings (card-based) OR direct scored_dropdown value (no-card)
export function computeDomainRating(domain, domainData) {
  const hasCardFields = (domain.cardFields || []).length > 0;

  if (hasCardFields) {
    const cards = domainData?.cards || [];
    if (!cards.length) return null;
    const ratings = cards
      .map(card => computeCardRating(domain.cardFields, card))
      .filter(v => v != null);
    if (!ratings.length) return null;
    return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  } else {
    // No-card domain (e.g. Resume, Interview Integrity): weighted average
    // across ALL scored_dropdown domainFields — computeCardRating already
    // does exactly this (weight-if-present, equal-weight fallback), it just
    // reads a flat {fieldId: value} object, which domainData already is.
    // (A domain with a single unweighted scored field — e.g. Resume Rating —
    // reduces to that field's raw score, same as before this change.)
    return computeCardRating(domain.domainFields, domainData);
  }
}

// Interview Integrity is deliberately excluded from the Final Verdict
// (weightInVerdict: 0) and reported as its own 0–10 score instead. The
// domain's own rating lands on the same 1–5 scale as every other domain
// (scored_dropdown options are always 1–5 across this app) — this just
// rescales that onto 0–10 for a friendlier, distinct metric.
const INTEGRITY_SCALE = { min: 1, max: 5 };

export function computeIntegrityScore(template, feedbackData) {
  const domain = (template?.domains || []).find(d => d.id === INTEGRITY_DOMAIN_ID && d.enabled !== false);
  if (!domain) return null;
  const rating = computeDomainRating(domain, feedbackData?.domains?.[domain.id]);
  if (rating == null) return null;
  const { min, max } = INTEGRITY_SCALE;
  return Math.round(((rating - min) / (max - min)) * 100) / 10;
}

export function computeFinalVerdict(template, feedbackData) {
  if (!template?.domains || !feedbackData?.domains) return null;

  const scoredDomains = template.domains.filter(
    d => d.enabled !== false && (d.weightInVerdict ?? 0) > 0
  );

  let totalWeight = 0;
  let weightedSum = 0;

  for (const domain of scoredDomains) {
    const rating = computeDomainRating(domain, feedbackData.domains[domain.id]);
    if (rating != null) {
      const w = domain.weightInVerdict;
      weightedSum += rating * w;
      totalWeight += w;
    }
  }

  return totalWeight ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;
}

// Materialise all computed values into the feedback object before saving
export function materializeFeedback(template, feedbackData) {
  if (!template?.domains || !feedbackData?.domains) return feedbackData;

  const domains = {};
  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const domainData = feedbackData.domains[domain.id] || {};
    const cards = domainData.cards || [];
    const domainRating = computeDomainRating(domain, domainData);
    domains[domain.id] = { ...domainData, cards, domain_rating: domainRating };
  }

  return {
    ...feedbackData,
    domains,
    finalVerdict: computeFinalVerdict(template, { domains }),
    integrityScore: computeIntegrityScore(template, { domains }),
  };
}
