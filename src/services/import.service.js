import { materializeFeedback } from "../utils/templateEngine";
import { slugify } from "../utils/strings";

export function buildFeedbackFromCSV(template, domainData, verdict, overallNotes) {
  const hasDomainData = Object.values(domainData).some(Boolean);

  if (!template?.domains || !hasDomainData) {
    return {
      overallRecommendation: verdict,
      comments: overallNotes,
      importedFromSheet: true,
      submittedAt: new Date().toISOString(),
    };
  }

  const feedbackDomains = {};

  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const notes    = domainData[`${domain.id}_notes`] || "";
    const hasCards = (domain.cardFields || []).length > 0;
    const domainState = { cards: [] };

    if (hasCards) {
      const card = {};
      for (const f of domain.cardFields) {
        if (f.type === "scored_dropdown") {
          const raw = domainData[`${domain.id}_${slugify(f.label)}_rating`]
                   ?? domainData[`${domain.id}_${f.id}_rating`];
          card[f.id] = raw !== "" && raw != null ? parseFloat(raw) : null;
        } else {
          card[f.id] = f.type === "text" ? "" : null;
        }
      }
      domainState.cards = [card];
      for (const f of domain.domainFields || []) {
        domainState[f.id] = f.type === "text" ? notes : null;
      }
    } else {
      const raw    = domainData[`${domain.id}_rating`];
      const rating = raw !== "" && raw != null ? parseFloat(raw) : null;
      for (const f of domain.domainFields || []) {
        if (f.type === "scored_dropdown") domainState[f.id] = rating;
        else if (f.type === "text") domainState[f.id] = domain.id === "overall_feedback" ? (overallNotes || notes) : notes;
        else domainState[f.id] = null;
      }
    }

    feedbackDomains[domain.id] = domainState;
  }

  const materialized = materializeFeedback(template, { domains: feedbackDomains });
  return {
    ...materialized,
    overallRecommendation: verdict,
    ...(overallNotes ? { comments: overallNotes } : {}),
    importedFromSheet: true,
    submittedAt: new Date().toISOString(),
  };
}
