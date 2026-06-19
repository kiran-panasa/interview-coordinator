import { useState, useEffect } from "react";
import {
  subscribeToQuestions, createQuestion, updateQuestion, archiveQuestion,
  subscribeToSkills, getTemplates,
} from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const DIFFICULTIES = ["easy", "medium", "hard"];

const DIFF_BADGE = {
  easy:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  hard:   "bg-red-50 text-red-700 border-red-200",
};

const BLANK_FORM = { text: "", domainType: "", skills: [], topic: "", difficulty: "medium" };

export default function QuestionsPage() {
  const [questions,  setQuestions]  = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(BLANK_FORM);
  const [saving,     setSaving]     = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Filters
  const [search,          setSearch]          = useState("");
  const [filterDomain,    setFilterDomain]    = useState("");
  const [filterDifficulty,setFilterDifficulty]= useState("");
  const [filterSkill,     setFilterSkill]     = useState("");

  useEffect(() => {
    const unsub = subscribeToQuestions(setQuestions);
    const unsub2 = subscribeToSkills(setSkills);
    setLoading(false);
    getTemplates().then(setTemplates);
    return () => { unsub(); unsub2(); };
  }, []);

  // Collect all domain types used across questions + templates
  const allDomainTypes = [...new Set([
    ...questions.map(q => q.domainType).filter(Boolean),
    ...templates.flatMap(t => (t.domains || []).map(d => d.type)).filter(Boolean),
  ])].sort();

  const openCreate = () => { setForm(BLANK_FORM); setEditTarget(null); setShowModal(true); };
  const openEdit   = (q) => {
    setForm({ text: q.text, domainType: q.domainType || "", skills: q.skills || [], topic: q.topic || "", difficulty: q.difficulty || "medium" });
    setEditTarget(q);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.text.trim())       return setToast({ message: "Question text is required.", type: "error" });
    if (!form.domainType.trim()) return setToast({ message: "Domain type is required.", type: "error" });
    setSaving(true);
    try {
      if (editTarget) {
        await updateQuestion(editTarget.id, form);
        setToast({ message: "Question updated." });
      } else {
        await createQuestion(form);
        setToast({ message: "Question added to the bank." });
      }
      setShowModal(false);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleArchive = async (q) => {
    if (!confirm(`Archive "${q.text.slice(0, 60)}…"?\n\nIt won't appear in templates but history is preserved.`)) return;
    try {
      await archiveQuestion(q.id);
      setToast({ message: "Question archived." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  const handleUnarchive = async (q) => {
    try {
      await updateQuestion(q.id, { status: "active" });
      setToast({ message: "Question restored." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  const toggleSkill = (sid) => setForm(f => ({
    ...f,
    skills: f.skills.includes(sid) ? f.skills.filter(s => s !== sid) : [...f.skills, sid],
  }));

  const filtered = questions.filter(q => {
    if (!showArchived && q.status === "archived") return false;
    if (showArchived  && q.status !== "archived") return false;
    if (filterDomain    && q.domainType !== filterDomain)   return false;
    if (filterDifficulty && q.difficulty !== filterDifficulty) return false;
    if (filterSkill     && !(q.skills || []).includes(filterSkill)) return false;
    if (search) {
      const sq = search.toLowerCase();
      return (
        q.text?.toLowerCase().includes(sq) ||
        q.topic?.toLowerCase().includes(sq) ||
        q.domainType?.toLowerCase().includes(sq)
      );
    }
    return true;
  });

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 20);

  const activeCount   = questions.filter(q => q.status !== "archived").length;
  const archivedCount = questions.filter(q => q.status === "archived").length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active question{activeCount !== 1 ? "s" : ""}
            {archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Question
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search questions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Domains</option>
          {allDomainTypes.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={filterSkill} onChange={e => setFilterSkill(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Skills</option>
          {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => setShowArchived(a => !a)}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showArchived ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
          {showArchived ? "Viewing Archived" : "Show Archived"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-400">
              {questions.length === 0 ? "No questions yet. Click 'Add Question' to get started." : "No questions match your filters."}
            </p>
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Question", "Domain", "Topic", "Skills", "Difficulty", "Used", ""].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.map(q => (
                <tr key={q.id} className={`hover:bg-gray-50 ${q.status === "archived" ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-gray-900 text-sm leading-snug line-clamp-2">{q.text}</p>
                    <p className="text-[10px] font-mono text-gray-300 mt-0.5">#{q.id.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                      {q.domainType || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{q.topic || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(q.skills || []).length === 0
                        ? <span className="text-xs text-gray-300">—</span>
                        : (q.skills || []).map(sid => {
                            const sk = skills.find(s => s.id === sid);
                            return sk ? (
                              <span key={sid} className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                {sk.name}
                              </span>
                            ) : null;
                          })
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {q.difficulty ? (
                      <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${DIFF_BADGE[q.difficulty] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {q.difficulty}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-gray-700">{q.usageCount || 0}</span>
                    <span className="text-xs text-gray-400 ml-0.5">×</span>
                  </td>
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      { label: "Edit",    onClick: () => openEdit(q) },
                      q.status === "archived"
                        ? { label: "Restore", onClick: () => handleUnarchive(q) }
                        : { label: "Archive", onClick: () => handleArchive(q), danger: true },
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

      {/* Create / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Edit Question" : "Add Question"} wide>
        <div className="space-y-4">
          {/* Question text */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Question <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder="e.g. Explain the difference between useMemo and useCallback in React."
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Domain type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Domain Type <span className="text-red-400">*</span>
              </label>
              <input
                list="domain-types"
                value={form.domainType}
                onChange={e => setForm(f => ({ ...f, domainType: e.target.value }))}
                placeholder="e.g. react_coding"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="domain-types">
                {allDomainTypes.map(d => <option key={d} value={d} />)}
              </datalist>
              <p className="text-[10px] text-gray-400 mt-1">Type or pick from existing domain types</p>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Difficulty</label>
              <div className="flex gap-2">
                {DIFFICULTIES.map(d => (
                  <button key={d} type="button" onClick={() => setForm(f => ({ ...f, difficulty: d }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${form.difficulty === d ? DIFF_BADGE[d] + " border-current" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Topic</label>
            <input
              value={form.topic}
              onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. React Hooks, Async JS, System Design…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Skills</label>
            {skills.length === 0 ? (
              <p className="text-xs text-gray-400">No skills defined yet — add them in Admin Panel.</p>
            ) : (
              <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                {skills.map(s => (
                  <button key={s.id} type="button" onClick={() => toggleSkill(s.id)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                      form.skills.includes(s.id)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving…" : editTarget ? "Update Question" : "Add to Bank"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
