import { useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";

const FALLBACK_SKILL_NAMES = ["Java", "Python", "MERN", "DSML"];

export default function ImportSkillsModal({
  open, onClose,
  csvText, setCsvText,
  parseResult, setParseResult,
  handleParseCSV, handleImport, importing,
  skills = [],
}) {
  const firstErrorRowRef = useRef(null);
  const rows = parseResult?.rows || null;
  const errorRows = rows ? rows.filter(r => r.error) : [];
  const validRows = rows ? rows.filter(r => !r.error) : [];

  const downloadSampleCSV = () => {
    const skillNames = skills.length ? skills.slice(0, 6).map(s => s.name) : FALLBACK_SKILL_NAMES;
    const header = ["Panelist Name", ...skillNames].join(",");
    const sampleRow = (name, pattern) => [name, ...pattern.map(v => (v ? "TRUE" : "FALSE"))].join(",");
    const rowsCsv = [
      sampleRow("Interviewer One", skillNames.map((_, i) => i % 2 === 0)),
      sampleRow("Interviewer Two", skillNames.map(() => true)),
    ];
    const csv = [header, ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "interviewer_skills_sample.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Interviewer Skills" wide>
      <div className="space-y-5">

        {/* Format reference */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400" /> CSV Format
            </p>
            <button type="button" onClick={downloadSampleCSV}
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              <Download className="w-3.5 h-3.5" /> Download sample CSV
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Same shape as your skills spreadsheet — a matrix. First column is the interviewer's{" "}
            <span className="font-mono text-brand-700">Panelist Name</span> (or <span className="font-mono text-brand-700">Email</span>),
            every column after that is a skill name (Java, Python, MERN…), and a checked/TRUE cell means that
            interviewer has that skill. If you export straight from Google Sheets, checkbox columns come through
            as TRUE/FALSE automatically — that's fine as-is.
          </p>
          <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc pl-4">
            <li>Matching by name works, but if two interviewers share a name it'll be flagged — add an <span className="font-mono text-brand-700">Email</span> column for a guaranteed match.</li>
            <li>A skill name that doesn't exist yet in Settings → Skills gets created automatically.</li>
            <li>Only the skills that appear as columns here get changed — any other skill an interviewer already has is left untouched.</li>
          </ul>
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
                reader.onload = ev => { setCsvText(ev.target.result); setParseResult(null); };
                reader.readAsText(file);
                e.target.value = "";
              }} />
            </label>
          </div>
          <textarea
            rows={6}
            value={csvText}
            onChange={e => { setCsvText(e.target.value); setParseResult(null); }}
            placeholder={"Panelist Name,Java,Python,MERN,DSML\nIsha Rawat,TRUE,FALSE,TRUE,TRUE\nAbhishek Sharma,TRUE,TRUE,TRUE,TRUE"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
          />
        </div>

        <button
          onClick={handleParseCSV}
          disabled={!csvText.trim()}
          className="w-full border border-brand-200 text-brand-700 bg-brand-50 rounded-xl py-2 text-sm font-semibold hover:bg-brand-100 disabled:opacity-40 transition-colors">
          Parse &amp; Preview
        </button>

        {parseResult?.globalError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <XCircle className="w-4 h-4 flex-shrink-0" /> {parseResult.globalError}
          </div>
        )}

        {/* Preview */}
        {rows && (
          <div>
            {parseResult.newSkillNames.length > 0 && (
              <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-sm text-violet-700 mb-3">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  <span className="font-semibold">{parseResult.newSkillNames.length} new skill{parseResult.newSkillNames.length !== 1 ? "s" : ""}</span>{" "}
                  will be created in Settings → Skills: {parseResult.newSkillNames.join(", ")}
                </p>
              </div>
            )}

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Preview — {rows.length} row{rows.length !== 1 ? "s" : ""}
              {errorRows.length > 0 && (
                <button
                  className="text-red-500 ml-2 underline underline-offset-2 cursor-pointer hover:text-red-700"
                  onClick={() => firstErrorRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  · {errorRows.length} with errors
                </button>
              )}
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["#", "Interviewer", "Matched by", "Skills to add", "Skills to remove", ""].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => { firstErrorRowRef.current = null; return null; })()}
                    {rows.map(row => {
                      const setErrRef = row.error && !firstErrorRowRef.current ? (el => { firstErrorRowRef.current = el; }) : undefined;
                      return (
                        <tr key={row.rowNum} ref={setErrRef} className={row.error ? "bg-red-50" : "bg-white hover:bg-gray-50/70 transition-colors"}>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{row.rowNum}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {row.interviewer?.displayName || row.interviewer?.email || <span className="text-red-500">{row.rawLabel}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{row.matchedBy}</td>
                          <td className="px-3 py-2">
                            {row.willAdd.length ? (
                              <div className="flex flex-wrap gap-1">
                                {row.willAdd.map(n => (
                                  <span key={n} className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">+{n}</span>
                                ))}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {row.willRemove.length ? (
                              <div className="flex flex-wrap gap-1">
                                {row.willRemove.map(n => (
                                  <span key={n} className="text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full">-{n}</span>
                                ))}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {row.error ? (
                              <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3 flex-shrink-0" /> {row.error}</span>
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {validRows.length > 0 && (
              <div className="flex gap-3 mt-4">
                <Button
                  variant="primary" size="lg"
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1">
                  {importing ? "Importing…" : `Import ${validRows.length} Interviewer${validRows.length !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="secondary" size="lg" onClick={onClose} className="px-5">
                  Cancel
                </Button>
              </div>
            )}

            {validRows.length === 0 && (
              <div className="flex items-center gap-2 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                All rows have errors — fix the CSV and re-parse.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
