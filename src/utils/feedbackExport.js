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
  "UID", "Candidate Name", "Candidate Email", "Interviewer", "Template", "Program", "Round",
  "Date", "Time", "Status",
];
const TAIL_HEADERS = [
  "Overall Recommendation", "Final Verdict", "Integrity Score", "Comments", "Feedback Submitted At",
  "Meet Link", "Recording Link", "Transcript Link", "AI Report",
];
// Columns whose value should be written as an actual clickable hyperlink
// (not just URL-looking text) — matched by header name so the position stays
// robust if BASE_HEADERS/TAIL_HEADERS/domain columns are ever reordered.
const LINK_HEADERS = new Set(["Meet Link", "Recording Link", "Transcript Link", "AI Report"]);

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
 *
 * `candidates` supplies the UID column (Candidate.uid, the candidate's
 * Firebase Auth uid — blank for legacy/CSV-imported candidates that never
 * had one). The AI Report column reuses the interview's own record — there's
 * no separately-hosted report page, so the link is a deep link into this
 * same app (/admin/interviews?aiReport=<id>) that auto-opens the existing AI
 * Report modal for that interview; InterviewsPage.jsx reads that query param
 * on load. Only written when iv.aiReport already exists — never generates
 * one just for the export.
 */
export function exportFeedbackToExcel(interviews, templates, programs, candidates = [], filenamePrefix = "interview_feedback", integrityDomainFields = null) {
  const templateById    = new Map(templates.map(t => [t.id, withIntegrityDomain(t, integrityDomainFields)]));
  const programNameById = new Map(programs.map(p => [p.id, p.name]));
  const uidByCandidateId = new Map(candidates.map(c => [c.id, c.uid || ""]));

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

  // Separate from the domainLabels text-dump columns above — those hold the
  // full card-by-card breakdown per section; these hold just that section's
  // numeric Domain Rating on its own, one column per section, so it can be
  // read/aggregated without parsing the text-dump column.
  const ratingHeaders = domainLabels.map(label => `${label} – Domain Rating`);

  const headers = [...BASE_HEADERS, ...domainLabels, ...TAIL_HEADERS, ...ratingHeaders];

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

    const ratingCells = domainLabels.map(label => {
      if (!isDynamic) return "";
      const domain = (template?.domains || []).find(d => d.label === label);
      if (!domain) return ""; // this interview's template doesn't have this section at all
      const rating = fb.domains[domain.id]?.domain_rating;
      return rating != null ? rating : "";
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
      uidByCandidateId.get(iv.candidateId) || "",
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
      iv.meetLink || "",
      iv.meetingRecordingUrl || "",
      iv.transcriptUrl || "",
      iv.aiReport ? `${window.location.origin}/admin/interviews?aiReport=${iv.id}` : "",
      ...ratingCells,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 24 }, { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 12 },
    ...domainLabels.map(() => ({ wch: 45 })),
    { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 45 }, { wch: 18 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 45 },
    ...domainLabels.map(() => ({ wch: 16 })),
  ];

  // Turn every URL-bearing cell in a LINK_HEADERS column into an actual
  // clickable hyperlink (not just URL-looking text) — Excel/Sheets only
  // auto-linkify those on manual edit, not from a value written by a
  // generator like this.
  headers.forEach((header, colIdx) => {
    if (!LINK_HEADERS.has(header)) return;
    for (let r = 0; r < rows.length; r++) {
      const url = rows[r][colIdx];
      if (!url) continue;
      const cellRef = XLSX.utils.encode_cell({ r: r + 1, c: colIdx }); // +1 skips the header row
      if (ws[cellRef]) ws[cellRef].l = { Target: url };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feedback");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
