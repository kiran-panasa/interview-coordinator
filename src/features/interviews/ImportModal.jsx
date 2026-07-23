import { useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { formatDate } from "../../utils/dates";

export default function ImportModal({
  open, onClose,
  csvText, setCsvText,
  parsedRows, setParsedRows,
  dlTemplateId, setDlTemplateId,
  templates,
  handleParseCSV, handleImport, importing,
  downloadImportTemplate,
}) {
  const firstErrorRowRef = useRef(null);
  const firstWarnRowRef  = useRef(null);

  return (
    <Modal open={open} onClose={onClose} title="Import Interviews from Sheet" wide>
      <div className="space-y-5">

        {/* Format reference */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400" /> CSV Format
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
                  ["interviewerEmail", "Yes", "interviewer@nxtwave.tech (need not be signed up yet)"],
                  ["templateName",     "Yes", "Product Mastery - Novice"],
                  ["date",             "Yes", "15/06/2026 or 2026-06-15"],
                  ["time",             "Yes", "10:00 AM or 14:30"],
                  ["round",            "No",  "Round 1 (default)"],
                  ["verdict",          "No",  "Proceed / Hold / Reject — omit to create as scheduled (pending)"],
                  ["notes",            "No",  "Overall feedback notes"],
                  ["meetingLink",          "No", "https://meet.google.com/abc-defg-hij"],
                  ["meetingRecordingLink", "No", "Link to the recorded meeting"],
                  ["{domainId}_{fieldId}_rating","No",  "e.g. coding_ps_rating → score for that specific card field (0–5)"],
                  ["{domainId}_rating",          "No",  "e.g. resume_rating → for domains with no card fields"],
                  ["{domainId}_notes",            "No",  "e.g. coding_notes → overall remarks for that domain"],
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
            <p className="text-xs text-gray-500 mb-2">Download a ready-to-fill CSV with domain columns for a specific template:</p>
            <div className="flex gap-2">
              <select
                value={dlTemplateId}
                onChange={e => setDlTemplateId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
                <option value="">— Select template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Button
                variant="primary" size="sm" icon={Download}
                disabled={!dlTemplateId}
                onClick={() => downloadImportTemplate(templates.find(t => t.id === dlTemplateId))}>
                Download CSV
              </Button>
            </div>
          </div>
        </div>

        {/* CSV input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Paste CSV or upload file</label>
            <label className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-700 cursor-pointer">
              <Upload className="w-3 h-3" /> Upload file
              <input type="file" accept=".csv,.txt" className="hidden" onChange={e => {
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
            placeholder={"candidateEmail,interviewerEmail,templateName,date,time,round,verdict,notes,meetingLink,meetingRecordingLink\njohn@example.com,interviewer@nxtwave.tech,Product Mastery - Novice,15/06/2026,10:00 AM,Round 1,Proceed,Good candidate,https://meet.google.com/abc-defg-hij,"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
          />
        </div>

        <button
          onClick={handleParseCSV}
          disabled={!csvText.trim()}
          className="w-full border border-brand-200 text-brand-700 bg-brand-50 rounded-xl py-2 text-sm font-semibold hover:bg-brand-100 disabled:opacity-40 transition-colors">
          Parse &amp; Preview
        </button>

        {/* Preview */}
        {parsedRows && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Preview — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""}
              {parsedRows.filter(r => r.errors.length > 0).length > 0 && (
                <button
                  className="text-red-500 ml-2 underline underline-offset-2 cursor-pointer hover:text-red-700"
                  onClick={() => firstErrorRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  · {parsedRows.filter(r => r.errors.length > 0).length} with errors
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
                      {["#", "Action", "Candidate", "Interviewer", "Template", "Date", "Time", "Round", "Verdict", "Feedback", ""].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => { firstErrorRowRef.current = null; firstWarnRowRef.current = null; return null; })()}
                    {parsedRows.map(row => {
                      const hasErr  = row.errors.length > 0;
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
                          <td className="px-3 py-2">
                            {row.resolved.existingInterview ? (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">Update existing</span>
                            ) : (
                              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">Create new</span>
                            )}
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
                          <td className="px-3 py-2 text-gray-600">{row.raw.round}</td>
                          <td className="px-3 py-2">
                            {row.resolved.verdict && (
                              <span className={`font-semibold ${row.resolved.verdict === "Proceed" ? "text-emerald-600" : row.resolved.verdict === "Reject" ? "text-red-500" : "text-amber-600"}`}>
                                {row.resolved.verdict}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.resolved.hasDomainFeedback ? (
                              <span className="text-xs text-brand-600 font-semibold">
                                {Object.keys(row.resolved.domainData).filter(k => k.endsWith("_rating") && row.resolved.domainData[k]).length} domains
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">verdict only</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
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
                            {!hasErr && !hasWarn && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {parsedRows.filter(r => r.errors.length === 0).length > 0 && (
              <div className="flex gap-3 mt-4">
                <Button
                  variant="primary" size="lg"
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1">
                  {importing
                    ? "Importing…"
                    : `Import ${parsedRows.filter(r => r.errors.length === 0).length} Interview${parsedRows.filter(r => r.errors.length === 0).length !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="secondary" size="lg" onClick={onClose} className="px-5">
                  Cancel
                </Button>
              </div>
            )}

            {parsedRows.every(r => r.errors.length > 0) && (
              <div className="flex items-center gap-2 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                All rows have errors — fix the CSV and re-parse.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
