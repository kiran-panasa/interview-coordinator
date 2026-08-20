import * as XLSX from "xlsx";

const HEADERS = ["Interviewer", "Completed", "Partially Completed", "Cancelled", "Student No-show"];

/**
 * Interviewer-wise status counts for the currently applied filters — one
 * row per interviewer, exactly the columns shown on screen, plus a Total
 * row. No per-interview detail, no payment — the page shows counts only.
 */
export function exportInterviewerStats(interviewerStats, totals, filenamePrefix = "interviewer_statistics") {
  const rows = interviewerStats.map(r => [r.name, r.completed, r.partiallyCompleted, r.cancelled, r.noShow]);
  rows.push(["Total", totals.completed, totals.partiallyCompleted, totals.cancelled, totals.noShow]);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Interviewer Statistics");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
