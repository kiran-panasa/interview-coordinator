import { materializeFeedback } from "../utils/templateEngine";
import { slugify } from "../utils/strings";

function lowestOptionScore(field) {
  const scores = (field.options || []).map(o => parseFloat(o.score)).filter(n => !isNaN(n));
  return scores.length ? Math.min(...scores) : null;
}

// Returns { feedback, partialCompletionReason }. In the app every scored
// field must be rated before an interview can be completed (partial or not),
// so a sheet row with a blank score in a verdict-weighted section is treated
// the same way: the blank gets that field's lowest option and the interview
// is imported as partially completed, with the affected sections as the
// reason. A section the sheet has no column for at all (e.g. one added to
// the template after the interview took place) is not a blank — it's left
// unrated and drops out of the Final Score, as before.
export function buildFeedbackFromCSV(template, domainData, verdict, overallNotes) {
  const hasDomainData = Object.values(domainData).some(Boolean);

  if (!template?.domains || !hasDomainData) {
    return {
      feedback: {
        overallRecommendation: verdict,
        comments: overallNotes,
        importedFromSheet: true,
        submittedAt: new Date().toISOString(),
      },
      partialCompletionReason: null,
    };
  }

  const inSheet = key => Object.prototype.hasOwnProperty.call(domainData, key);
  const blankSections = new Set();

  const feedbackDomains = {};

  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const notes    = domainData[`${domain.id}_notes`] || "";
    const hasCards = (domain.cardFields || []).length > 0;
    const domainState = { cards: [] };
    const countsInVerdict = (domain.weightInVerdict ?? 0) > 0;
    const scoreOrLowest = (raw, columnPresent, field) => {
      if (raw !== "" && raw != null) return parseFloat(raw);
      if (!columnPresent || !countsInVerdict) return null;
      const lowest = lowestOptionScore(field);
      if (lowest != null) blankSections.add(domain.label || domain.id);
      return lowest;
    };

    if (hasCards) {
      const cardCount = Math.max(domain.defaultCardCount || 1, 1);
      const cards = [];
      for (let ci = 1; ci <= cardCount; ci++) {
        // Multi-card: coding_1_problem_solving_rating; single-card: coding_problem_solving_rating
        const pfx = cardCount > 1 ? `${domain.id}_${ci}` : domain.id;
        const card = {};
        for (const f of domain.cardFields) {
          if (f.type === "scored_dropdown") {
            const slugKey = `${pfx}_${slugify(f.label)}_rating`;
            const idKey   = `${pfx}_${f.id}_rating`;
            const raw = domainData[slugKey] ?? domainData[idKey];
            card[f.id] = scoreOrLowest(raw, inSheet(slugKey) || inSheet(idKey), f);
          } else if (f.type === "dropdown") {
            const raw = domainData[`${pfx}_${slugify(f.label)}`]
                     ?? domainData[`${pfx}_${f.id}`];
            card[f.id] = raw || null;
          } else if (f.type === "text") {
            const raw = domainData[`${pfx}_${slugify(f.label)}`]
                     ?? domainData[`${pfx}_${f.id}`];
            card[f.id] = raw || "";
          } else {
            card[f.id] = null;
          }
        }
        cards.push(card);
      }
      domainState.cards = cards;
      for (const f of domain.domainFields || []) {
        domainState[f.id] = f.type === "text" ? notes : null;
      }
    } else {
      const raw    = domainData[`${domain.id}_rating`];
      const columnPresent = inSheet(`${domain.id}_rating`);
      for (const f of domain.domainFields || []) {
        if (f.type === "scored_dropdown") domainState[f.id] = scoreOrLowest(raw, columnPresent, f);
        else if (f.type === "text") domainState[f.id] = domain.id === "overall_feedback" ? (overallNotes || notes) : notes;
        else domainState[f.id] = null;
      }
    }

    feedbackDomains[domain.id] = domainState;
  }

  const materialized = materializeFeedback(template, { domains: feedbackDomains });
  return {
    feedback: {
      ...materialized,
      overallRecommendation: verdict,
      ...(overallNotes ? { comments: overallNotes } : {}),
      importedFromSheet: true,
      submittedAt: new Date().toISOString(),
    },
    partialCompletionReason: blankSections.size
      ? `Imported from sheet with no score for: ${[...blankSections].join(", ")} (scored at the lowest option)`
      : null,
  };
}
