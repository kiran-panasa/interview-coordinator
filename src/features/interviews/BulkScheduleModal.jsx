import { useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, CalendarPlus } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { formatDate } from "../../utils/dates";

function csvCell(v) {
  const s = String(v ?? "");
  return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Lets an admin grab just the rows a run actually failed on (a runtime
// error — blocked date, a slot that got taken mid-batch, etc. — not a
// validation error, those never reach handleBulkSchedule at all) instead
// of re-building the whole sheet to find which of e.g. 14 rows it was.
function downloadFailedRows(failedRows) {
  if (!failedRows.length) return;
  const headers = ["candidateEmail", "candidateUid", "interviewerEmail", "templateName", "date", "time", "duration", "round", "notes", "reason it failed"];
  const lines = [headers.join(",")];
  failedRows.forEach(r => {
    const row = [
      r.raw.candidateEmail, r.raw.candidateUid, r.raw.interviewerEmail, r.raw.templateName,
      r.raw.date, r.raw.time, r.raw.duration, r.raw.round, r.raw.notes, r.scheduleError || "",
    ];
    lines.push(row.map(csvCell).join(","));
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = "bulk_schedule_failed_rows.csv";
  a.click();
}

export default function BulkScheduleModal({
  open, onClose,
  csvText, setCsvText,
  parsedRows, setParsedRows,
  interviewers, templates, rounds, DURATIONS,
  handleParseCSV, handleBulkSchedule, scheduling, progress, result,
  downloadBulkScheduleTemplate,
}) {
  const firstErrorRowRef = useRef(null);
  const firstWarnRowRef  = useRef(null);
  const validCount = parsedRows ? parsedRows.filter(r => r.errors.length === 0).length : 0;
  const failedRows = parsedRows ? parsedRows.filter(r => r.scheduleError) : [];

  return (
    <Modal open={open} onClose={onClose} title="Bulk Schedule Interviews" wide>
      <div className="space-y-5">
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          Schedule many new interviews at once, across any mix of templates and panelists — each row creates a brand-new interview exactly like clicking "Schedule Interview" by hand (the assigned panelist gets notified to Accept/Decline, same as always).
        </p>

        {/* Format reference */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400" /> Sheet Format
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  {["Column", "Required", "Example"].map(h => (
                    <th key={h} className="text-left font-semibold text-gray-500 pb-1.5 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-gray-600 divide-y divide-gray-100">
                {[
                  ["candidateEmail",   "Yes*", "john@example.com — *either this or candidateUid is required"],
                  ["candidateUid",     "Yes*", "e.g. a1b2c3d4-... — use when email isn't reliable/known"],
                  ["interviewerEmail", "Yes",  "interviewer@nxtwave.tech — must be an active interviewer already"],
                  ["templateName",     "Yes",  "Product Mastery - Novice"],
                  ["date",             "Yes",  "15/06/2026 or 2026-06-15 — today or later"],
                  ["time",             "Yes",  "10:00 AM or 14:30"],
                  ["duration",         "No",   "Minutes, e.g. 60 — defaults to the template's own duration"],
                  ["round",            "No",   "Round 1 (default)"],
                  ["notes",            "No",   "Admin-only notes"],
                ].map(([col, req, ex]) => (
                  <tr key={col}>
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-brand-700">{col}</td>
                    <td className="py-1.5 pr-4">
                      {req.startsWith("Yes")
                        ? <span className="text-red-500 font-semibold">{req}</span>
                        : <span className="text-gray-400">No</span>}
                    </td>
                    <td className="py-1.5 text-gray-500">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <Button variant="primary" size="sm" icon={Download}
              onClick={() => downloadBulkScheduleTemplate(interviewers, templates, rounds, DURATIONS)}>
              Download Excel Template (with Help sheet)
            </Button>
          </div>

          {/* Quick on-screen reference — same info as the Help sheet, visible
             without downloading anything. */}
          <details className="mt-3 pt-3 border-t border-gray-200">
            <summary className="text-xs font-semibold text-brand-600 cursor-pointer hover:text-brand-700 select-none">
              Show panelists, templates &amp; round names
            </summary>
            <div className="mt-2 grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Panelists ({interviewers.length})
                </p>
                <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {interviewers.length === 0
                    ? <p className="text-xs text-gray-400 px-2 py-1.5">No active interviewers yet.</p>
                    : interviewers.map(u => (
                      <p key={u.id} className="text-xs text-gray-600 px-2 py-1 flex items-center justify-between gap-2">
                        <span className="truncate">{u.displayName || "—"}</span>
                        <span className="font-mono text-[11px] text-gray-400 truncate">{u.email}</span>
                      </p>
                    ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Templates ({templates.length})
                </p>
                <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {templates.map(t => (
                    <p key={t.id} className="text-xs text-gray-600 px-2 py-1 flex items-center justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      {t.durationMinutes && <span className="text-[11px] text-gray-400 flex-shrink-0">{t.durationMinutes}m</span>}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Round Names ({rounds.length})
                </p>
                <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {rounds.length === 0
                    ? <p className="text-xs text-gray-400 px-2 py-1.5">None yet — any value you type is accepted.</p>
                    : rounds.map(r => (
                      <p key={r.id || r.name} className="text-xs text-gray-600 px-2 py-1">{r.name}</p>
                    ))}
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* CSV input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Paste CSV or upload file</label>
            <label className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-700 cursor-pointer">
              <Upload className="w-3 h-3" /> Upload file
              <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => { setCsvText(ev.target.result); setParsedRows(null); };
                reader.readAsText(file);
                e.target.value = "";
              }} />
            </label>
          </div>
          <textarea
            rows={6}
            value={csvText}
            onChange={e => { setCsvText(e.target.value); setParsedRows(null); }}
            placeholder={"candidateEmail,interviewerEmail,templateName,date,time,duration,round,notes\njohn@example.com,interviewer@nxtwave.tech,Product Mastery - Novice,15/06/2026,10:00 AM,60,Round 1,"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">Uploading an .xlsx file pastes its raw contents — if that doesn't parse cleanly, save it as CSV first and upload that instead.</p>
        </div>

        <button
          onClick={handleParseCSV}
          disabled={!csvText.trim()}
          className="w-full border border-brand-200 text-brand-700 bg-brand-50 rounded-xl py-2 text-sm font-semibold hover:bg-brand-100 disabled:opacity-40 transition-colors">
          Parse &amp; Preview
        </button>

        {/* Last run's outcome — kept visible (not just a toast) so a
           failure from a batch of e.g. 14 rows doesn't go unnoticed, with
           a way to grab exactly which rows failed and why. */}
        {result && (
          <div className={`flex items-start justify-between gap-3 flex-wrap rounded-lg border px-4 py-3 text-sm ${
            result.failedCount ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            <div className="flex items-start gap-2">
              {result.failedCount ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <p>
                <span className="font-semibold">{result.succeeded} scheduled successfully.</span>
                {result.failedCount > 0 && (
                  <> {result.failedCount} failed — shown below with the reason for each. Fix them (or just retry if it was a transient error) and click "Schedule" again to retry only these.</>
                )}
              </p>
            </div>
            {result.failedCount > 0 && (
              <button
                onClick={() => downloadFailedRows(failedRows)}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 border border-amber-300 bg-white hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0">
                <Download className="w-3 h-3" /> Download failed rows
              </button>
            )}
          </div>
        )}

        {/* Preview */}
        {parsedRows && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Preview — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""}
              {parsedRows.filter(r => r.errors.length > 0 || r.scheduleError).length > 0 && (
                <button
                  className="text-red-500 ml-2 underline underline-offset-2 cursor-pointer hover:text-red-700"
                  onClick={() => firstErrorRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  · {parsedRows.filter(r => r.errors.length > 0 || r.scheduleError).length} with errors
                </button>
              )}
              {parsedRows.filter(r => r.warnings.length > 0 && r.errors.length === 0).length > 0 && (
                <button
                  className="text-amber-500 ml-2 underline underline-offset-2 cursor-pointer hover:text-amber-700"
                  onClick={() => firstWarnRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  · {parsedRows.filter(r => r.warnings.length > 0 && r.errors.length === 0).length} with warnings
                </button>
              )}
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["#", "Candidate", "Interviewer", "Template", "Date", "Time", "Duration", "Round", ""].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => { firstErrorRowRef.current = null; firstWarnRowRef.current = null; return null; })()}
                    {parsedRows.map(row => {
                      const hasErr  = row.errors.length > 0 || !!row.scheduleError;
                      const hasWarn = row.warnings.length > 0 && !hasErr;
                      const setErrRef  = hasErr  && !firstErrorRowRef.current  ? (el => { firstErrorRowRef.current  = el; }) : undefined;
                      const setWarnRef = hasWarn && !firstWarnRowRef.current   ? (el => { firstWarnRowRef.current   = el; }) : undefined;
                      return (
                        <tr key={row.rowNum} ref={setErrRef || setWarnRef} className={hasErr ? "bg-red-50" : hasWarn ? "bg-amber-50" : "bg-white hover:bg-gray-50/70 transition-colors"}>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {row.rowNum}
                              {hasErr  && <XCircle className="w-3 h-3 text-red-500" title={row.errors.join(" · ")} />}
                              {hasWarn && <AlertTriangle className="w-3 h-3 text-amber-500" title={row.warnings.join(" · ")} />}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {row.resolved.candidate?.name || <span className="text-red-500">{row.raw.candidateEmail || row.raw.candidateUid}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.interviewer?.displayName || row.resolved.interviewer?.email || <span className="text-red-500">{row.raw.interviewerEmail}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.template?.name || <span className="text-red-500">{row.raw.templateName}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.scheduledDate ? formatDate(row.resolved.scheduledDate) : <span className="text-red-500">{row.raw.date}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.scheduledTime || <span className="text-red-500">{row.raw.time}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.duration ? `${row.resolved.duration}m` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{row.raw.round}</td>
                          <td className="px-3 py-2">
                            {row.scheduleError && (
                              <p className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3 flex-shrink-0" /> Failed: {row.scheduleError}</p>
                            )}
                            {hasErr && (
                              <div className="text-red-600 space-y-0.5">
                                {row.errors.map((e, i) => <p key={i} className="flex items-center gap-1"><XCircle className="w-3 h-3 flex-shrink-0" /> {e}</p>)}
                              </div>
                            )}
                            {hasWarn && (
                              <div className="text-amber-600 space-y-0.5">
                                {row.warnings.map((w, i) => <p key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}</p>)}
                              </div>
                            )}
                            {!hasErr && !hasWarn && !row.scheduleError && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {validCount > 0 && (
              <div className="flex gap-3 mt-4">
                <Button
                  variant="primary" size="lg" icon={CalendarPlus}
                  onClick={handleBulkSchedule}
                  disabled={scheduling}
                  className="flex-1">
                  {scheduling
                    ? `Scheduling…${progress ? ` (${progress.done} of ${progress.total})` : ""}`
                    : `Schedule ${validCount} Interview${validCount !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="secondary" size="lg" onClick={onClose} className="px-5">
                  Cancel
                </Button>
              </div>
            )}

            {parsedRows.every(r => r.errors.length > 0) && (
              <div className="flex items-center gap-2 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                All rows have errors — fix the sheet and re-parse.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
