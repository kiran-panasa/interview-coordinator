import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../AuthContext";
import { getCandidates, createCandidate, updateCandidate, deleteCandidate } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "" };

// ── CSV helpers ───────────────────────────────────────────────────────────────

function splitCSVRow(line) {
  const cols = [];
  let curr = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(curr.trim()); curr = ""; }
    else { curr += ch; }
  }
  cols.push(curr.trim());
  return cols;
}

function parseCandidatesCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["File must have a header row and at least one data row."] };

  const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const idx = (names) => names.map(n => headers.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;

  const nameIdx    = idx(["name"]);
  const uidIdx     = idx(["uid", "studentid", "id"]);
  const emailIdx   = idx(["email"]);
  const phoneIdx   = idx(["phone", "mobile"]);
  const resumeIdx  = idx(["resume", "link"]);
  const notesIdx   = idx(["notes", "remarks"]);

  if (nameIdx === -1) return { rows: [], errors: ["Missing required column: name"] };

  const errors = [], rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVRow(lines[i]);
    const name = c[nameIdx]?.trim();
    if (!name) { errors.push(`Row ${i + 1}: name is required`); continue; }
    rows.push({
      name,
      uid:        uidIdx    >= 0 ? c[uidIdx]?.trim()    || "" : "",
      email:      emailIdx  >= 0 ? c[emailIdx]?.trim()  || "" : "",
      phone:      phoneIdx  >= 0 ? c[phoneIdx]?.trim()  || "" : "",
      resumeLink: resumeIdx >= 0 ? c[resumeIdx]?.trim() || "" : "",
      notes:      notesIdx  >= 0 ? c[notesIdx]?.trim()  || "" : "",
    });
  }
  return { rows, errors };
}

function downloadSampleCSV() {
  const content = [
    "name,uid,email,phone,resumeLink,notes",
    "John Doe,STU-2024-001,john.doe@example.com,+91 98765 43210,https://drive.google.com/file/sample,Strong candidate",
    "Jane Smith,STU-2024-002,jane.smith@example.com,+91 98765 43211,,",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "candidates_sample.csv" });
  a.click();
}

function downloadSampleExcel() {
  const rows = [
    { name: "John Doe", uid: "STU-2024-001", email: "john.doe@example.com", phone: "+91 98765 43210", resumeLink: "https://drive.google.com/file/sample", notes: "Strong candidate" },
    { name: "Jane Smith", uid: "STU-2024-002", email: "jane.smith@example.com", phone: "+91 98765 43211", resumeLink: "", notes: "" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["name", "uid", "email", "phone", "resumeLink", "notes"] });
  ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 36 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  XLSX.writeFile(wb, "candidates_sample.xlsx");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { currentUser } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);

  // CSV import state
  const [showCSV,      setShowCSV]      = useState(false);
  const [csvPreview,   setCsvPreview]   = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileRef = useRef();

  const load = () => getCandidates().then(c => { setCandidates(c); setLoading(false); });
  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditTarget(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (c) => {
    setEditTarget(c);
    setForm({ name: c.name, uid: c.uid || "", email: c.email || "", phone: c.phone || "", resumeLink: c.resumeLink || "", notes: c.notes || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setToast({ message: "Name is required.", type: "error" });
    setSaving(true);
    try {
      if (editTarget) {
        await updateCandidate(editTarget.id, form);
        setToast({ message: "Candidate updated." });
      } else {
        await createCandidate({ ...form, createdBy: currentUser.uid });
        setToast({ message: "Candidate added." });
      }
      setShowModal(false); load();
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await deleteCandidate(c.id);
    setToast({ message: "Candidate deleted." });
    load();
  };

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseCandidatesCSV(ev.target.result);
      setCsvPreview(rows);
      setCsvErrors(errors);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCSVImport = async () => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    let imported = 0;
    for (const row of csvPreview) {
      try { await createCandidate({ ...row, createdBy: currentUser.uid }); imported++; }
      catch { /* skip failures */ }
    }
    setCsvImporting(false);
    setShowCSV(false);
    setCsvPreview([]);
    setCsvErrors([]);
    load();
    setToast({ message: `${imported} candidate${imported !== 1 ? "s" : ""} imported.` });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); };

  const filtered = candidates.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.uid?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{candidates.length} candidates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Candidate
          </button>
        </div>
      </div>

      <input type="text" placeholder="Search by name, UID, or email…" value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Name", "UID", "Email", "Resume", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-12">No candidates found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{c.uid || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    {c.resumeLink
                      ? <a href={c.resumeLink} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs hover:underline">View ↗</a>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(c)} className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                      <button onClick={() => handleDelete(c)} className="text-xs text-red-500 font-medium hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? "Edit Candidate" : "Add Candidate"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Doe" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>UID</label>
              <input value={form.uid} onChange={e => setField("uid", e.target.value)} placeholder="e.g. STU-2024-001" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setField("email", e.target.value)} placeholder="john@example.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Resume Link</label>
            <input type="url" value={form.resumeLink} onChange={e => setField("resumeLink", e.target.value)} placeholder="https://drive.google.com/…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)}
              placeholder="Any notes…" className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving…" : editTarget ? "Update" : "Add Candidate"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* CSV Import modal */}
      <Modal open={showCSV} onClose={closeCSV} title="Import Candidates from CSV" wide>
        <div className="space-y-5">
          {/* Download sample */}
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Template format</p>
            <p className="text-xs text-gray-400 mb-3">Columns: name, uid, email, phone, resumeLink, notes</p>
            <div className="flex gap-2">
              <button onClick={downloadSampleExcel}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Excel (.xlsx)
              </button>
              <button onClick={downloadSampleCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>
          </div>

          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
            <p className="text-xs text-gray-400">.csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
          </div>

          {/* Parse errors */}
          {csvErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Errors</p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {/* Preview table */}
          {csvPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{csvPreview.length} candidates ready to import</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {["Name", "UID", "Email", "Phone"].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvPreview.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{r.uid || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.phone || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={closeCSV}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleCSVImport} disabled={csvImporting || csvPreview.length === 0}
              className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {csvImporting ? "Importing…" : `Import ${csvPreview.length || ""} Candidates`}
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
