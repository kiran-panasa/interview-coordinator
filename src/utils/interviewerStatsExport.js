import * as XLSX from "xlsx";

// "Completed (Resumed)" is kept separate from plain "Completed" — it's an
// interviewer finishing off a Partially Completed interview someone else
// (or they themselves) started, not a full interview on their own, so
// payment reconciliation shouldn't treat the two the same. See
// resumedFromPartial in api/interviews.ts.
const HEADERS = ["Interviewer", "Completed", "Completed (Resumed)", "Partially Completed", "Cancelled", "Student No-show", "Declined"];

/**
 * Interviewer-wise status counts for the currently applied filters — one
 * row per interviewer, exactly the columns shown on screen, plus a Total
 * row. No per-interview detail, no payment — the page shows counts only.
 */
export function exportInterviewerStats(interviewerStats, totals, filenamePrefix = "interviewer_statistics") {
  // Every count column uses its *Display field (falls back to the plain
  // number when a panelist only ran one duration) so a multi-duration
  // breakdown like "60m: 2, 90m: 4" matches exactly what's on screen.
  const toRow = (name, r) => [name, r.completedDisplay ?? r.completed, r.completedResumedDisplay ?? r.completedResumed, r.partiallyCompletedDisplay ?? r.partiallyCompleted, r.cancelledDisplay ?? r.cancelled, r.noShowDisplay ?? r.noShow, r.declinedDisplay ?? r.declined];
  const rows = interviewerStats.map(r => toRow(r.name, r));
  rows.push(toRow("Total", totals));

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Interviewer Statistics");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
