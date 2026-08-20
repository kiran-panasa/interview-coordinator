import * as XLSX from "xlsx";
import { formatDate } from "./dates";

const SUMMARY_HEADERS = [
  "Interviewer", "Email", "Completed", "Partially Completed", "Cancelled",
  "Student No-show", "Other", "Total Interviews", "Rate per Interview", "Payment",
];

function summaryRows(interviewerStats) {
  return interviewerStats.map(r => [
    r.name, r.email, r.completed, r.partiallyCompleted, r.cancelled, r.noShow, r.other, r.total,
    r.rate != null ? r.rate : "Not set",
    r.payment != null ? r.payment : "",
  ]);
}

function summarySheet(interviewerStats, totals) {
  const rows = summaryRows(interviewerStats);
  rows.push([
    "TOTAL", "", totals.completed, totals.partiallyCompleted, totals.cancelled, totals.noShow, totals.other, totals.total,
    "", totals.payment,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([SUMMARY_HEADERS, ...rows]);
  ws["!cols"] = [
    { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 12 },
    { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
  ];
  return ws;
}

const DETAIL_HEADERS = [
  "Interviewer", "Candidate Name", "Program", "Template", "Round",
  "Date", "Time", "Status", "Partial Completion Reason",
];

// `sortBy` controls which dimension the detail rows are grouped by — a
// contiguous sorted block per group is far more usable in Excel than a
// separate sheet per group would be for something like 50+ interviewers.
function detailSheet(interviews, programNameByTemplateId, sortBy) {
  const rows = interviews.map(iv => ({
    interviewer: iv.interviewerName || iv.interviewerEmail || "",
    candidate:   iv.candidateName || "",
    program:     programNameByTemplateId.get(iv.templateId) || "",
    template:    iv.templateName || "",
    round:       iv.round || "",
    date:        iv.scheduledDate || "",
    time:        iv.scheduledTime || "",
    status:      iv.status || "",
    reason:      iv.partialCompletionReason || "",
  }));

  const sortKey = {
    interviewer: r => r.interviewer,
    program:     r => r.program,
    round:       r => r.round,
    date:        r => r.date + " " + r.time,
  }[sortBy] || (r => r.date + " " + r.time);
  rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const aoa = [DETAIL_HEADERS, ...rows.map(r => [
    r.interviewer, r.candidate, r.program, r.template, r.round,
    r.date ? formatDate(r.date) : "", r.time, r.status, r.reason,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 32 },
  ];
  return ws;
}

/**
 * Full payment/statistics export — a "Summary" sheet (interviewer-wise
 * counts + payment) and an "Interview Details" sheet (the underlying
 * filtered interviews, sorted by `sortBy`) so the file is self-contained
 * for payment reconciliation and audit purposes without needing to cross-
 * reference anything else.
 */
export function exportPaymentStats(interviews, interviewerStats, totals, programNameByTemplateId, sortBy, filenamePrefix) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(interviewerStats, totals), "Summary");
  XLSX.utils.book_append_sheet(wb, detailSheet(interviews, programNameByTemplateId, sortBy), "Interview Details");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}

/** Payment-focused export — the interviewer-wise summary only, no per-interview noise. */
export function exportPaymentReportOnly(interviewerStats, totals) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(interviewerStats, totals), "Payment Report");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `payment_report_${today}.xlsx`);
}
