import * as XLSX from "xlsx";

// Generic — used for both the Vendor-wise and Panelist-wise comparison
// tables, which share almost all columns and differ only in the first
// one or two (Vendor+Panelists vs Panelist+Vendor). Headers/rows are
// built by the caller so this file has no knowledge of which mode it is.
export function exportVendorAnalytics(headers, rows, filenamePrefix = "vendor_analytics") {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(28, h.length + 6)) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vendor Analytics");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}_${today}.xlsx`);
}
