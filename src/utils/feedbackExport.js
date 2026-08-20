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

// Columns whose value should be written as an actual clickable hyperlink
// (not just URL-looking text) — matched by header name so this stays robust
// to reordering.
const LINK_HEADERS = new Set(["Meet Link", "Recording Link", "Transcript Link", "AI Report"]);

/**
 * Exports feedback for the given interviews (already filtered by the
 * caller) into a single merged Excel sheet — one row per interview.
 *
 * Column order: UID, Recording/Transcript/AI Report links, the rest of the
 * interview's own data, then one pair of columns per section/domain
 * detected across the involved templates — "<Section>" (the full card-by-
 * card text dump, same as before) immediately followed by
 * "<Section> – Domain Rating" (just that section's numeric rating on its
 * own). Interview Integrity is excluded from the Domain Rating column (its
 * text-dump column and the separate Integrity Score column are unaffected)
 * since it's a compliance checklist, not a scored section. Interviews using
 * different templates merge into the same sheet; a section's columns are
 * just blank for interviews whose template doesn't have that section.
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
 * had one).
 *
 * Recording/Transcript/AI Report links are read straight off the interview
 * record (iv.meetingRecordingUrl / iv.transcriptUrl / iv.aiReport) — the
 * same canonical fields the app itself displays and copies everywhere else
 * (InterviewsPage's Meet Recording/Transcript/AI Report actions, the Academy
 * Nexus push). This function never generates or discovers a new one; a
 * blank cell means that field genuinely isn't populated on the interview
 * yet. The AI Report column has no separately-hosted report page, so its
 * "canonical URL" is a deep link into this same app
 * (/admin/interviews?aiReport=<id>) that auto-opens the existing AI Report
 * modal for that interview — stable across downloads, only ever written
 * when iv.aiReport already exists.
 */
export function exportFeedbackToExcel(interviews, templates, programs, candidates = [], filenamePrefix = "interview_feedback", integrityDomainFields = null) {
  const templateById    = new Map(templates.map(t => [t.id, withIntegrityDomain(t, integrityDomainFields)]));
  const programNameById = new Map(programs.map(p => [p.id, p.name]));
  const uidByCandidateId = new Map(candidates.map(c => [c.id, c.uid || ""]));

  // One entry per distinct section/domain across all involved templates,
  // in first-seen order — isIntegrity controls whether it gets a paired
  // Domain Rating column.
  const domainDefs = [];
  const seenLabels = new Set();
  interviews.forEach(iv => {
    const t = templateById.get(iv.templateId);
    (t?.domains || [])
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(d => {
        if (!seenLabels.has(d.label)) {
          seenLabels.add(d.label);
          domainDefs.push({ label: d.label, isIntegrity: d.type === "integrity" });
        }
      });
  });

  const sectionHeaders = [];
  const sectionColWidths = [];
  domainDefs.forEach(d => {
    sectionHeaders.push(d.label);
    sectionColWidths.push({ wch: 45 });
    if (!d.isIntegrity) {
      sectionHeaders.push(`${d.label} – Domain Rating`);
      sectionColWidths.push({ wch: 16 });
    }
  });

  const headers = [
    "UID", "Recording Link", "Transcript Link", "AI Report",
    "Candidate Name", "Candidate Email", "Interviewer", "Template", "Program", "Round",
    "Date", "Time", "Status",
    "Overall Recommendation", "Final Verdict", "Integrity Score", "Comments", "Feedback Submitted At",
    "Meet Link",
    ...sectionHeaders,
  ];

  const rows = interviews.map(iv => {
    const fb = iv.feedback || null;
    const template = templateById.get(iv.templateId);
    const programName = template?.program ? (programNameById.get(template.program) || "") : "";
    const isDynamic = !!(fb && fb.domains);

    const sectionCells = [];
    domainDefs.forEach(d => {
      const domain = (template?.domains || []).find(x => x.label === d.label);
      const domainData = isDynamic && domain ? fb.domains[domain.id] : null;
      sectionCells.push(domain && domainData ? buildDomainText(domain, domainData) : "");
      if (!d.isIntegrity) {
        const rating = domainData?.domain_rating;
        sectionCells.push(rating != null ? rating : "");
      }
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
      iv.meetingRecordingUrl || "",
      iv.transcriptUrl || "",
      iv.aiReport ? `${window.location.origin}/admin/interviews?aiReport=${iv.id}` : "",
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
      fb?.integrityScore != null ? fb.integrityScore : "",
      comments,
      fb?.submittedAt ? new Date(fb.submittedAt).toLocaleString() : "",
      iv.meetLink || "",
      ...sectionCells,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 24 }, { wch: 40 }, { wch: 40 }, { wch: 45 },
    { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 45 }, { wch: 18 },
    { wch: 40 },
    ...sectionColWidths,
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
