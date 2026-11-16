import { materializeFeedback, getUnratedVerdictDomains } from "../utils/templateEngine";
import { slugify } from "../utils/strings";

// "NA" / "N/A" (any case) in a rating cell marks a section that doesn't
// apply to this interview — e.g. one added to the template after it took
// place. Unlike a blank cell, it's left unrated and drops out of the Final
// Score instead of being treated as a missing score.
export function isNotApplicable(raw) {
  return typeof raw === "string" && /^n\/?a$/i.test(raw.trim());
}

// The template's overall-remarks section. The built-in one is id/type
// "overall_feedback", but custom templates name it freely (e.g. DSA's
// "overall_remarks"), so fall back to any section whose id or label says
// "overall".
export function isOverallSection(domain) {
  if (!domain) return false;
  if (domain.type === "overall_feedback" || domain.id === "overall_feedback") return true;
  return /overall/i.test(domain.id || "") || /overall/i.test(domain.label || "");
}

// Returns { feedback, partialCompletionReason }. A sheet row with a
// verdict-weighted section left entirely blank is imported the same way the
// app saves "Save as Partially Completed": the section stays unscored (so
// Reschedule & Resume leaves it open for the next panelist), finalVerdict is
// null with scoreIncomplete/missingSections set, and the interview is marked
// partially completed with those sections as the reason. A section marked
// NA, or with no column in the sheet at all, is not missing — it's left
// unrated and simply drops out of the Final Score.
export function buildFeedbackFromCSV(template, domainData, verdict, overallNotes) {
  // One column for the overall remarks: the overall section's own column
  // (e.g. overall_remarks_notes) fills that section's remarks box AND
  // feedback.comments (what the Academy push sends as `remarks`). The generic
  // `notes` column is used only for templates without an overall section
  // (or if that column is blank).
  const overallDomain = template?.domains?.find(d => d.enabled !== false && isOverallSection(d)) || null;
  const overallKey = overallDomain ? `${overallDomain.id}_notes` : null;
  const overallText = (overallKey && domainData[overallKey]) || overallNotes || "";

  // A row with only a verdict + overall remarks (no section ratings/notes)
  // stays a verdict-only import, same as before — it must not be treated as
  // section feedback with every section blank (that would mark it partial).
  const hasDomainData = Object.entries(domainData).some(([k, v]) => v && k !== overallKey);

  if (!template?.domains || !hasDomainData) {
    return {
      feedback: {
        overallRecommendation: verdict,
        comments: overallText,
        importedFromSheet: true,
        submittedAt: new Date().toISOString(),
      },
      partialCompletionReason: null,
    };
  }

  const inSheet = key => Object.prototype.hasOwnProperty.call(domainData, key);
  const blankDomainIds = new Set();

  const feedbackDomains = {};

  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const notes    = domain === overallDomain ? overallText : (domainData[`${domain.id}_notes`] || "");
    const hasCards = (domain.cardFields || []).length > 0;
    const domainState = { cards: [] };
    const countsInVerdict = (domain.weightInVerdict ?? 0) > 0;
    const readScore = (raw, columnPresent) => {
      if (isNotApplicable(raw)) return null;
      if (raw !== "" && raw != null) return parseFloat(raw);
      if (columnPresent && countsInVerdict) blankDomainIds.add(domain.id);
      return null;
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
            card[f.id] = readScore(raw, inSheet(slugKey) || inSheet(idKey));
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
        if (f.type === "scored_dropdown") domainState[f.id] = readScore(raw, columnPresent);
        else if (f.type === "text") domainState[f.id] = notes;
        else domainState[f.id] = null;
      }
    }

    feedbackDomains[domain.id] = domainState;
  }

  const materialized = materializeFeedback(template, { domains: feedbackDomains });
  // Only sections with no score at all count as missing (same test the app
  // uses) — and only blank ones, not NA or absent columns.
  const missing = getUnratedVerdictDomains(template, materialized).filter(d => blankDomainIds.has(d.id));
  const missingSections = missing.map(d => d.label || d.id);

  return {
    feedback: {
      ...materialized,
      ...(missing.length ? { finalVerdict: null, scoreIncomplete: true, missingSections } : {}),
      overallRecommendation: verdict,
      ...(overallText ? { comments: overallText } : {}),
      importedFromSheet: true,
      submittedAt: new Date().toISOString(),
    },
    partialCompletionReason: missing.length
      ? `Imported from sheet with no score for: ${missingSections.join(", ")}`
      : null,
  };
}
