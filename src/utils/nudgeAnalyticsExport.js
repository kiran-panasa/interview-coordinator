import * as XLSX from "xlsx";
import { formatDateTime } from "./dates";

const HEADERS = [
  "Candidate UID", "Candidate Name", "Program", "Template",
  "Initial Nudge Date & Time", "Reminder 1 Date & Time", "Reminder 2 Date & Time",
  "Total Nudges Sent", "Slot Booking Date", "Interview Date",
  "Current Status", "Final Outcome", "Sent By",
];

/**
 * Exports the already-filtered Nudge Analytics rows (as built by
 * NudgeAnalyticsTab — one row per invite, joined against its lifecycle
 * status and label) into a single Excel sheet.
 */
export function exportNudgeAnalyticsToExcel(rows, filenamePrefix = "nudge_analytics") {
  const dataRows = rows.map(r => [
    r.candidateUid || "",
    r.candidateName || "",
    r.programName || "",
    r.templateName || "",
    r.initialNudgeAt ? formatDateTime(r.initialNudgeAt) : "",
    r.reminder1At ? formatDateTime(r.reminder1At) : "",
    r.reminder2At ? formatDateTime(r.reminder2At) : "",
    r.nudgeCount ?? "",
    r.slotBookingAt ? formatDateTime(r.slotBookingAt) : "",
    r.interviewDate ? formatDateTime(r.interviewDate) : "",
    r.statusLabel || "",
    r.finalOutcome || "",
    r.sentByName || "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws["!cols"] = [
    { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 26 },
    { wch: 20 }, { wch: 20 }, { wch: 20 },
    { wch: 10 }, { wch: 18 }, { wch: 18 },
    { wch: 24 }, { wch: 22 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nudge Analytics");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
