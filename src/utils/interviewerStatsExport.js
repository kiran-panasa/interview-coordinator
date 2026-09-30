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
  const rows = interviewerStats.map(r => [r.name, r.completed, r.completedResumed, r.partiallyCompleted, r.cancelled, r.noShow, r.declined]);
  rows.push(["Total", totals.completed, totals.completedResumed, totals.partiallyCompleted, totals.cancelled, totals.noShow, totals.declined]);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Interviewer Statistics");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
