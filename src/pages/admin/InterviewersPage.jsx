import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Search, Download, ChevronDown, FileSpreadsheet, FileText,
  RotateCcw, Tag, Users, Check, AlertTriangle, ExternalLink,
} from "lucide-react";
import { getInterviewerAvailability, updateUser } from "../../api/firestore";
import { compareTimeLabels } from "../../utils/dates";
import { useSkills, useTemplates, useUsers, QK } from "../../hooks/queries";
import { useAuth } from "../../AuthContext";
import { BOOTSTRAP_EMAIL } from "../../constants/roles";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import SkillsSelect from "../../components/SkillsSelect";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { SkeletonRows } from "../../components/Skeleton";
import { usePagination } from "../../hooks/usePagination";

const EXP_RANGES = [
  { label: "0–2 yrs",  test: (e) => e >= 0 && e <= 2  },
  { label: "3–5 yrs",  test: (e) => e >= 3 && e <= 5  },
  { label: "6–10 yrs", test: (e) => e >= 6 && e <= 10 },
  { label: "10+ yrs",  test: (e) => e > 10             },
];

const SEL = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white";

function initials(name, email) {
  return (name || email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(id) {
  let n = 0;
  for (const ch of (id || "")) n += ch.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export default function InterviewersPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const canDelete = currentUser?.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase();
  const { data: usersAll = [], isLoading } = useUsers();
  const [showArchived, setShowArchived] = useState(false);
  const interviewers = usersAll.filter(u =>
    (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
  );
  const archivedInterviewers = usersAll.filter(u =>
    (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "archived"
  );
  const displayInterviewers = showArchived ? archivedInterviewers : interviewers;
  const { data: skills    = [] } = useSkills();
  const { data: templates = [] } = useTemplates();
  const [viewAvail,    setViewAvail]    = useState(null);
  const [editModal,    setEditModal]    = useState(null); // { user, draftSkills, draftTemplates }
  const [saving,       setSaving]       = useState(false);
  const [search,         setSearch]         = useState("");
  const [filterSkill,    setFilterSkill]    = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterCompany,  setFilterCompany]  = useState("");
  const [filterExp,      setFilterExp]      = useState("");
  const [toast,          setToast]          = useState(null);
  const [showExport,     setShowExport]     = useState(false);
  const exportRef = useRef(null);
  const [selectedIds,         setSelectedIds]         = useState(new Set());
  const [bulkModal,           setBulkModal]           = useState(false);
  const [bulkDraftTemplates,  setBulkDraftTemplates]  = useState([]);
  const [bulkSaving,          setBulkSaving]          = useState(false);

  useEffect(() => {
    const close = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);


  const openEdit = (u) => setEditModal({
    user: u,
    draftSkills:    u.skills      || [],
    draftTemplates: u.templateIds || [],
  });

  const handleSave = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await updateUser(editModal.user.id, {
        skills:      editModal.draftSkills,
        templateIds: editModal.draftTemplates,
      });
      queryClient.invalidateQueries({ queryKey: QK.users });
      setToast({ message: "Interviewer updated." });
      setEditModal(null);
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSaving(false);
  };

  const toggleTemplate = (tid) => setEditModal(m => {
    const next = m.draftTemplates.includes(tid)
      ? m.draftTemplates.filter(id => id !== tid)
      : [...m.draftTemplates, tid];
    return { ...m, draftTemplates: next };
  });

  const viewAvailability = async (u) => {
    const slots = await getInterviewerAvailability(u.id);
    setViewAvail({ user: u, slots });
  };

  const handleDelete = async (u) => {
    const name = u.displayName || u.email;
    if (!confirm(`Archive interviewer "${name}"?\n\nThey will be hidden from the platform and lose access. All their data (past interviews, availability, profile) is preserved and can be restored anytime.`)) return;
    try {
      await updateUser(u.id, { status: "archived", archivedAt: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: QK.users });
      setToast({ message: `${name} archived.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleRestore = async (u) => {
    const name = u.displayName || u.email;
    try {
      await updateUser(u.id, { status: "active", archivedAt: null });
      queryClient.invalidateQueries({ queryKey: QK.users });
      setToast({ message: `${name} restored.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleBulkRestore = async () => {
    try {
      await Promise.all([...selectedIds].map(id => updateUser(id, { status: "active", archivedAt: null })));
      queryClient.invalidateQueries({ queryKey: QK.users });
      setToast({ message: `${selectedIds.size} interviewer${selectedIds.size !== 1 ? "s" : ""} restored.` });
      setSelectedIds(new Set());
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const allPageSelected = paged => paged.length > 0 && paged.every(u => selectedIds.has(u.id));
  const somePageSelected = paged => paged.some(u => selectedIds.has(u.id));

  const toggleSelectAll = (paged) => {
    if (allPageSelected(paged)) {
      setSelectedIds(prev => { const next = new Set(prev); paged.forEach(u => next.delete(u.id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); paged.forEach(u => next.add(u.id)); return next; });
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const openBulkModal = () => {
    const selectedIvrs = interviewers.filter(u => selectedIds.has(u.id));
    const commonTemplates = templates
      .filter(t => selectedIvrs.every(u => (u.templateIds || []).includes(t.id)))
      .map(t => t.id);
    setBulkDraftTemplates(commonTemplates);
    setBulkModal(true);
  };

  const handleBulkSave = async () => {
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id => updateUser(id, { templateIds: bulkDraftTemplates })));
      queryClient.invalidateQueries({ queryKey: QK.users });
      setToast({ message: `Templates updated for ${selectedIds.size} interviewer${selectedIds.size !== 1 ? "s" : ""}.` });
      setBulkModal(false);
      setSelectedIds(new Set());
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBulkSaving(false);
  };

  const toggleBulkTemplate = (tid) => {
    setBulkDraftTemplates(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]);
  };

  const buildExportRows = () =>
    interviewers.map(u => ({
      name:        u.displayName || "",
      email:       u.email || "",
      phone:       u.phone || "",
      role:        u.role || "",
      company:     u.company || "",
      title:       u.companyRole || "",
      experience:  u.experience != null ? u.experience : "",
      linkedin:    u.linkedin || "",
      skills:      (u.skills || []).map(sid => skills.find(s => s.id === sid)?.name || sid).join(" | "),
      templates:   (u.templateIds || []).map(tid => templates.find(t => t.id === tid)?.name || tid).join(" | "),
    }));

  const downloadCSV = () => {
    const cols = ["name", "email", "phone", "role", "company", "title", "experience", "linkedin", "skills", "templates"];
    const header = cols.join(",");
    const rows = buildExportRows().map(r =>
      cols.map(c => {
        const v = String(r[c] ?? "");
        return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "interviewers.csv" });
    a.click();
    setShowExport(false);
  };

  const downloadExcel = () => {
    const cols = ["name", "email", "phone", "role", "company", "title", "experience", "linkedin", "skills", "templates"];
    const ws = XLSX.utils.json_to_sheet(buildExportRows(), { header: cols });
    ws["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Interviewers");
    XLSX.writeFile(wb, "interviewers.xlsx");
    setShowExport(false);
  };

  const today = new Date().toISOString().slice(0, 10);

  const uniqueCompanies = [...new Set(displayInterviewers.map(u => u.company).filter(Boolean))].sort();

  const filtered = displayInterviewers.filter(u => {
    if (filterSkill    && !(u.skills      || []).includes(filterSkill))    return false;
    if (filterTemplate && !(u.templateIds || []).includes(filterTemplate)) return false;
    if (filterCompany  && u.company !== filterCompany)                     return false;
    if (filterExp) {
      const range = EXP_RANGES.find(r => r.label === filterExp);
      const exp   = parseFloat(u.experience);
      if (!range || isNaN(exp) || !range.test(exp)) return false;
    }
    const q = search.toLowerCase();
    return !q ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.company?.toLowerCase().includes(q) ||
      u.companyRole?.toLowerCase().includes(q);
  });

  const hasFilters = search || filterSkill || filterTemplate || filterCompany || filterExp;
  const clearFilters = () => { setSearch(""); setFilterSkill(""); setFilterTemplate(""); setFilterCompany(""); setFilterExp(""); };

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interviewers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage interviewer profiles, skills, and template assignments</p>
          <div className="flex items-center gap-1 mt-3 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => { setShowArchived(false); setSelectedIds(new Set()); }}
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                !showArchived ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Active · {interviewers.length}
            </button>
            <button
              onClick={() => { setShowArchived(true); setSelectedIds(new Set()); }}
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                showArchived ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Archived{archivedInterviewers.length > 0 ? ` · ${archivedInterviewers.length}` : ""}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => setShowExport(v => !v)}
              disabled={interviewers.length === 0}
            >
              Export
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </Button>
            {showExport && (
              <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-popover z-20 overflow-hidden animate-scale-in origin-top-right">
                <button onClick={downloadExcel}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Download Excel (.xlsx)
                </button>
                <button onClick={downloadCSV}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                  <FileText className="w-4 h-4 text-brand-500" />
                  Download CSV
                </button>
              </div>
            )}
          </div>

        </div>
      </motion.div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-xl"
        >
          <span className="text-sm font-semibold text-brand-700">
            {selectedIds.size} interviewer{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          {showArchived ? (
            <Button variant="primary" size="sm" icon={RotateCcw} onClick={handleBulkRestore}
              className="!bg-emerald-600 hover:!bg-emerald-700">
              Restore Selected
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={Tag} onClick={openBulkModal}>
              Update Templates
            </Button>
          )}
          <button onClick={() => setSelectedIds(new Set())}
            className="text-sm text-brand-500 hover:text-brand-700 transition-colors">
            Clear selection
          </button>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap gap-3 mb-5"
      >
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" placeholder="Search by name, email, company…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-56 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <select value={filterSkill} onChange={e => setFilterSkill(e.target.value)} className={SEL}>
          <option value="">All Skills</option>
          {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)} className={SEL}>
          <option value="">All Templates</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={SEL}>
          <option value="">All Companies</option>
          {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterExp} onChange={e => setFilterExp(e.target.value)} className={SEL}>
          <option value="">All Experience</option>
          {EXP_RANGES.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-800 px-2 transition-colors">
            Clear
          </button>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden"
      >
        {isLoading ? (
          <div className="p-4"><SkeletonRows count={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm text-gray-400">{displayInterviewers.length === 0 ? (showArchived ? "No archived interviewers." : "No interviewers yet.") : "No results match your search."}</p>
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    ref={el => { if (el) el.indeterminate = somePageSelected(paged) && !allPageSelected(paged); }}
                    checked={allPageSelected(paged)}
                    onChange={() => toggleSelectAll(paged)}
                    className="w-4 h-4 accent-brand-600 cursor-pointer"
                  />
                </th>
                {["Interviewer", "Company", "Contact", "Skills", "Templates", ""].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.map((u, idx) => (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02, duration: 0.2 }}
                  className={`hover:bg-gray-50/70 transition-colors ${selectedIds.has(u.id) ? "bg-brand-50/40" : ""}`}
                >

                  {/* Checkbox */}
                  <td className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      className="w-4 h-4 accent-brand-600 cursor-pointer"
                    />
                  </td>

                  {/* Name + role */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${avatarColor(u.id)}`}>
                        {initials(u.displayName, u.email)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 leading-tight">{u.displayName || "—"}</p>
                        {u.role === "interviewer_content" ? (
                          <span className="inline-flex items-center text-[10px] font-semibold text-teal-700 bg-teal-50 ring-1 ring-inset ring-teal-200 px-1.5 py-0.5 rounded-full">
                            Interviewer + Content
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold text-teal-700 bg-teal-50 ring-1 ring-inset ring-teal-200 px-1.5 py-0.5 rounded-full">
                            Interviewer
                          </span>
                        )}
                        {showArchived && u.archivedAt && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Archived {new Date(u.archivedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Company */}
                  <td className="px-4 py-3">
                    {u.company || u.companyRole ? (
                      <>
                        <p className="text-gray-800 text-xs font-medium">{u.companyRole || "—"}</p>
                        <p className="text-gray-400 text-xs">{u.company}</p>
                      </>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                    {u.experience && (
                      <p className="text-gray-400 text-xs mt-0.5">{u.experience} yr{u.experience != 1 ? "s" : ""} exp</p>
                    )}
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600 font-mono">{u.email}</p>
                    {u.phone && <p className="text-xs text-gray-400 mt-0.5">{u.phone}</p>}
                    {u.linkedin && (
                      <a href={u.linkedin.startsWith("http") ? u.linkedin : `https://${u.linkedin}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline mt-0.5 inline-flex items-center gap-1">
                        LinkedIn <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>

                  {/* Skills */}
                  <td className="px-4 py-3">
                    {(u.skills || []).length === 0 ? (
                      <span className="text-xs text-gray-300">Not set</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(u.skills || []).map(sid => {
                          const sk = skills.find(s => s.id === sid);
                          return sk ? (
                            <span key={sid} className="text-[10px] font-semibold bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 px-1.5 py-0.5 rounded-full">
                              {sk.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>

                  {/* Templates */}
                  <td className="px-4 py-3">
                    {(u.templateIds || []).length === 0 ? (
                      <span className="text-xs text-gray-300">Not assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(u.templateIds || []).map(tid => {
                          const tmpl = templates.find(t => t.id === tid);
                          return tmpl ? (
                            <span key={tid} className="text-[10px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 px-1.5 py-0.5 rounded-full">
                              {tmpl.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      ...(!showArchived ? [
                        { label: "View Availability", onClick: () => viewAvailability(u) },
                        { label: "Edit",              onClick: () => openEdit(u) },
                        ...(canDelete ? [{ label: "Archive", onClick: () => handleDelete(u), danger: true }] : []),
                      ] : [
                        ...(canDelete ? [{ label: "Restore", onClick: () => handleRestore(u) }] : []),
                      ]),
                    ]} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </motion.div>

      {/* Combined Edit modal — Skills + Templates */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)}
        title={`Edit — ${editModal?.user?.displayName || editModal?.user?.email || ""}`} wide>
        {editModal && (
          <div className="space-y-6">

            {/* Skills section */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Skills</p>
              <SkillsSelect
                skills={skills}
                value={editModal.draftSkills}
                onChange={v => setEditModal(m => ({ ...m, draftSkills: v }))}
                placeholder="Select skills…"
              />
            </div>

            {/* Templates section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Interview Templates</p>
                <span className="text-xs text-gray-400">{editModal.draftTemplates.length} selected</span>
              </div>
              {templates.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No templates found.</p>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  {templates.map(t => (
                    <label key={t.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                        editModal.draftTemplates.includes(t.id) ? "bg-violet-50" : "hover:bg-gray-50"
                      }`}>
                      <input
                        type="checkbox"
                        checked={editModal.draftTemplates.includes(t.id)}
                        onChange={() => toggleTemplate(t.id)}
                        className="accent-violet-600 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                        {t.program && <p className="text-xs text-gray-400">{t.program}</p>}
                      </div>
                      {editModal.draftTemplates.includes(t.id) && (
                        <Check className="w-4 h-4 text-violet-600 flex-shrink-0" strokeWidth={2.5} />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="primary" size="lg" onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setEditModal(null)} className="px-5">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk template modal */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)}
        title={`Update Templates — ${selectedIds.size} interviewer${selectedIds.size !== 1 ? "s" : ""}`} wide>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Select the templates to assign. This will <span className="font-semibold text-gray-700">replace</span> existing template assignments for all selected interviewers.
          </p>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Interview Templates</p>
              <span className="text-xs text-gray-400">{bulkDraftTemplates.length} selected</span>
            </div>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No templates found.</p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {templates.map(t => (
                  <label key={t.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                      bulkDraftTemplates.includes(t.id) ? "bg-violet-50" : "hover:bg-gray-50"
                    }`}>
                    <input
                      type="checkbox"
                      checked={bulkDraftTemplates.includes(t.id)}
                      onChange={() => toggleBulkTemplate(t.id)}
                      className="accent-violet-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                      {t.program && <p className="text-xs text-gray-400">{t.program}</p>}
                    </div>
                    {bulkDraftTemplates.includes(t.id) && (
                      <Check className="w-4 h-4 text-violet-600 flex-shrink-0" strokeWidth={2.5} />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="lg" onClick={handleBulkSave} disabled={bulkSaving} className="flex-1">
              {bulkSaving ? "Saving…" : `Update ${selectedIds.size} Interviewer${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setBulkModal(false)} className="px-5">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Availability modal */}
      <Modal open={!!viewAvail} onClose={() => setViewAvail(null)}
        title={viewAvail ? `${viewAvail.user.displayName || viewAvail.user.email} — Availability` : ""} wide>
        {viewAvail && (() => {
          const upcoming = viewAvail.slots
            .filter(s => s.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date) || compareTimeLabels(a.time, b.time));
          const flaggedSlots = upcoming.filter(s => s.flagged);
          const byDate = {};
          upcoming.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
          return (
            <div className="space-y-4">
              {/* Flagged conflict banner */}
              {flaggedSlots.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      {flaggedSlots.length} conflict{flaggedSlots.length !== 1 ? "s" : ""} flagged by interviewer
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      {flaggedSlots.map(s => `${s.date} at ${s.time}`).join(" · ")}
                    </p>
                    <p className="text-xs text-red-400 mt-1">Please reassign or cancel the affected interview(s).</p>
                  </div>
                </div>
              )}

              {Object.keys(byDate).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No upcoming availability set.</p>
              ) : (
                Object.entries(byDate).map(([date, daySlots]) => {
                  const [y, m, d] = date.split("-");
                  return (
                    <div key={date}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{`${d}/${m}/${y}`}</p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map(s => (
                          <span key={s.id}
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${
                              s.flagged
                                ? "bg-red-100 text-red-700 border-red-300"
                                : s.isBooked
                                  ? "bg-orange-100 text-orange-700 border-orange-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                            {s.flagged && "⚑ "}{s.time} · {s.flagged ? "Conflict" : s.isBooked ? "Booked" : "Free"}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
