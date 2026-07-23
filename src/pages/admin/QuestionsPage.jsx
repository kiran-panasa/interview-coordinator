import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Plus, Upload, Pencil, Download,
} from "lucide-react";
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
import Button from "../../components/Button";
import { usePagination } from "../../hooks/usePagination";
import QuestionBankTab from "../../features/questions/QuestionBankTab";
import AdhocReviewTab from "../../features/questions/AdhocReviewTab";

// ── Page ──────────────────────────────────────────────────────────────────────

const DIFFICULTIES = ["easy", "medium", "hard"];

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

  const allDomainTypes = useMemo(() => {
    const map = new Map();
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
  }, [templates, questions]);

  // Scope of questions the filter dropdowns should draw their options from —
  // narrowed to the selected template's own questions, or every question when
  // no template is selected.
  const templateQuestionSet = useMemo(
    () => filterTemplate ? new Set(templates.find(t => t.id === filterTemplate)?.questionIds || []) : null,
    [filterTemplate, templates]
  );
  const scopedQuestions = useMemo(
    () => templateQuestionSet ? questions.filter(q => templateQuestionSet.has(q.id)) : questions,
    [questions, templateQuestionSet]
  );

  // Domain filter options: only domains actually used by a non-archived
  // question in scope, grouped by display label — different templates
  // sometimes define the "same" domain under a different slug, which
  // otherwise shows up as duplicate entries with an identical name.
  const domainFilterOptions = useMemo(() => {
    const byLabel = new Map(); // labelKey -> { label, values: Set }
    scopedQuestions.forEach(q => {
      if (q.status === "archived") return;
      const types = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
      types.forEach(val => {
        if (!val) return;
        const label = (allDomainTypes.find(d => d.value === val)?.label || val).trim();
        const key = label.toLowerCase();
        if (!byLabel.has(key)) byLabel.set(key, { label, values: new Set() });
        byLabel.get(key).values.add(val);
      });
    });
    return [...byLabel.values()]
      .map(({ label, values }) => ({ label, values: [...values] }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedQuestions, allDomainTypes]);

  const skillFilterOptions = useMemo(() => {
    const ids = new Set();
    scopedQuestions.forEach(q => { if (q.status !== "archived") (q.skills || []).forEach(sid => ids.add(sid)); });
    return skills.filter(s => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedQuestions, skills]);

  const allTopics = useMemo(
    () => [...new Set(scopedQuestions.filter(q => q.status !== "archived" && q.topic).map(q => q.topic))].sort(),
    [scopedQuestions]
  );

  // If the selected template changes and the current domain/skill/topic
  // filter no longer applies to it, clear that filter rather than silently
  // filtering everything out.
  useEffect(() => {
    if (filterDomain && !domainFilterOptions.some(d => d.label === filterDomain)) setFilterDomain("");
    if (filterSkill  && !skillFilterOptions.some(s => s.id === filterSkill))      setFilterSkill("");
    if (filterTopic  && !allTopics.includes(filterTopic))                        setFilterTopic("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTemplate]);

  const handleClearFilters = () => {
    setSearch("");
    setFilterDomain("");
    setFilterDifficulty("");
    setFilterSkill("");
    setFilterTopic("");
    setFilterTemplate("");
    setShowArchived(false);
  };

  const hasActiveFilters = !!(search || filterDomain || filterDifficulty || filterSkill || filterTopic || filterTemplate || showArchived);

  // reverse map: questionId → [template objects] for O(1) per-question lookups
  const qToTemplatesMap = useMemo(() => {
    const map = new Map();
    templates.forEach(t => {
      (t.questionIds || []).forEach(qid => {
        if (!map.has(qid)) map.set(qid, []);
        map.get(qid).push(t);
      });
    });
    return map;
  }, [templates]);

  const templateIdsForQuestion = useCallback(
    (qid) => (qToTemplatesMap.get(qid) || []).map(t => t.id),
    [qToTemplatesMap]
  );

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
    const skillNameMap    = new Map(skills.map(s    => [s.name.toLowerCase(),    s.id]));
    const templateNameMap = new Map(templates.map(t => [t.name.toLowerCase(), t.id]));
    try {
      await Promise.all(bulkPreview.rows.map(async (row) => {
        const skillIds        = row.skills.map(n => skillNameMap.get(n.toLowerCase())).filter(Boolean);
        const templateMatchIds = row.templates.map(n => templateNameMap.get(n.toLowerCase())).filter(Boolean);
        const qid = await createQuestion({
          text: row.text, domainTypes: row.domainTypes,
          difficulty: row.difficulty, topic: row.topic, skills: skillIds,
          suggestedAnswer: row.suggestedAnswer || "",
        });
        if (templateMatchIds.length > 0) {
          await Promise.all(templateMatchIds.map(tid => addQuestionToTemplate(tid, qid)));
        }
      }));
      if (bulkPreview.rows.some(r => r.templates.length > 0)) queryClient.invalidateQueries({ queryKey: QK.templates });
      setShowBulkModal(false);
      setBulkPreview(null);
      setBulkText("");
      const imported = bulkPreview.rows.length;
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

  const filtered = useMemo(() => questions.filter(q => {
    if (!showArchived && q.status === "archived") return false;
    if (showArchived  && q.status !== "archived") return false;
    const qDomains = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
    if (filterDomain) {
      const matchValues = domainFilterOptions.find(d => d.label === filterDomain)?.values || [filterDomain];
      if (!qDomains.some(v => matchValues.includes(v))) return false;
    }
    if (filterDifficulty && q.difficulty !== filterDifficulty)       return false;
    if (filterSkill      && !(q.skills || []).includes(filterSkill)) return false;
    if (filterTopic      && q.topic !== filterTopic)                return false;
    if (templateQuestionSet && !templateQuestionSet.has(q.id))       return false;
    if (search) {
      const sq = search.toLowerCase();
      return (
        q.text?.toLowerCase().includes(sq) ||
        q.topic?.toLowerCase().includes(sq) ||
        qDomains.some(d => d?.toLowerCase().includes(sq))
      );
    }
    return true;
  }), [questions, showArchived, filterDomain, filterDifficulty, filterSkill, filterTopic, templateQuestionSet, domainFilterOptions, search]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 20);

  const { activeCount, archivedCount } = useMemo(() => {
    let active = 0, archived = 0;
    questions.forEach(q => { if (q.status === "archived") archived++; else active++; });
    return { activeCount: active, archivedCount: archived };
  }, [questions]);

  const pendingAdhoc  = adhocQs.filter(q => q.status === "pending");

  return (
    <div className="p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-start justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Question Bank</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} active question{activeCount !== 1 ? "s" : ""}
            {archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        {activeTab === "bank" && (
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-100 transition-colors">
                <Pencil className="w-4 h-4" />
                Edit selected ({selected.size})
              </button>
            )}
            <Button variant="secondary" icon={Upload} onClick={() => setShowBulkModal(true)}>
              Bulk Upload
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Add Question
            </Button>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 mb-6">
        {[
          { key: "bank",   label: "Question Bank" },
          { key: "review", label: "Review Queue", count: pendingAdhoc.length },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "text-brand-600"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {tab.count}
              </span>
            )}
            {activeTab === tab.key && (
              <motion.span
                layoutId="questionsTabIndicator"
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-600 rounded-full"
                transition={{ duration: 0.2 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Question Bank tab ── */}
      {activeTab === "bank" && (
        <QuestionBankTab
          questions={questions} loading={loading}
          templates={templates} skills={skills}
          allDomainTypes={allDomainTypes} allTopics={allTopics} qToTemplatesMap={qToTemplatesMap}
          domainFilterOptions={domainFilterOptions} skillFilterOptions={skillFilterOptions}
          search={search} setSearch={setSearch}
          filterDomain={filterDomain} setFilterDomain={setFilterDomain}
          filterDifficulty={filterDifficulty} setFilterDifficulty={setFilterDifficulty}
          filterSkill={filterSkill} setFilterSkill={setFilterSkill}
          filterTopic={filterTopic} setFilterTopic={setFilterTopic}
          filterTemplate={filterTemplate} setFilterTemplate={setFilterTemplate}
          showArchived={showArchived} setShowArchived={setShowArchived}
          hasActiveFilters={hasActiveFilters} onClearFilters={handleClearFilters}
          selected={selected} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll} filtered={filtered}
          paged={paged} page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={pageSize}
          openCreate={openCreate} openEdit={openEdit}
          handleArchive={handleArchive} handleUnarchive={handleUnarchive}
          setShowBulkEdit={setShowBulkEdit} setShowBulkModal={setShowBulkModal}
        />
      )}

      {/* ── Review Queue tab ── */}
      {activeTab === "review" && (
        <AdhocReviewTab
          adhocQs={adhocQs} pendingAdhoc={pendingAdhoc}
          openApprove={openApprove} handleReject={handleReject}
        />
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
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 flex-shrink-0 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>
          </div>

          {/* File upload */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload or Paste CSV</p>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Choose File
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </div>
            <textarea
              rows={6}
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkPreview(null); }}
              placeholder={`text,domainType,difficulty,topic,skills,templates\n"What is a closure?",coding,medium,Closures,JavaScript,\n"Explain reconciliation",react_coding,hard,React Internals,ReactJS|JavaScript,Template A`}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Parse button */}
          {!bulkPreview && (
            <button onClick={handleBulkParse} disabled={!bulkText.trim()}
              className="w-full py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors">
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
                            <td className="px-3 py-2 font-mono text-brand-600">{r.domainTypes.join(", ") || "—"}</td>
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
                    className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-60 transition-colors">
                    {bulkImporting ? "Importing…" : `Import ${bulkPreview.rows.length} Question${bulkPreview.rows.length !== 1 ? "s" : ""}`}
                  </button>
                )}
                <button onClick={() => setBulkPreview(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
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
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
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
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Overwrite topic on all selected
              </label>
            </div>
            {bulkForm.topicEnabled && (
              <input type="text" value={bulkForm.topic} onChange={e => setBulkForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="e.g. Data Structures"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    className={`px-2.5 py-1 rounded-lg border capitalize transition-colors ${bulkForm.skillsMode === mode ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
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
                    className={`px-2.5 py-1 rounded-lg border capitalize transition-colors ${bulkForm.domainsMode === mode ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                    {mode === "add" ? "Add to existing" : "Replace all"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
              {allDomainTypes.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => toggleBulkDomain(value)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    bulkForm.domains.includes(value) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
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
                    className={`px-2.5 py-1 rounded-lg border transition-colors ${bulkForm.templatesMode === key ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
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
                  className="bg-brand-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleBulkEdit} disabled={bulkSaving || !bulkHasChanges}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors">
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

