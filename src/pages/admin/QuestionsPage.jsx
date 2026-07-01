import { useState, useEffect, useRef } from "react";
import { formatDateShort } from "../../utils/dates";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  subscribeToQuestions, createQuestion, updateQuestion, archiveQuestion,
  approveAdhocQuestion, rejectAdhocQuestion,
  addQuestionToTemplate, removeQuestionFromTemplate,
} from "../../api/firestore";
import { useSkills, useTemplates, QK } from "../../hooks/queries";
import { parseCSV as parseQuestionCSV, downloadSampleCSV } from "../../utils/questionCSV";
import QuestionForm from "../../components/questions/QuestionForm";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

// ── Page ──────────────────────────────────────────────────────────────────────

const DIFFICULTIES = ["easy", "medium", "hard"];
const DIFF_BADGE = {
  easy:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  hard:   "bg-red-50 text-red-700 border-red-200",
};

const BLANK_FORM = { text: "", domainTypes: [], skills: [], topic: "", difficulty: "medium", templateIds: [], suggestedAnswer: "" };

const BLANK_BULK = {
  difficulty: "",
  topic: "", topicEnabled: false,
  skills: [], skillsMode: "add",
  domains: [], domainsMode: "add",
  templateIds: [], templatesMode: "add",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  const queryClient = useQueryClient();
  const { adhocQs = [] } = useOutletContext() || {};
  const [activeTab,    setActiveTab]    = useState("bank");
  const [questions,    setQuestions]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const { data: skills    = [] } = useSkills();
  const { data: templates = [] } = useTemplates();
  const [toast,        setToast]        = useState(null);
  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState(BLANK_FORM);
  const [saving,       setSaving]       = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Approve modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveForm,   setApproveForm]   = useState(BLANK_FORM);

  // Bulk upload
  const [showBulkModal,  setShowBulkModal]  = useState(false);
  const [bulkText,       setBulkText]       = useState("");
  const [bulkPreview,    setBulkPreview]    = useState(null);
  const [bulkImporting,  setBulkImporting]  = useState(false);
  const fileInputRef = useRef(null);

  // Filters
  const [search,           setSearch]           = useState("");
  const [filterDomain,     setFilterDomain]     = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterSkill,      setFilterSkill]      = useState("");
  const [filterTopic,      setFilterTopic]      = useState("");
  const [filterTemplate,   setFilterTemplate]   = useState("");

  // Bulk edit
  const [selected,      setSelected]      = useState(new Set());
  const [showBulkEdit,  setShowBulkEdit]  = useState(false);
  const [bulkForm,      setBulkForm]      = useState(BLANK_BULK);
  const [bulkSaving,    setBulkSaving]    = useState(false);
  const [bulkProgress,  setBulkProgress]  = useState(null);

  useEffect(() => {
    const unsub = subscribeToQuestions(qs => { setQuestions(qs); setLoading(false); });
    return unsub;
  }, []);

  // Build { value, label } pairs from template domains (source of truth),
  // plus any domainTypes already on existing questions that aren't in any template.
  const allDomainTypes = (() => {
    const map = new Map(); // value → label
    templates.forEach(t =>
      (t.domains || []).forEach(d => {
        const val = d.id || d.type;
        if (val && !map.has(val)) map.set(val, d.label || val);
      })
    );
    questions.forEach(q => {
      const types = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
      types.forEach(val => { if (val && !map.has(val)) map.set(val, val); });
    });
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  const allTopics = [...new Set(questions.filter(q => q.topic).map(q => q.topic))].sort();

  // compute which template IDs contain a given question ID
  const templateIdsForQuestion = (qid) =>
    templates.filter(t => (t.questionIds || []).includes(qid)).map(t => t.id);

  // ── Question Bank actions ────────────────────────────────────────────────────

  const openCreate = () => { setForm(BLANK_FORM); setEditTarget(null); setShowModal(true); };
  const openEdit   = (q) => {
    setForm({
      text: q.text,
      domainTypes: Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []),
      skills: q.skills || [],
      topic: q.topic || "", difficulty: q.difficulty || "medium",
      templateIds: templateIdsForQuestion(q.id),
      suggestedAnswer: q.suggestedAnswer || "",
    });
    setEditTarget(q);
    setShowModal(true);
  };

  const syncTemplates = async (questionId, newTemplateIds, prevTemplateIds) => {
    const toAdd    = newTemplateIds.filter(id => !prevTemplateIds.includes(id));
    const toRemove = prevTemplateIds.filter(id => !newTemplateIds.includes(id));
    await Promise.all([
      ...toAdd.map(tid    => addQuestionToTemplate(tid, questionId)),
      ...toRemove.map(tid => removeQuestionFromTemplate(tid, questionId)),
    ]);
    if (toAdd.length > 0 || toRemove.length > 0) {
      queryClient.invalidateQueries({ queryKey: QK.templates });
    }
  };

  const handleSave = async () => {
    if (!form.text.trim())          return setToast({ message: "Question text is required.", type: "error" });
    if (!form.domainTypes?.length)  return setToast({ message: "Select at least one domain type.", type: "error" });
    setSaving(true);
    try {
      const { templateIds, ...questionData } = form;
      if (editTarget) {
        await updateQuestion(editTarget.id, questionData);
        await syncTemplates(editTarget.id, templateIds, templateIdsForQuestion(editTarget.id));
        setToast({ message: "Question updated." });
      } else {
        const qid = await createQuestion(questionData);
        await syncTemplates(qid, templateIds, []);
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

  // ── Bulk select / edit ──────────────────────────────────────────────────────

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(q => q.id)));
  };

  const toggleBulkDomain = (val) => setBulkForm(f => ({
    ...f,
    domains: f.domains.includes(val) ? f.domains.filter(d => d !== val) : [...f.domains, val],
  }));
  const toggleBulkSkill = (sid) => setBulkForm(f => ({
    ...f,
    skills: f.skills.includes(sid) ? f.skills.filter(s => s !== sid) : [...f.skills, sid],
  }));
  const toggleBulkTemplate = (tid) => setBulkForm(f => ({
    ...f,
    templateIds: f.templateIds.includes(tid) ? f.templateIds.filter(t => t !== tid) : [...f.templateIds, tid],
  }));

  const handleBulkEdit = async () => {
    const ids = [...selected];
    const total = ids.length;
    setBulkSaving(true);
    setBulkProgress({ done: 0, total });
    try {
      for (let i = 0; i < ids.length; i++) {
        const qid = ids[i];
        const q = questions.find(x => x.id === qid);
        const updates = {};

        if (bulkForm.difficulty) updates.difficulty = bulkForm.difficulty;

        if (bulkForm.topicEnabled) updates.topic = bulkForm.topic;

        if (bulkForm.skills.length > 0) {
          if (bulkForm.skillsMode === "replace") {
            updates.skills = bulkForm.skills;
          } else {
            updates.skills = [...new Set([...(q?.skills || []), ...bulkForm.skills])];
          }
        }

        if (bulkForm.domains.length > 0) {
          const existing = Array.isArray(q?.domainTypes) ? q.domainTypes : (q?.domainType ? [q.domainType] : []);
          if (bulkForm.domainsMode === "replace") {
            updates.domainTypes = bulkForm.domains;
          } else {
            updates.domainTypes = [...new Set([...existing, ...bulkForm.domains])];
          }
        }

        if (Object.keys(updates).length > 0) await updateQuestion(qid, updates);

        if (bulkForm.templateIds.length > 0) {
          const prevTids = templateIdsForQuestion(qid);
          if (bulkForm.templatesMode === "add") {
            const toAdd = bulkForm.templateIds.filter(tid => !prevTids.includes(tid));
            if (toAdd.length) await Promise.all(toAdd.map(tid => addQuestionToTemplate(tid, qid)));
          } else {
            const toRemove = bulkForm.templateIds.filter(tid => prevTids.includes(tid));
            if (toRemove.length) await Promise.all(toRemove.map(tid => removeQuestionFromTemplate(tid, qid)));
          }
        }

        setBulkProgress({ done: i + 1, total });
      }

      if (bulkForm.templateIds.length > 0) queryClient.invalidateQueries({ queryKey: QK.templates });
      setShowBulkEdit(false);
      setSelected(new Set());
      setBulkForm(BLANK_BULK);
      setBulkProgress(null);
      setToast({ message: `${total} question${total !== 1 ? "s" : ""} updated.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
      setBulkProgress(null);
    }
    setBulkSaving(false);
  };

  const bulkHasChanges = bulkForm.difficulty || bulkForm.topicEnabled ||
    bulkForm.skills.length > 0 || bulkForm.domains.length > 0 || bulkForm.templateIds.length > 0;

  // ── Bulk upload ──────────────────────────────────────────────────────────────

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBulkText(ev.target.result);
      setBulkPreview(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleBulkParse = () => {
    const result = parseQuestionCSV(bulkText);
    setBulkPreview(result);
  };

  const handleBulkImport = async () => {
    if (!bulkPreview?.rows?.length) return;
    setBulkImporting(true);
    try {
      let imported = 0;
      for (const row of bulkPreview.rows) {
        const skillIds = row.skills.map(name => {
          const s = skills.find(s => s.name.toLowerCase() === name.toLowerCase());
          return s?.id;
        }).filter(Boolean);
        const templateMatchIds = row.templates.map(name => {
          const t = templates.find(t => t.name.toLowerCase() === name.toLowerCase());
          return t?.id;
        }).filter(Boolean);
        const qid = await createQuestion({
          text: row.text, domainTypes: row.domainTypes,
          difficulty: row.difficulty, topic: row.topic, skills: skillIds,
          suggestedAnswer: row.suggestedAnswer || "",
        });
        if (templateMatchIds.length > 0) {
          await Promise.all(templateMatchIds.map(tid => addQuestionToTemplate(tid, qid)));
        }
        imported++;
      }
      if (bulkPreview.rows.some(r => r.templates.length > 0)) queryClient.invalidateQueries({ queryKey: QK.templates });
      setShowBulkModal(false);
      setBulkPreview(null);
      setBulkText("");
      setToast({ message: `${imported} question${imported !== 1 ? "s" : ""} imported.` });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setBulkImporting(false);
  };

  // ── Adhoc review actions ─────────────────────────────────────────────────────

  const toggleDomain = (val) => setForm(f => ({
    ...f,
    domainTypes: f.domainTypes.includes(val) ? f.domainTypes.filter(d => d !== val) : [...f.domainTypes, val],
  }));
  const toggleApproveDomain = (val) => setApproveForm(f => ({
    ...f,
    domainTypes: f.domainTypes.includes(val) ? f.domainTypes.filter(d => d !== val) : [...f.domainTypes, val],
  }));
  const toggleSkill = (sid) => setForm(f => ({
    ...f,
    skills: f.skills.includes(sid) ? f.skills.filter(s => s !== sid) : [...f.skills, sid],
  }));
  const toggleApproveSkill = (sid) => setApproveForm(f => ({
    ...f,
    skills: f.skills.includes(sid) ? f.skills.filter(s => s !== sid) : [...f.skills, sid],
  }));
  const toggleTemplate = (tid) => setForm(f => ({
    ...f,
    templateIds: f.templateIds.includes(tid) ? f.templateIds.filter(t => t !== tid) : [...f.templateIds, tid],
  }));
  const toggleApproveTemplate = (tid) => setApproveForm(f => ({
    ...f,
    templateIds: f.templateIds.includes(tid) ? f.templateIds.filter(t => t !== tid) : [...f.templateIds, tid],
  }));

  const openApprove = (q) => {
    setApproveTarget(q);
    setApproveForm({ text: q.text, domainTypes: [], skills: [], topic: "", difficulty: "medium", templateIds: [], suggestedAnswer: "" });
  };

  const handleApprove = async () => {
    if (!approveForm.text.trim())          return setToast({ message: "Question text is required.", type: "error" });
    if (!approveForm.domainTypes?.length)  return setToast({ message: "Select at least one domain type.", type: "error" });
    setSaving(true);
    try {
      const { templateIds, ...questionData } = approveForm;
      const qid = await approveAdhocQuestion(approveTarget.id, questionData);
      await syncTemplates(qid, templateIds, []);
      setApproveTarget(null);
      setToast({ message: "Question approved and added to the bank." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleReject = async (q) => {
    if (!confirm("Reject this question? It won't be added to the bank.")) return;
    try {
      await rejectAdhocQuestion(q.id, "content_team");
      setToast({ message: "Question rejected." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = questions.filter(q => {
    if (!showArchived && q.status === "archived") return false;
    if (showArchived  && q.status !== "archived") return false;
    const qDomains = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
    if (filterDomain     && !qDomains.includes(filterDomain))        return false;
    if (filterDifficulty && q.difficulty !== filterDifficulty)       return false;
    if (filterSkill      && !(q.skills || []).includes(filterSkill)) return false;
    if (filterTopic      && q.topic !== filterTopic)                return false;
    if (filterTemplate   && !(templates.find(t => t.id === filterTemplate)?.questionIds || []).includes(q.id)) return false;
    if (search) {
      const sq = search.toLowerCase();
      return (
        q.text?.toLowerCase().includes(sq) ||
        q.topic?.toLowerCase().includes(sq) ||
        qDomains.some(d => d?.toLowerCase().includes(sq))
      );
    }
    return true;
  });

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 20);
  const activeCount   = questions.filter(q => q.status !== "archived").length;
  const archivedCount = questions.filter(q => q.status === "archived").length;
  const pendingAdhoc  = adhocQs.filter(q => q.status === "pending");

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
        {activeTab === "bank" && (
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit selected ({selected.size})
              </button>
            )}
            <button onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Question
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {[
          { key: "bank",   label: "Question Bank" },
          { key: "review", label: "Review Queue", count: pendingAdhoc.length },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Question Bank tab ── */}
      {activeTab === "bank" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <input type="text" placeholder="Search questions…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Domains</option>
              {allDomainTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
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
            <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Topics</option>
              {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Templates</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    {["Question", "Domain", "Topic", "Skills", "Difficulty", "Templates", "Used", ""].map((h, i) => (
                      <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map(q => {
                    const qTemplates = templates.filter(t => (t.questionIds || []).includes(q.id));
                    return (
                      <tr key={q.id} className={`hover:bg-gray-50 ${selected.has(q.id) ? "bg-indigo-50/60" : ""} ${q.status === "archived" ? "opacity-50" : ""}`}>
                        <td className="pl-4 pr-2 py-3 w-8">
                          <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="text-gray-900 text-sm leading-snug line-clamp-2">{q.text}</p>
                          <p className="text-[10px] font-mono text-gray-300 mt-0.5">#{q.id.slice(0, 8)}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          {(() => {
                            const qd = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
                            if (!qd.length) return <span className="text-xs text-gray-300">—</span>;
                            return (
                              <div className="flex flex-wrap gap-1">
                                {qd.slice(0, 2).map(val => {
                                  const label = allDomainTypes.find(d => d.value === val)?.label || val;
                                  return (
                                    <span key={val} title={label}
                                      className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full truncate max-w-[130px] inline-block">
                                      {label}
                                    </span>
                                  );
                                })}
                                {qd.length > 2 && <span className="text-[10px] text-gray-400">+{qd.length - 2}</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[100px]">{q.topic || "—"}</td>
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
                        <td className="px-4 py-3 max-w-[140px]">
                          {qTemplates.length === 0
                            ? <span className="text-xs text-gray-300">—</span>
                            : (
                              <div className="flex flex-wrap gap-1">
                                {qTemplates.slice(0, 2).map(t => (
                                  <span key={t.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    {t.name}
                                  </span>
                                ))}
                                {qTemplates.length > 2 && (
                                  <span className="text-[10px] text-gray-400">+{qTemplates.length - 2}</span>
                                )}
                              </div>
                            )
                          }
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
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
              </>
            )}
          </div>
        </>
      )}

      {/* ── Review Queue tab ── */}
      {activeTab === "review" && (
        <div className="space-y-4">
          {adhocQs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white rounded-xl border border-gray-200">
              <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm text-gray-400">No questions in the review queue.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-4 text-xs text-gray-500">
                <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>{pendingAdhoc.length} pending</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"></span>{adhocQs.filter(q => q.status === "approved").length} approved</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>{adhocQs.filter(q => q.status === "rejected").length} rejected</span>
              </div>
              {adhocQs.map(q => {
                const statusStyle = { pending: "border-amber-200 bg-amber-50/40", approved: "border-emerald-200 bg-emerald-50/30", rejected: "border-gray-200 bg-gray-50 opacity-60" }[q.status] || "border-gray-200 bg-white";
                const statusBadge = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-gray-100 text-gray-500" }[q.status] || "bg-gray-100 text-gray-500";
                return (
                  <div key={q.id} className={`rounded-xl border p-4 ${statusStyle}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-snug">{q.text}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                          {q.interviewId && <span>Interview: <span className="font-mono text-gray-500">#{q.interviewId.slice(0, 8)}</span></span>}
                          {q.templateId  && <span>Template: <span className="font-mono text-gray-500">#{q.templateId.slice(0, 8)}</span></span>}
                          {q.createdAt   && <span>{formatDateShort(q.createdAt)}</span>}
                          {q.status === "approved" && q.promotedQuestionId && (
                            <span className="text-emerald-600">Promoted → #{q.promotedQuestionId.slice(0, 8)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusBadge}`}>{q.status}</span>
                        {q.status === "pending" && (
                          <>
                            <button onClick={() => openApprove(q)}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                              Approve
                            </button>
                            <button onClick={() => handleReject(q)}
                              className="px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Edit Question" : "Add Question"} wide>
        <QuestionForm
          form={form} setForm={setForm}
          skills={skills} allDomainTypes={allDomainTypes} templates={templates}
          toggleDomain={toggleDomain} toggleSkill={toggleSkill} toggleTemplate={toggleTemplate}
          onSave={handleSave} onCancel={() => setShowModal(false)}
          saving={saving} submitLabel={editTarget ? "Update Question" : "Add to Bank"}
        />
      </Modal>

      {/* Approve modal */}
      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title="Approve & Add to Bank" wide>
        {approveTarget && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Submitted question</p>
              <p className="text-sm text-gray-800">{approveTarget.text}</p>
            </div>
            <QuestionForm
              form={approveForm} setForm={setApproveForm}
              skills={skills} allDomainTypes={allDomainTypes} templates={templates}
              toggleDomain={toggleApproveDomain} toggleSkill={toggleApproveSkill} toggleTemplate={toggleApproveTemplate}
              onSave={handleApprove} onCancel={() => setApproveTarget(null)}
              saving={saving} submitLabel="Approve & Add to Bank"
            />
          </div>
        )}
      </Modal>

      {/* Bulk Upload modal */}
      <Modal open={showBulkModal} onClose={() => { setShowBulkModal(false); setBulkPreview(null); setBulkText(""); }}
        title="Bulk Upload Questions" wide>
        <div className="space-y-4">
          {/* Download template */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">CSV Format</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Columns: <span className="font-mono">text, domainType, difficulty, topic, skills, templates</span>
                <br />Use <span className="font-mono">|</span> to separate multiple domains, skills, or templates per row.
              </p>
            </div>
            <button onClick={downloadSampleCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Template
            </button>
          </div>

          {/* File upload */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload or Paste CSV</p>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Choose File
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </div>
            <textarea
              rows={6}
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkPreview(null); }}
              placeholder={`text,domainType,difficulty,topic,skills,templates\n"What is a closure?",coding,medium,Closures,JavaScript,\n"Explain reconciliation",react_coding,hard,React Internals,ReactJS|JavaScript,Template A`}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Parse button */}
          {!bulkPreview && (
            <button onClick={handleBulkParse} disabled={!bulkText.trim()}
              className="w-full py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-40">
              Parse & Preview
            </button>
          )}

          {/* Preview */}
          {bulkPreview && (
            <div className="space-y-3">
              {bulkPreview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">{bulkPreview.errors.length} issue{bulkPreview.errors.length !== 1 ? "s" : ""} found</p>
                  <ul className="space-y-0.5">
                    {bulkPreview.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {bulkPreview.rows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    {bulkPreview.rows.length} question{bulkPreview.rows.length !== 1 ? "s" : ""} ready to import
                  </p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {["Text", "Domain", "Difficulty", "Templates"].map(h => (
                            <th key={h} className="text-left font-semibold text-gray-500 px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bulkPreview.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 max-w-[200px]">
                              <p className="line-clamp-1 text-gray-800">{r.text}</p>
                            </td>
                            <td className="px-3 py-2 font-mono text-indigo-600">{r.domainTypes.join(", ") || "—"}</td>
                            <td className="px-3 py-2 capitalize text-gray-600">{r.difficulty}</td>
                            <td className="px-3 py-2 text-gray-500">{r.templates.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {bulkPreview.rows.length > 0 && (
                  <button onClick={handleBulkImport} disabled={bulkImporting}
                    className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60">
                    {bulkImporting ? "Importing…" : `Import ${bulkPreview.rows.length} Question${bulkPreview.rows.length !== 1 ? "s" : ""}`}
                  </button>
                )}
                <button onClick={() => setBulkPreview(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200">
                  Edit CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Bulk Edit modal */}
      <Modal open={showBulkEdit} onClose={() => { setShowBulkEdit(false); setBulkForm(BLANK_BULK); }} title={`Bulk Edit — ${selected.size} Question${selected.size !== 1 ? "s" : ""}`} wide>
        <div className="space-y-5">
          {/* Difficulty */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Difficulty</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setBulkForm(f => ({ ...f, difficulty: "" }))}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!bulkForm.difficulty ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                No change
              </button>
              {DIFFICULTIES.map(d => (
                <button key={d} type="button" onClick={() => setBulkForm(f => ({ ...f, difficulty: d }))}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize ${
                    bulkForm.difficulty === d
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Topic</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={bulkForm.topicEnabled} onChange={e => setBulkForm(f => ({ ...f, topicEnabled: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Overwrite topic on all selected
              </label>
            </div>
            {bulkForm.topicEnabled && (
              <input type="text" value={bulkForm.topic} onChange={e => setBulkForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="e.g. Data Structures"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Skills</label>
              <div className="flex gap-1 text-xs">
                {["add", "replace"].map(mode => (
                  <button key={mode} type="button" onClick={() => setBulkForm(f => ({ ...f, skillsMode: mode }))}
                    className={`px-2.5 py-1 rounded-lg border capitalize transition-colors ${bulkForm.skillsMode === mode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                    {mode === "add" ? "Add to existing" : "Replace all"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
              {skills.map(s => (
                <button key={s.id} type="button" onClick={() => toggleBulkSkill(s.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    bulkForm.skills.includes(s.id) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                  }`}>
                  {s.name}
                </button>
              ))}
              {skills.length === 0 && <p className="text-xs text-gray-400">No skills defined.</p>}
            </div>
          </div>

          {/* Domain Types */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Domain Types</label>
              <div className="flex gap-1 text-xs">
                {["add", "replace"].map(mode => (
                  <button key={mode} type="button" onClick={() => setBulkForm(f => ({ ...f, domainsMode: mode }))}
                    className={`px-2.5 py-1 rounded-lg border capitalize transition-colors ${bulkForm.domainsMode === mode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                    {mode === "add" ? "Add to existing" : "Replace all"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
              {allDomainTypes.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => toggleBulkDomain(value)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    bulkForm.domains.includes(value) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Templates</label>
              <div className="flex gap-1 text-xs">
                {[{ key: "add", label: "Add to" }, { key: "remove", label: "Remove from" }].map(({ key, label }) => (
                  <button key={key} type="button" onClick={() => setBulkForm(f => ({ ...f, templatesMode: key }))}
                    className={`px-2.5 py-1 rounded-lg border transition-colors ${bulkForm.templatesMode === key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => toggleBulkTemplate(t.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    bulkForm.templateIds.includes(t.id) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                  }`}>
                  {t.name}
                </button>
              ))}
              {templates.length === 0 && <p className="text-xs text-gray-400">No templates defined.</p>}
            </div>
          </div>

          {/* Progress */}
          {bulkProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Saving…</span>
                <span>{bulkProgress.done} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleBulkEdit} disabled={bulkSaving || !bulkHasChanges}
              className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {bulkSaving ? "Saving…" : `Apply to ${selected.size} Question${selected.size !== 1 ? "s" : ""}`}
            </button>
            <button onClick={() => { setShowBulkEdit(false); setBulkForm(BLANK_BULK); }}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}

