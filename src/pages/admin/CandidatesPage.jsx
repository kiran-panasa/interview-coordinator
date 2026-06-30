import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../AuthContext";
import { getCandidates, createCandidate, updateCandidate, deleteCandidate, subscribeToPrograms, getTemplates } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "", program: "", templateIds: [] };

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

  const nameIdx      = idx(["name"]);
  const uidIdx       = idx(["uid", "studentid", "id"]);
  const emailIdx     = idx(["email"]);
  const phoneIdx     = idx(["phone", "mobile"]);
  const resumeIdx    = idx(["resume", "link"]);
  const notesIdx     = idx(["notes", "remarks"]);
  const programIdx   = idx(["program"]);
  const templatesIdx = idx(["templates", "template"]);

  if (nameIdx === -1) return { rows: [], errors: ["Missing required column: name"] };

  const errors = [], rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVRow(lines[i]);
    const name = c[nameIdx]?.trim();
    if (!name) { errors.push(`Row ${i + 1}: name is required`); continue; }
    rows.push({
      name,
      uid:           uidIdx       >= 0 ? c[uidIdx]?.trim()       || "" : "",
      email:         emailIdx     >= 0 ? c[emailIdx]?.trim()     || "" : "",
      phone:         phoneIdx     >= 0 ? c[phoneIdx]?.trim()     || "" : "",
      resumeLink:    resumeIdx    >= 0 ? c[resumeIdx]?.trim()    || "" : "",
      notes:         notesIdx     >= 0 ? c[notesIdx]?.trim()     || "" : "",
      programName:   programIdx   >= 0 ? c[programIdx]?.trim()   || "" : "",
      templateNames: templatesIdx >= 0
        ? (c[templatesIdx] || "").split("|").map(t => t.trim()).filter(Boolean)
        : [],
    });
  }
  return { rows, errors };
}

function downloadSampleCSV() {
  const content = [
    "name,uid,email,phone,resumeLink,notes,program,templates",
    "John Doe,STU-2024-001,john.doe@example.com,+91 98765 43210,https://drive.google.com/file/sample,Strong candidate,NIAT,Product Mastery - Novice|Systems Mastery - Novice || V1",
    "Jane Smith,STU-2024-002,jane.smith@example.com,+91 98765 43211,,,Academy,",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "candidates_sample.csv" });
  a.click();
}

function downloadSampleExcel() {
  const rows = [
    { name: "John Doe", uid: "STU-2024-001", email: "john.doe@example.com", phone: "+91 98765 43210", resumeLink: "https://drive.google.com/file/sample", notes: "Strong candidate", program: "NIAT", templates: "Product Mastery - Novice|Systems Mastery - Novice || V1" },
    { name: "Jane Smith", uid: "STU-2024-002", email: "jane.smith@example.com", phone: "+91 98765 43211", resumeLink: "", notes: "", program: "Academy", templates: "" },
  ];
  const header = ["name", "uid", "email", "phone", "resumeLink", "notes", "program", "templates"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 36 }, { wch: 24 }, { wch: 14 }, { wch: 48 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  XLSX.writeFile(wb, "candidates_sample.xlsx");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { currentUser } = useAuth();
  const [candidates,     setCandidates]     = useState([]);
  const [programs,       setPrograms]       = useState([]);
  const [templates,      setTemplates]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeProgram,  setActiveProgram]  = useState("all");
  const [search,         setSearch]         = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);

  // Bulk edit
  const [selected,      setSelected]      = useState(new Set());
  const [showBulk,      setShowBulk]      = useState(false);
  const [bulkProgram,   setBulkProgram]   = useState("");
  const [bulkTemplates, setBulkTemplates] = useState([]);
  const [bulkSaving,    setBulkSaving]    = useState(false);

  // CSV import
  const [showCSV,      setShowCSV]      = useState(false);
  const [csvPreview,   setCsvPreview]   = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMode,      setCsvMode]      = useState(null); // null | "append" | "replace"
  const fileRef = useRef();

  const load = () => getCandidates().then(c => { setCandidates(c); setLoading(false); });

  useEffect(() => {
    load();
    getTemplates().then(setTemplates);
    const unsubPrograms = subscribeToPrograms(setPrograms);
    return () => unsubPrograms();
  }, []);

  const openNew  = () => { setEditTarget(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (c) => {
    setEditTarget(c);
    setForm({
      name: c.name, uid: c.uid || "", email: c.email || "",
      phone: c.phone || "", resumeLink: c.resumeLink || "", notes: c.notes || "",
      program: c.program || "", templateIds: c.templateIds || [],
    });
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

  const handleBulkSave = async () => {
    if (!bulkProgram && bulkTemplates.length === 0) {
      setToast({ message: "Set at least a program or template.", type: "error" }); return;
    }
    setBulkSaving(true);
    try {
      const updates = {};
      if (bulkProgram)           updates.program     = bulkProgram;
      if (bulkTemplates.length)  updates.templateIds = bulkTemplates;
      for (const id of selected) await updateCandidate(id, updates);
      setToast({ message: `Updated ${selected.size} candidate${selected.size !== 1 ? "s" : ""}.` });
      setShowBulk(false);
      setSelected(new Set());
      setBulkProgram(""); setBulkTemplates([]);
      load();
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setBulkSaving(false);
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const toggleBulkTemplate = (tid) => setBulkTemplates(prev =>
    prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]
  );

  const findExisting = (row) =>
    candidates.find(c =>
      (row.email && c.email?.toLowerCase() === row.email.toLowerCase()) ||
      (row.uid   && c.uid?.toLowerCase()   === row.uid.toLowerCase())
    );

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseCandidatesCSV(ev.target.result);
      setCsvPreview(rows); setCsvErrors(errors); setCsvMode(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCSVImport = async (mode) => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    let created = 0, updated = 0, skipped = 0;
    for (const row of csvPreview) {
      try {
        const { programName, templateNames, ...rest } = row;
        const resolvedProgram = programs.find(p => p.name.toLowerCase() === programName.toLowerCase())?.id || "";
        const resolvedTemplates = (templateNames || [])
          .map(name => templates.find(t => t.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean);
        const payload = { ...rest, program: resolvedProgram, templateIds: resolvedTemplates };
        const existing = findExisting(row);
        if (existing) {
          if (mode === "replace") { await updateCandidate(existing.id, payload); updated++; }
          else skipped++;
        } else {
          await createCandidate({ ...payload, createdBy: currentUser.uid }); created++;
        }
      } catch { /* skip */ }
    }
    setCsvImporting(false); setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null);
    load();
    const parts = [];
    if (created) parts.push(`${created} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    setToast({ message: parts.join(", ") + "." });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null); };

  const filtered = candidates.filter(c => {
    if (activeProgram === "unassigned" && c.program) return false;
    if (activeProgram !== "all" && activeProgram !== "unassigned" && c.program !== activeProgram) return false;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.uid?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });
  const { paged: pagedCandidates, page: candPage, setPage: setCandPage, totalPages: candTotalPages, total: candTotal, pageSize: candPageSize } = usePagination(filtered, 10);

  const programName = (id) => programs.find(p => p.id === id)?.name || id || "—";

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFormTemplate = (tid) => setField("templateIds",
    form.templateIds.includes(tid) ? form.templateIds.filter(id => id !== tid) : [...form.templateIds, tid]
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{candidates.length} candidates</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button onClick={() => { setBulkProgram(""); setBulkTemplates([]); setShowBulk(true); }}
              className="flex items-center gap-2 border border-indigo-300 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100">
              Edit Selected ({selected.size})
            </button>
          )}
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

      {/* ── Program Tabs ── */}
      {programs.length > 0 && (
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {[
            { id: "all",        label: "All",        count: candidates.length },
            ...programs.map(p => ({ id: p.id, label: p.name, count: candidates.filter(c => c.program === p.id).length })),
            { id: "unassigned", label: "Unassigned", count: candidates.filter(c => !c.program).length },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setCandPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeProgram === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
              }`}>
              {tab.label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeProgram === tab.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

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
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="accent-indigo-600 w-4 h-4 cursor-pointer" />
                </th>
                {["Name", "UID", "Email", "Program", "Templates", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12">No candidates found</td></tr>
              ) : pagedCandidates.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 ${selected.has(c.id) ? "bg-indigo-50" : ""}`}>
                  <td className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="accent-indigo-600 w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{c.uid || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    {c.program
                      ? <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{programName(c.program)}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(c.templateIds || []).length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(c.templateIds || []).map(tid => {
                          const t = templates.find(x => x.id === tid);
                          return t ? (
                            <span key={tid} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">{t.name}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      { label: "Edit",   onClick: () => openEdit(c) },
                      { label: "Delete", onClick: () => handleDelete(c), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={candPage} totalPages={candTotalPages} total={candTotal} pageSize={candPageSize} onPageChange={setCandPage} />
      </div>

      {/* Add / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? "Edit Candidate" : "Add Candidate"} wide>
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
            <textarea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Any notes…" className={`${inputCls} resize-none`} />
          </div>

          {/* Program + Templates */}
          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Program</label>
              <select value={form.program} onChange={e => setField("program", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Templates ({form.templateIds.length} selected)</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No templates</p>
                ) : templates.map(t => (
                  <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-50 last:border-0 text-xs transition-colors ${form.templateIds.includes(t.id) ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={form.templateIds.includes(t.id)} onChange={() => toggleFormTemplate(t.id)} className="accent-indigo-600" />
                    <span className="font-medium text-gray-800">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
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

      {/* Bulk Edit modal */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title={`Bulk Edit — ${selected.size} candidates`} wide>
        <div className="space-y-5">
          <p className="text-sm text-gray-500">Only filled fields will be updated. Leave blank to keep existing values.</p>
          <div>
            <label className={labelCls}>Assign Program</label>
            <select value={bulkProgram} onChange={e => setBulkProgram(e.target.value)} className={inputCls}>
              <option value="">— Keep existing —</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Assign Templates ({bulkTemplates.length} selected)</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No templates</p>
              ) : templates.map(t => (
                <label key={t.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${bulkTemplates.includes(t.id) ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                  <input type="checkbox" checked={bulkTemplates.includes(t.id)} onChange={() => toggleBulkTemplate(t.id)} className="accent-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    {t.program && <p className="text-xs text-gray-400">{t.program}</p>}
                  </div>
                </label>
              ))}
            </div>
            {bulkTemplates.length > 0 && <p className="text-xs text-amber-600 mt-1.5">⚠ This will replace existing template assignments for selected candidates.</p>}
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleBulkSave} disabled={bulkSaving}
              className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {bulkSaving ? "Saving…" : `Update ${selected.size} Candidates`}
            </button>
            <button onClick={() => setShowBulk(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* CSV Import modal */}
      <Modal open={showCSV} onClose={closeCSV} title="Import Candidates from CSV" wide>
        <div className="space-y-5">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Template format</p>
            <p className="text-xs text-gray-400 mb-3">
              Columns: <span className="font-mono">name, uid, email, phone, resumeLink, notes, program, templates</span>
              <br />Use <span className="font-mono">|</span> to separate multiple templates (e.g. <span className="font-mono">Template A|Template B</span>). Program and template values must match exact names in the system.
            </p>
            <div className="flex gap-2">
              <button onClick={downloadSampleExcel}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                Download Excel (.xlsx)
              </button>
              <button onClick={downloadSampleCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                Download CSV
              </button>
            </div>
          </div>

          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
            <p className="text-xs text-gray-400">.csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
          </div>

          {csvErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Errors</p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {csvPreview.length > 0 && (() => {
            const dupeCount = csvPreview.filter(r => findExisting(r)).length;
            return dupeCount > 0 && csvMode === null ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">
                  {dupeCount} of {csvPreview.length} candidate{dupeCount !== 1 ? "s" : ""} already exist{dupeCount === 1 ? "s" : ""} (matched by email or UID).
                </p>
                <p className="text-xs text-amber-700">How would you like to handle duplicates?</p>
                <div className="flex gap-2">
                  <button onClick={() => setCsvMode("append")}
                    className="flex-1 py-2 bg-white border border-amber-300 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors">
                    Skip duplicates — only add {csvPreview.length - dupeCount} new
                  </button>
                  <button onClick={() => setCsvMode("replace")}
                    className="flex-1 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors">
                    Update existing + add new
                  </button>
                </div>
              </div>
            ) : null;
          })()}

          {csvPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{csvPreview.length} candidates ready to import</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {["Name", "UID", "Email", "Program", "Templates"].map(h => (
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
                        <td className="px-3 py-2 text-gray-600">{r.programName || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.templateNames?.length
                            ? r.templateNames.map((t, j) => (
                                <span key={j} className="inline-block text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">{t}</span>
                              ))
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={closeCSV}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
            {csvPreview.length > 0 && (() => {
              const hasDupes = csvPreview.some(r => findExisting(r));
              const needsChoice = hasDupes && csvMode === null;
              const effectiveMode = csvMode || (hasDupes ? null : "append");
              return (
                <button
                  onClick={() => effectiveMode && handleCSVImport(effectiveMode)}
                  disabled={csvImporting || csvPreview.length === 0 || needsChoice}
                  className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                  {csvImporting ? "Importing…" : needsChoice ? "Choose how to handle duplicates ↑" : `Import ${csvPreview.length} Candidates`}
                </button>
              );
            })()}
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
