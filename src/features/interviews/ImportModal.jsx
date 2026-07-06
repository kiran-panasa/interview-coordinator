import { useRef } from "react";
import Modal from "../../components/Modal";
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
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">CSV Format</p>
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
                  ["candidateEmail",   "Yes", "john@example.com"],
                  ["interviewerEmail", "Yes", "interviewer@nxtwave.tech (need not be signed up yet)"],
                  ["templateName",     "Yes", "Product Mastery - Novice"],
                  ["date",             "Yes", "15/06/2026 or 2026-06-15"],
                  ["time",             "Yes", "10:00 AM or 14:30"],
                  ["round",            "No",  "Round 1 (default)"],
                  ["verdict",          "No",  "Proceed / Hold / Reject — omit to create as scheduled (pending)"],
                  ["notes",            "No",  "Overall feedback notes"],
                  ["{domainId}_{fieldId}_rating","No",  "e.g. coding_ps_rating → score for that specific card field (0–5)"],
                  ["{domainId}_rating",          "No",  "e.g. resume_rating → for domains with no card fields"],
                  ["{domainId}_notes",            "No",  "e.g. coding_notes → overall remarks for that domain"],
                ].map(([col, req, ex]) => (
                  <tr key={col}>
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-indigo-700">{col}</td>
                    <td className="py-1.5 pr-4">
                      {req === "Yes"
                        ? <span className="text-red-500 font-semibold">Yes</span>
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
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— Select template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                disabled={!dlTemplateId}
                onClick={() => downloadImportTemplate(templates.find(t => t.id === dlTemplateId))}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                Download CSV
              </button>
            </div>
          </div>
        </div>

        {/* CSV input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Paste CSV or upload file</label>
            <label className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer">
              Upload file
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
            placeholder={"candidateEmail,interviewerEmail,templateName,date,time,round,verdict,notes\njohn@example.com,interviewer@nxtwave.tech,Product Mastery - Novice,15/06/2026,10:00 AM,Round 1,Proceed,Good candidate"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <button
          onClick={handleParseCSV}
          disabled={!csvText.trim()}
          className="w-full border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg py-2 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-40">
          Parse & Preview
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
                      {["#", "Candidate", "Interviewer", "Template", "Date", "Time", "Round", "Verdict", "Feedback", ""].map(h => (
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
                        <tr key={row.rowNum} ref={setErrRef || setWarnRef} className={hasErr ? "bg-red-50" : hasWarn ? "bg-amber-50" : "bg-white"}>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                            {row.rowNum}
                            {hasErr  && <span className="ml-1 text-red-500"   title={row.errors.join(" · ")}>✕</span>}
                            {hasWarn && <span className="ml-1 text-amber-500" title={row.warnings.join(" · ")}>⚠</span>}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {row.resolved.candidate?.name || <span className="text-red-500">{row.raw.candidateEmail}</span>}
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
                              <span className="text-xs text-indigo-600 font-semibold">
                                {Object.keys(row.resolved.domainData).filter(k => k.endsWith("_rating") && row.resolved.domainData[k]).length} domains
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">verdict only</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasErr && (
                              <div className="text-red-600 space-y-0.5">
                                {row.errors.map((e, i) => <p key={i}>✕ {e}</p>)}
                              </div>
                            )}
                            {hasWarn && (
                              <div className="text-amber-600 space-y-0.5">
                                {row.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                              </div>
                            )}
                            {!hasErr && !hasWarn && <span className="text-emerald-500">✓</span>}
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
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                  {importing
                    ? "Importing…"
                    : `Import ${parsedRows.filter(r => r.errors.length === 0).length} Interview${parsedRows.filter(r => r.errors.length === 0).length !== 1 ? "s" : ""}`}
                </button>
                <button onClick={onClose}
                  className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
                  Cancel
                </button>
              </div>
            )}

            {parsedRows.every(r => r.errors.length > 0) && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                All rows have errors — fix the CSV and re-parse.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
