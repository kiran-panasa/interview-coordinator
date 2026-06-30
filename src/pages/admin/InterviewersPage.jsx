import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { getInterviewerAvailability, subscribeToUsers, subscribeToSkills, updateUser, deleteUser, getTemplates } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import SkillsSelect from "../../components/SkillsSelect";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

function initials(name, email) {
  return (name || email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
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
  const [interviewers, setInterviewers] = useState([]);
  const [skills,       setSkills]       = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [viewAvail,    setViewAvail]    = useState(null);
  const [editModal,    setEditModal]    = useState(null); // { user, draftSkills, draftTemplates }
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [toast,        setToast]        = useState(null);
  const [showExport,   setShowExport]   = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    const unsub1 = subscribeToUsers(users => {
      setInterviewers(
        users.filter(u =>
          (u.role === "interviewer" || u.role === "interviewer_content") &&
          u.status === "active"
        )
      );
      setLoading(false);
    });
    const unsub2 = subscribeToSkills(setSkills);
    getTemplates().then(setTemplates);
    return () => { unsub1(); unsub2(); };
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
    if (!confirm(`Remove interviewer "${name}" from the platform?\n\nThis deletes their account record. Their past interviews will remain.`)) return;
    try {
      await deleteUser(u.id);
      setToast({ message: `${name} removed.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
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

  const filtered = interviewers.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.company?.toLowerCase().includes(q) ||
      u.companyRole?.toLowerCase().includes(q);
  });

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviewers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{interviewers.length} active interviewer{interviewers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExport(v => !v)}
              disabled={interviewers.length === 0}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExport && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <button onClick={downloadExcel}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Excel (.xlsx)
                </button>
                <button onClick={downloadCSV}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </button>
              </div>
            )}
          </div>

          <input
            type="text"
            placeholder="Search by name, email, company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-sm text-gray-400">{interviewers.length === 0 ? "No interviewers yet." : "No results match your search."}</p>
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Interviewer", "Company", "Contact", "Skills", "Templates", ""].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">

                  {/* Name + role */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${avatarColor(u.id)}`}>
                        {initials(u.displayName, u.email)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 leading-tight">{u.displayName || "—"}</p>
                        {u.role === "interviewer_content" ? (
                          <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
                            Interviewer + Content
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            Interviewer
                          </span>
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
                        className="text-xs text-indigo-500 hover:underline mt-0.5 block">
                        LinkedIn ↗
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
                            <span key={sid} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">
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
                            <span key={tid} className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
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
                      { label: "View Availability", onClick: () => viewAvailability(u) },
                      { label: "Edit",              onClick: () => openEdit(u) },
                      { label: "Remove",            onClick: () => handleDelete(u), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </div>

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
                        <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditModal(null)}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Availability modal */}
      <Modal open={!!viewAvail} onClose={() => setViewAvail(null)}
        title={viewAvail ? `${viewAvail.user.displayName || viewAvail.user.email} — Availability` : ""} wide>
        {viewAvail && (() => {
          const upcoming = viewAvail.slots
            .filter(s => s.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
          const flaggedSlots = upcoming.filter(s => s.flagged);
          const byDate = {};
          upcoming.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
          return (
            <div className="space-y-4">
              {/* Flagged conflict banner */}
              {flaggedSlots.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
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
