import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import {
  Search, Plus, Upload, UploadCloud, Users, Archive,
  FileSpreadsheet, FileText, AlertTriangle, AlertCircle,
} from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { createCandidate, updateCandidate, deleteCandidate, archiveCandidate, unarchiveCandidate } from "../../api/firestore";
import { usePrograms, useTemplates, useCandidates, QK } from "../../hooks/queries";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { SkeletonRows } from "../../components/Skeleton";
import { usePagination } from "../../hooks/usePagination";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "", program: "", templateIds: [] };

import { isUUID } from "../../utils/strings";
import { splitCSVRow } from "../../utils/csv";

const isSwapped = (c) => isUUID(c.name) && !!c.uid && !isUUID(c.uid);

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
    "uid,name,phone,email,program,templates,resumeLink,notes",
    "STU-2024-001,John Doe,+91 98765 43210,john.doe@example.com,NIAT,Product Mastery - Novice|Systems Mastery - Novice || V1,https://drive.google.com/file/sample,Strong candidate",
    "STU-2024-002,Jane Smith,+91 98765 43211,jane.smith@example.com,Academy,,,",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "candidates_sample.csv" });
  a.click();
}

function downloadSampleExcel() {
  const rows = [
    { uid: "STU-2024-001", name: "John Doe", phone: "+91 98765 43210", email: "john.doe@example.com", program: "NIAT", templates: "Product Mastery - Novice|Systems Mastery - Novice || V1", resumeLink: "https://drive.google.com/file/sample", notes: "Strong candidate" },
    { uid: "STU-2024-002", name: "Jane Smith", phone: "+91 98765 43211", email: "jane.smith@example.com", program: "Academy", templates: "", resumeLink: "", notes: "" },
  ];
  const header = ["uid", "name", "phone", "email", "program", "templates", "resumeLink", "notes"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 48 }, { wch: 36 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  XLSX.writeFile(wb, "candidates_sample.xlsx");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: candidates = [], isLoading } = useCandidates();
  const { data: programs   = [] } = usePrograms();
  const { data: templates  = [] } = useTemplates();
  const [activeProgram,  setActiveProgram]  = useState("all");
  const [search,         setSearch]         = useState("");
  const [showArchived,   setShowArchived]   = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);

  // Add/Edit Candidate modal — only templates belonging to the selected
  // Program are selectable, so a candidate can't end up assigned a template
  // from an unrelated program.
  const programTemplates = useMemo(
    () => templates.filter(t => t.program === form.program),
    [templates, form.program]
  );

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
        queryClient.setQueryData(QK.candidates, prev => (prev || []).map(c => c.id === editTarget.id ? { ...c, ...form } : c));
        setToast({ message: "Candidate updated." });
      } else {
        const createdAt = new Date().toISOString();
        const id = await createCandidate({ ...form, createdBy: currentUser.uid });
        queryClient.setQueryData(QK.candidates, prev => [{ id, ...form, createdAt, createdBy: currentUser.uid }, ...(prev || [])]);
        setToast({ message: "Candidate added." });
      }
      setShowModal(false);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await deleteCandidate(c.id);
    queryClient.setQueryData(QK.candidates, prev => (prev || []).filter(x => x.id !== c.id));
    setToast({ message: "Candidate deleted." });
  };

  const handleArchive = async (c) => {
    await archiveCandidate(c.id);
    queryClient.setQueryData(QK.candidates, prev => (prev || []).map(x => x.id === c.id ? { ...x, archived: true, archivedAt: new Date().toISOString() } : x));
    setToast({ message: "Candidate archived." });
  };

  const handleUnarchive = async (c) => {
    await unarchiveCandidate(c.id);
    queryClient.setQueryData(QK.candidates, prev => (prev || []).map(x => x.id === c.id ? { ...x, archived: false, archivedAt: null } : x));
    setToast({ message: "Candidate restored to active." });
  };

  const handleSwapNameUID = async (c) => {
    await updateCandidate(c.id, { name: c.uid, uid: c.name });
    queryClient.setQueryData(QK.candidates, prev => (prev || []).map(x => x.id === c.id ? { ...x, name: c.uid, uid: c.name } : x));
    setToast({ message: "Name and UID fixed." });
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
      await Promise.all([...selected].map(id => updateCandidate(id, updates)));
      queryClient.setQueryData(QK.candidates, prev => (prev || []).map(c => selected.has(c.id) ? { ...c, ...updates } : c));
      setToast({ message: `Updated ${selected.size} candidate${selected.size !== 1 ? "s" : ""}.` });
      setShowBulk(false);
      setSelected(new Set());
      setBulkProgram(""); setBulkTemplates([]);
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
    const programMap  = new Map(programs.map(p  => [p.name.toLowerCase(),  p.id]));
    const templateMap = new Map(templates.map(t => [t.name.toLowerCase(), t.id]));

    const results = await Promise.all(csvPreview.map(async (row) => {
      try {
        const { programName, templateNames, ...rest } = row;
        const resolvedProgram   = programMap.get(programName.toLowerCase()) || "";
        const resolvedTemplates = (templateNames || [])
          .map(name => templateMap.get(name.toLowerCase()))
          .filter(Boolean);
        const payload  = { ...rest, program: resolvedProgram, templateIds: resolvedTemplates };
        const existing = findExisting(row);
        if (existing) {
          if (mode === "replace") {
            await updateCandidate(existing.id, payload);
            return { type: "updated", row: { id: existing.id, ...payload } };
          }
          return { type: "skipped" };
        } else {
          const createdAt = new Date().toISOString();
          const id = await createCandidate({ ...payload, createdBy: currentUser.uid });
          return { type: "created", row: { id, ...payload, createdAt, createdBy: currentUser.uid } };
        }
      } catch { return { type: "skipped" }; }
    }));

    const newRows    = results.filter(r => r.type === "created").map(r => r.row);
    const updatedRows = results.filter(r => r.type === "updated").map(r => r.row);
    const created = newRows.length;
    const updated = updatedRows.length;
    const skipped = results.filter(r => r.type === "skipped").length;

    queryClient.setQueryData(QK.candidates, prev => {
      const updatedMap = new Map(updatedRows.map(r => [r.id, r]));
      const merged = (prev || []).map(c => updatedMap.has(c.id) ? { ...c, ...updatedMap.get(c.id) } : c);
      return [...newRows, ...merged];
    });
    setCsvImporting(false); setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null);
    const parts = [];
    if (created) parts.push(`${created} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    setToast({ message: parts.join(", ") + "." });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null); };

  const programNameMap = useMemo(
    () => new Map(programs.map(p => [p.id, p.name])),
    [programs]
  );
  const programName = useCallback(
    (id) => programNameMap.get(id) || id || "—",
    [programNameMap]
  );

  const archivedCount = useMemo(
    () => candidates.filter(c => c.archived === true).length,
    [candidates]
  );
  const workingSet = useMemo(
    () => candidates.filter(c => (c.archived === true) === showArchived),
    [candidates, showArchived]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return workingSet.filter(c => {
      if (activeProgram === "unassigned" && c.program) return false;
      if (activeProgram !== "all" && activeProgram !== "unassigned" && c.program !== activeProgram) return false;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.uid?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    });
  }, [workingSet, activeProgram, search]);

  const { paged: pagedCandidates, page: candPage, setPage: setCandPage, totalPages: candTotalPages, total: candTotal, pageSize: candPageSize } = usePagination(filtered, 10);

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFormTemplate = (tid) => setField("templateIds",
    form.templateIds.includes(tid) ? form.templateIds.filter(id => id !== tid) : [...form.templateIds, tid]
  );

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {candidates.length - archivedCount} active{archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="secondary" icon={Users} onClick={() => { setBulkProgram(""); setBulkTemplates([]); setShowBulk(true); }}>
              Edit Selected ({selected.size})
            </Button>
          )}
          <Button variant="secondary" icon={Upload} onClick={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}>
            Import CSV
          </Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>
            Add Candidate
          </Button>
        </div>
      </motion.div>

      {/* ── Program Tabs ── */}
      {programs.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="flex border-b border-gray-200 mb-5">
          {[
            { id: "all",        label: "All",        count: workingSet.length },
            ...programs.map(p => ({ id: p.id, label: p.name, count: workingSet.filter(c => c.program === p.id).length })),
            { id: "unassigned", label: "Unassigned", count: workingSet.filter(c => !c.program).length },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setCandPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeProgram === tab.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {tab.label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeProgram === tab.id ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
              }`}>{tab.count}</span>
            </button>
          ))}
        </motion.div>
      )}

      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="flex items-center gap-3 mb-5">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search by name, UID, or email…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors" />
        </div>
        <button
          onClick={() => { setShowArchived(s => !s); setCandPage(1); setSearch(""); }}
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
            showArchived
              ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
              : "text-gray-500 border-gray-200 hover:bg-gray-50"
          }`}>
          {showArchived ? (
            <>Active</>
          ) : (
            <><Archive className="w-3.5 h-3.5" /> {`Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}</>
          )}
        </button>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonRows count={6} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="accent-brand-600 w-4 h-4 cursor-pointer" />
                </th>
                {["Name", "UID", "Email", "Program", "Templates", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12">No candidates found</td></tr>
              ) : pagedCandidates.map((c, idx) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02, duration: 0.2 }}
                  className={`hover:bg-gray-50/70 transition-colors ${selected.has(c.id) ? "bg-brand-50" : ""}`}
                >
                  <td className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="accent-brand-600 w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{isSwapped(c) ? c.uid : c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                      {isSwapped(c) ? c.name : (c.uid || "—")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    {c.program
                      ? <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap">{programName(c.program)}</span>
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
                            <span key={tid} className="text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-full">{t.name}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      { label: "Edit",   onClick: () => openEdit(c), show: !showArchived },
                      ...(isSwapped(c) ? [{ label: "Fix: Swap Name ↔ UID", onClick: () => handleSwapNameUID(c), highlight: true }] : []),
                      { label: "Archive",   onClick: () => handleArchive(c),   show: c.archived !== true },
                      { label: "Unarchive", onClick: () => handleUnarchive(c), show: c.archived === true },
                      { label: "Delete", onClick: () => handleDelete(c), danger: true },
                    ]} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={candPage} totalPages={candTotalPages} total={candTotal} pageSize={candPageSize} onPageChange={setCandPage} />
      </motion.div>

      {/* Add / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? "Edit Candidate" : "Add Candidate"} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>UID</label>
              <input value={form.uid} onChange={e => setField("uid", e.target.value)} placeholder="e.g. STU-2024-001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Full Name *</label>
              <input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Doe" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setField("email", e.target.value)} placeholder="john@example.com" className={inputCls} />
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
              <select
                value={form.program}
                onChange={e => setForm(f => ({ ...f, program: e.target.value, templateIds: [] }))}
                className={inputCls}
              >
                <option value="">— None —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Templates ({form.templateIds.length} selected)</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {!form.program ? (
                  <p className="text-xs text-gray-400 text-center py-3">Select a program first</p>
                ) : programTemplates.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No templates for this program</p>
                ) : programTemplates.map(t => (
                  <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-50 last:border-0 text-xs transition-colors ${form.templateIds.includes(t.id) ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={form.templateIds.includes(t.id)} onChange={() => toggleFormTemplate(t.id)} className="accent-brand-600" />
                    <span className="font-medium text-gray-800">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="lg" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editTarget ? "Update" : "Add Candidate"}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setShowModal(false)}>Cancel</Button>
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
                <label key={t.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${bulkTemplates.includes(t.id) ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                  <input type="checkbox" checked={bulkTemplates.includes(t.id)} onChange={() => toggleBulkTemplate(t.id)} className="accent-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    {t.program && <p className="text-xs text-gray-400">{t.program}</p>}
                  </div>
                </label>
              ))}
            </div>
            {bulkTemplates.length > 0 && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> This will replace existing template assignments for selected candidates.
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="lg" className="flex-1" onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving ? "Saving…" : `Update ${selected.size} Candidates`}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setShowBulk(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* CSV Import modal */}
      <Modal open={showCSV} onClose={closeCSV} title="Import Candidates from CSV" wide>
        <div className="space-y-5">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Template format</p>
            <p className="text-xs text-gray-400 mb-3">
              Columns: <span className="font-mono">uid, name, phone, email, program, templates, resumeLink, notes</span>
              <br />Use <span className="font-mono">|</span> to separate multiple templates (e.g. <span className="font-mono">Template A|Template B</span>). Program and template values must match exact names in the system.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={downloadSampleExcel}
                className="!text-emerald-700 !border-emerald-200 hover:!bg-emerald-50">
                Download Excel (.xlsx)
              </Button>
              <Button variant="secondary" size="sm" icon={FileText} onClick={downloadSampleCSV}
                className="!text-brand-600 !border-brand-200 hover:!bg-brand-50">
                Download CSV
              </Button>
            </div>
          </div>

          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors">
            <UploadCloud className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
            <p className="text-xs text-gray-400">.csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
          </div>

          {csvErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Errors
              </p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {csvPreview.length > 0 && (() => {
            const dupeCount = csvPreview.filter(r => findExisting(r)).length;
            return dupeCount > 0 && csvMode === null ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
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
                                <span key={j} className="inline-block text-[10px] bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">{t}</span>
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
            <Button variant="secondary" size="lg" className="flex-1" onClick={closeCSV}>Cancel</Button>
            {csvPreview.length > 0 && (() => {
              const hasDupes = csvPreview.some(r => findExisting(r));
              const needsChoice = hasDupes && csvMode === null;
              const effectiveMode = csvMode || (hasDupes ? null : "append");
              return (
                <Button
                  variant="primary" size="lg" className="flex-1"
                  onClick={() => effectiveMode && handleCSVImport(effectiveMode)}
                  disabled={csvImporting || csvPreview.length === 0 || needsChoice}
                >
                  {csvImporting ? "Importing…" : needsChoice ? "Choose how to handle duplicates ↑" : `Import ${csvPreview.length} Candidates`}
                </Button>
              );
            })()}
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
