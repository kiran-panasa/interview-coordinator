import * as XLSX from "xlsx";
import { formatDate } from "./dates";

// Flattens a template-based ("dynamic") feedback object into two readable
// text blobs — scores and notes — rather than exploding into per-domain
// columns, since different templates have different domains/fields and a
// merged multi-template sheet needs a stable column set.
function summarizeDomains(template, fb) {
  if (!template?.domains || !fb?.domains) return { scores: "", notes: "" };
  const domains = [...template.domains]
    .filter(d => d.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const scoreParts = [];
  const noteParts = [];

  for (const domain of domains) {
    const dData = fb.domains[domain.id];
    if (!dData) continue;

    if (dData.domain_rating != null) scoreParts.push(`${domain.label}: ${dData.domain_rating}/5`);

    for (const f of (domain.domainFields || []).filter(f => f.type === "text")) {
      const v = dData[f.id];
      if (v) noteParts.push(`${domain.label} — ${f.label}: ${v}`);
    }
    (dData.cards || []).forEach((card, i) => {
      for (const f of (domain.cardFields || []).filter(f => f.type === "text")) {
        const v = card[f.id];
        if (v) noteParts.push(`${domain.label} Card ${i + 1} — ${f.label}: ${v}`);
      }
    });
  }

  return { scores: scoreParts.join("; "), notes: noteParts.join(" | ") };
}

const HEADERS = [
  "Candidate Name", "Candidate Email", "Interviewer", "Template", "Program", "Round",
  "Date", "Time", "Status", "Overall Recommendation", "Final Score",
  "Domain Scores", "Notes / Comments", "Feedback Submitted At",
];
const COL_WIDTHS = [
  { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 },
  { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 10 },
  { wch: 40 }, { wch: 50 }, { wch: 18 },
];

function buildFeedbackRow(iv, templateById, programNameById) {
  const fb = iv.feedback || null;
  const template = templateById.get(iv.templateId);
  const isDynamic = !!(fb && (fb.domains || fb.sections));
  const { scores, notes } = isDynamic ? summarizeDomains(template, fb) : { scores: "", notes: "" };
  const programName = template?.program ? (programNameById.get(template.program) || "") : "";

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
    fb?.overallRecommendation || "",
    fb?.finalVerdict != null ? fb.finalVerdict : "",
    scores,
    notes || fb?.comments || "",
    fb?.submittedAt ? new Date(fb.submittedAt).toLocaleString() : "",
  ];
}

/**
 * Exports feedback for the given interviews (already filtered by the
 * caller) into a single merged Excel sheet — one row per interview,
 * regardless of how many different templates/domain structures are mixed
 * in. Also used for single-interview downloads (pass a 1-item array).
 */
export function exportFeedbackToExcel(interviews, templates, programs, filenamePrefix = "interview_feedback") {
  const templateById   = new Map(templates.map(t => [t.id, t]));
  const programNameById = new Map(programs.map(p => [p.id, p.name]));

  const rows = interviews.map(iv => buildFeedbackRow(iv, templateById, programNameById));

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws["!cols"] = COL_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feedback");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
