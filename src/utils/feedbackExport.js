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

// The domain-level remarks box is a free-text domainField — its id/label
// vary per template ("Machine Coding Remarks", "Resume Remarks",
// "domain_remarks", a custom id, …) but it's always the `type === "text"`
// domainField, exactly like DynamicFeedbackForm.jsx renders it ("text
// remarks for all"). If a domain has no domain-level text field at all
// (some templates only collect remarks per card, e.g. "Remarks on Problem
// Solving"), fall back to joining any card-level field whose label reads
// as a remarks field, so a domain never silently ends up with no remarks
// column just because of how a particular template happened to be built.
function findDomainRemarksField(domain) {
  return (domain?.domainFields || []).find(f => f.type === "text") || null;
}

function domainRemarksValue(domain, domainData) {
  if (!domainData) return "";
  const field = findDomainRemarksField(domain);
  if (field) return resolveFieldValue(field, domainData[field.id]);

  const cardRemarkFields = (domain?.cardFields || []).filter(f => f.type === "text" && /remark/i.test(f.label || ""));
  if (cardRemarkFields.length && Array.isArray(domainData.cards)) {
    const parts = domainData.cards.flatMap((card, i) =>
      cardRemarkFields
        .map(f => { const v = resolveFieldValue(f, card[f.id]); return v ? `Card ${i + 1} ${f.label}: ${v}` : null; })
        .filter(Boolean)
    );
    if (parts.length) return parts.join(" | ");
  }
  return "";
}

// Full text dump of everything View Feedback shows for one domain: every
// card's fields (with resolved labels, not raw scores), every domain-level
// field except the overall remarks box (that gets its own dedicated
// column — see domainRemarksValue — so it isn't duplicated here), and the
// computed domain rating.
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

  const remarksField = findDomainRemarksField(domain);
  const domainFieldParts = (domain.domainFields || [])
    .filter(f => f !== remarksField)
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
 * caller) into a single merged Excel sheet — one row per interview, in this
 * fixed column order:
 *
 *   UID, Candidate Name, Candidate Email, Interviewer, Template, Program,
 *   Round, Date, Time, Status, Interview Integrity, Integrity Score,
 *   Interview Integrity – Remarks,
 *   [<Section>, <Section> – Domain Rating, <Section> – Remarks] per
 *   non-Integrity section (dynamic per the templates involved), Overall Recommendation,
 *   Final Verdict, Comments, Meet Link, Recording Link, Transcript Link,
 *   AI Report, Feedback Submitted At.
 *
 * Interview Integrity gets its own text-dump + Remarks columns (like every
 * other section) but never a "– Domain Rating" column of its own — it's a
 * compliance checklist, not a scored section; Integrity Score (a distinct,
 * separately-computed field) covers that role instead. A section whose
 * entire content is its remarks field and nothing else (no cards, no other
 * domain-level fields — e.g. the default "Overall Feedback" wrap-up
 * section) collapses to a single <Section> column instead of three, since
 * there's nothing else to show alongside it. Interviews using different
 * templates merge into the same sheet; a section's columns are just blank
 * for interviews whose template doesn't have that section.
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
 * Nexus push, the AI Report modal's Copy Link button). This function never
 * generates or discovers a new one — a blank cell means that field
 * genuinely isn't populated on the interview yet, not a bug in this export.
 * The AI Report column has no separately-hosted report page, so its
 * "canonical URL" is a deep link into this same app
 * (/admin/interviews?aiReport=<id>) that auto-opens the existing AI Report
 * modal for that interview — stable across downloads, only ever written
 * when iv.aiReport already exists.
 */
export function exportFeedbackToExcel(interviews, templates, programs, candidates = [], filenamePrefix = "interview_feedback", integrityDomainFields = null) {
  const templateById    = new Map(templates.map(t => [t.id, withIntegrityDomain(t, integrityDomainFields)]));
  const programNameById = new Map(programs.map(p => [p.id, p.name]));
  const uidByCandidateId = new Map(candidates.map(c => [c.id, c.uid || ""]));

  // One entry per distinct section/domain across all involved templates, in
  // first-seen order. Integrity always sorts first (order: -1, see
  // withIntegrityDomain) so it naturally ends up separated from the rest.
  // isRemarksOnly flags a domain whose entire content, once its remarks
  // field is accounted for, is that remarks field and nothing else (no
  // cards, no other domain-level fields) — e.g. the default "Overall
  // Feedback" wrap-up domain. Such a domain gets a single column instead of
  // the usual three, since a separate text-dump/Domain Rating column would
  // just repeat (or sit blank next to) the one thing it actually holds.
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
          const hasCards = (d.cardFields || []).length > 0;
          const remarksField = findDomainRemarksField(d);
          const otherDomainFields = (d.domainFields || []).filter(f => f !== remarksField);
          const isRemarksOnly = !hasCards && !!remarksField && otherDomainFields.length === 0;
          domainDefs.push({ label: d.label, isIntegrity: d.type === "integrity", isRemarksOnly });
        }
      });
  });
  const integrityDef = domainDefs.find(d => d.isIntegrity) || null;
  const scoredDefs = domainDefs.filter(d => !d.isIntegrity);

  const sectionHeaders = [];
  const sectionColWidths = [];
  scoredDefs.forEach(d => {
    if (d.isRemarksOnly) {
      sectionHeaders.push(d.label);
      sectionColWidths.push({ wch: 45 });
    } else {
      sectionHeaders.push(d.label, `${d.label} – Domain Rating`, `${d.label} – Remarks`);
      sectionColWidths.push({ wch: 45 }, { wch: 16 }, { wch: 40 });
    }
  });

  const headers = [
    "UID", "Candidate Name", "Candidate Email", "Interviewer", "Template", "Program", "Round",
    "Date", "Time", "Status", "Partial Completion Reason",
    "Interview Integrity", "Integrity Score", "Interview Integrity – Remarks",
    ...sectionHeaders,
    "Overall Recommendation", "Final Verdict", "Comments",
    "Meet Link", "Recording Link", "Transcript Link", "AI Report",
    "Feedback Submitted At",
  ];

  // Looks up one domain's stored data for a given interview/template pair —
  // shared by the Integrity text-dump cell and the per-section cells below.
  function domainDataFor(template, fb, isDynamic, label) {
    const domain = (template?.domains || []).find(x => x.label === label);
    const data = isDynamic && domain ? fb.domains[domain.id] : null;
    return { domain, data };
  }

  const rows = interviews.map(iv => {
    // Cancelled = no interview conducted = no scoring, regardless of what
    // stale data the doc might still carry (see markInterviewCancelled /
    // clearCancelledInterviewScoringOnce in api/interviews.ts, which clear
    // this at the source going forward — this is the export-side backstop).
    const isCancelled = iv.status === "cancelled";
    const fb = isCancelled ? null : (iv.feedback || null);
    const template = templateById.get(iv.templateId);
    const programName = template?.program ? (programNameById.get(template.program) || "") : "";
    const isDynamic = !!(fb && fb.domains);

    const integrityDomainData = (!isCancelled && integrityDef)
      ? domainDataFor(template, fb, isDynamic, integrityDef.label)
      : { domain: null, data: null };
    const integrityText = integrityDomainData.domain && integrityDomainData.data
      ? buildDomainText(integrityDomainData.domain, integrityDomainData.data) : "";
    const integrityRemarksText = integrityDomainData.domain && integrityDomainData.data
      ? domainRemarksValue(integrityDomainData.domain, integrityDomainData.data) : "";

    const sectionCells = [];
    scoredDefs.forEach(d => {
      if (isCancelled) { sectionCells.push(...(d.isRemarksOnly ? [""] : ["", "", ""])); return; }
      const { domain, data } = domainDataFor(template, fb, isDynamic, d.label);
      if (d.isRemarksOnly) {
        sectionCells.push(domain && data ? domainRemarksValue(domain, data) : "");
        return;
      }
      sectionCells.push(domain && data ? buildDomainText(domain, data) : "");
      const rating = data?.domain_rating;
      sectionCells.push(rating != null ? rating : "");
      sectionCells.push(domain && data ? domainRemarksValue(domain, data) : "");
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
      isCancelled ? "" : (iv.partialCompletionReason || ""),
      integrityText,
      fb?.integrityScore != null ? fb.integrityScore : "",
      integrityRemarksText,
      ...sectionCells,
      fb?.overallRecommendation || "",
      fb?.finalVerdict != null ? fb.finalVerdict : "",
      comments,
      iv.meetLink || "",
      isCancelled ? "" : (iv.meetingRecordingUrl || ""),
      isCancelled ? "" : (iv.transcriptUrl || ""),
      (!isCancelled && iv.aiReport) ? `${window.location.origin}/admin/interviews?aiReport=${iv.id}` : "",
      fb?.submittedAt ? new Date(fb.submittedAt).toLocaleString() : "",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 24 }, { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
    { wch: 45 }, { wch: 14 }, { wch: 40 },
    ...sectionColWidths,
    { wch: 20 }, { wch: 12 }, { wch: 45 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 45 },
    { wch: 18 },
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
