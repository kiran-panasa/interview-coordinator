import * as XLSX from "xlsx";
import { formatDate } from "./dates";
import { withIntegrityDomain } from "./templateEngine";

// Resolves a stored field value to what "View Feedback" actually displays —
// scored_dropdown stores just the numeric score, so it needs its option's
// label looked back up; everything else already stores its display value.
function resolveFieldValue(field, rawValue) {
  if (rawValue == null || rawValue === "") return "";
  if (field.type === "scored_dropdown") {
    const opt = (field.options || []).find(o => String(o.score) === String(rawValue));
    return opt ? `${opt.score} - ${opt.label}` : String(rawValue);
  }
  return String(rawValue);
}

// Full text dump of everything View Feedback shows for one domain: every
// card's fields (with resolved labels, not raw scores), every domain-level
// field, and the computed domain rating.
function buildDomainText(domain, domainData) {
  if (!domainData) return "";
  const lines = [];
  const hasCards = (domain.cardFields || []).length > 0;

  if (hasCards) {
    (domainData.cards || []).forEach((card, i) => {
      const parts = (domain.cardFields || [])
        .map(f => {
          const v = resolveFieldValue(f, card[f.id]);
          return v ? `${f.label}: ${v}` : null;
        })
        .filter(Boolean);
      if (parts.length) lines.push(`Card ${i + 1} — ${parts.join(" | ")}`);
    });
  }

  const domainFieldParts = (domain.domainFields || [])
    .map(f => {
      const v = resolveFieldValue(f, domainData[f.id]);
      return v ? `${f.label}: ${v}` : null;
    })
    .filter(Boolean);
  if (domainFieldParts.length) lines.push(domainFieldParts.join(" | "));

  if (domainData.domain_rating != null) lines.push(`Domain Rating: ${domainData.domain_rating}`);

  return lines.join("\n");
}

const BASE_HEADERS = [
  "Candidate Name", "Candidate Email", "Interviewer", "Template", "Program", "Round",
  "Date", "Time", "Status",
];
const TAIL_HEADERS = ["Overall Recommendation", "Final Verdict", "Integrity Score", "Comments", "Feedback Submitted At"];

/**
 * Exports feedback for the given interviews (already filtered by the
 * caller) into a single merged Excel sheet — one row per interview. Every
 * domain that appears in any of the involved templates becomes its own
 * column, and each cell contains everything "View Feedback" shows for that
 * domain (every card, every field, resolved option labels, domain rating) —
 * not a summary. Interviews using different templates merge into the same
 * sheet; a domain column is just blank for interviews whose template
 * doesn't have it.
 *
 * `integrityDomainFields` is the live content of the global Interview
 * Integrity checklist (settings/interviewIntegrity) — that domain isn't
 * stored on the templates themselves (see withIntegrityDomain in
 * templateEngine.js), so callers should fetch it once via
 * getInterviewIntegrity() and pass it in; omitted, it falls back to the
 * built-in default checklist.
 */
export function exportFeedbackToExcel(interviews, templates, programs, filenamePrefix = "interview_feedback", integrityDomainFields = null) {
  const templateById    = new Map(templates.map(t => [t.id, withIntegrityDomain(t, integrityDomainFields)]));
  const programNameById = new Map(programs.map(p => [p.id, p.name]));

  const domainLabels = [];
  const seenLabels = new Set();
  interviews.forEach(iv => {
    const t = templateById.get(iv.templateId);
    (t?.domains || [])
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(d => {
        if (!seenLabels.has(d.label)) { seenLabels.add(d.label); domainLabels.push(d.label); }
      });
  });

  const headers = [...BASE_HEADERS, ...domainLabels, ...TAIL_HEADERS];

  const rows = interviews.map(iv => {
    const fb = iv.feedback || null;
    const template = templateById.get(iv.templateId);
    const programName = template?.program ? (programNameById.get(template.program) || "") : "";
    const isDynamic = !!(fb && fb.domains);

    const domainCells = domainLabels.map(label => {
      if (!isDynamic) return "";
      const domain = (template?.domains || []).find(d => d.label === label);
      if (!domain) return "";
      return buildDomainText(domain, fb.domains[domain.id]);
    });

    // Legacy (pre-template) feedback stored plain question->answer pairs
    // instead of domains — fold those into the Comments column so nothing
    // from older records is dropped either.
    let comments = fb?.comments || "";
    if (!isDynamic && fb?.answers) {
      const legacyText = Object.entries(fb.answers)
        .map(([qid, val]) => `${qid.replace(/_/g, " ")}: ${val}`)
        .join(" | ");
      comments = [legacyText, comments].filter(Boolean).join(" — ");
    }

    return [
      iv.candidateName || "",
      iv.candidateEmail || "",
      iv.interviewerName || iv.interviewerEmail || "",
      iv.templateName || "",
      programName,
      iv.round || "",
      iv.scheduledDate ? formatDate(iv.scheduledDate) : "",
      iv.scheduledTime || "",
      iv.status || "",
      ...domainCells,
      fb?.overallRecommendation || "",
      fb?.finalVerdict != null ? fb.finalVerdict : "",
      fb?.integrityScore != null ? fb.integrityScore : "",
      comments,
      fb?.submittedAt ? new Date(fb.submittedAt).toLocaleString() : "",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 12 },
    ...domainLabels.map(() => ({ wch: 45 })),
    { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 45 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feedback");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
