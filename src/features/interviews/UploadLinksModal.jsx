import { useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { downloadLinksTemplate } from "../../utils/interviewImport";

export default function UploadLinksModal({
  open, onClose,
  csvText, setCsvText,
  parsedRows, setParsedRows,
  handleParseCSV, handleImport, importing,
}) {
  const firstErrorRowRef = useRef(null);
  const validCount = parsedRows ? parsedRows.filter(r => r.errors.length === 0).length : 0;

  return (
    <Modal open={open} onClose={onClose} title="Upload Meeting & Recording Links" wide>
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
                  ["candidateEmail",       "Yes*", "john@example.com — *either this or candidateUid is required"],
                  ["candidateUid",         "Yes*", "use when email isn't reliable/known"],
                  ["templateName",         "Yes",  "AI SYSTEMS MASTERY"],
                  ["date",                 "No",   "15/06/2026 — only needed if this candidate has more than one interview for the template"],
                  ["meetingLink",          "Yes*", "https://meet.google.com/abc-defg-hij — *at least one link column is required"],
                  ["meetingRecordingLink", "Yes*", "Link to the recorded meeting"],
                  ["transcriptLink",       "No",   "A Google Doc link — lets Transcript open it directly and AI Report generate from it"],
                ].map(([col, req, ex]) => (
                  <tr key={col}>
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-brand-700">{col}</td>
                    <td className="py-1.5 pr-4">
                      {req.startsWith("Yes")
                        ? <span className="text-red-500 font-semibold">{req}</span>
                        : <span className="text-gray-400">{req}</span>}
                    </td>
                    <td className="py-1.5 text-gray-500">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            This only updates interviews that already exist — it matches each row to one by candidate + template
            (and date, if given) and writes the link(s) onto it. It never creates a new interview.
          </p>
          <button onClick={downloadLinksTemplate}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download Sample CSV
          </button>
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
            placeholder={"candidateEmail,templateName,meetingLink,meetingRecordingLink,transcriptLink\njohn@example.com,AI SYSTEMS MASTERY,https://meet.google.com/abc-defg-hij,https://drive.google.com/file/d/xxxx/view,https://docs.google.com/document/d/xxxx/edit"}
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
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["#", "Candidate", "Template", "Matched Interview", "Links", ""].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => { firstErrorRowRef.current = null; return null; })()}
                    {parsedRows.map(row => {
                      const hasErr = row.errors.length > 0;
                      const setErrRef = hasErr && !firstErrorRowRef.current ? (el => { firstErrorRowRef.current = el; }) : undefined;
                      return (
                        <tr key={row.rowNum} ref={setErrRef} className={hasErr ? "bg-red-50" : "bg-white hover:bg-gray-50/70 transition-colors"}>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {row.rowNum}
                              {hasErr && <XCircle className="w-3 h-3 text-red-500" />}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {row.resolved.candidate?.name || <span className="text-red-500">{row.raw.candidateEmail || row.raw.candidateUid}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.template?.name || <span className="text-red-500">{row.raw.templateName}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.existingInterview
                              ? <span className="text-emerald-700">{row.resolved.existingInterview.status}{row.resolved.existingInterview.scheduledDate ? ` · ${row.resolved.existingInterview.scheduledDate}` : ""}</span>
                              : <span className="text-red-500">Not found</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {[row.raw.meetingLink && "Meeting", row.raw.meetingRecordingLink && "Recording", row.raw.transcriptLink && "Transcript"].filter(Boolean).join(" + ") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {hasErr ? (
                              <div className="text-red-600 space-y-0.5">
                                {row.errors.map((e, i) => <p key={i} className="flex items-center gap-1"><XCircle className="w-3 h-3 flex-shrink-0" /> {e}</p>)}
                              </div>
                            ) : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
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
                <Button variant="primary" size="lg" onClick={handleImport} disabled={importing} className="flex-1">
                  {importing ? "Updating…" : `Update ${validCount} Interview${validCount !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="secondary" size="lg" onClick={onClose} className="px-5">
                  Cancel
                </Button>
              </div>
            )}

            {validCount === 0 && (
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
