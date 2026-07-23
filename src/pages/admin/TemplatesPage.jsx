import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus, RefreshCw, X, Copy, Upload, Download, CheckCircle2, AlertTriangle,
  Info, FileWarning, ListChecks,
} from "lucide-react";
import { useInterviews } from "../../hooks/subscriptions";
import { formatDateShort } from "../../utils/dates";
import { useQueryClient } from "@tanstack/react-query";
import {
  createTemplate, updateTemplate, deleteTemplate,
  getQuestions, updateInterview,
} from "../../api/firestore";
import { useSkills, usePrograms, useTemplates, QK } from "../../hooks/queries";
import SkillsSelect from "../../components/SkillsSelect";
import { DOMAIN_PRESETS, DOMAIN_TYPE_ORDER } from "../../utils/templateEngine";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import DynamicFeedbackForm from "../../components/DynamicFeedbackForm";
import KebabMenu from "../../components/KebabMenu";
import { deepClone, slugify } from "../../utils/templateHelpers";
import { parseTemplateCSV, downloadSampleExcel, exportTemplateToExcel } from "../../utils/templateCSV";
import { DomainRow, AddDomainPanel } from "../../components/templates/DomainEditor";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3, ease: "easeOut" } }),
};

const makeEmptyForm = () => ({
  name: "",
  domains: DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i })),
  questionBank: { theory: [], coding: [], project: [], resume: [] },
});

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: programs  = [] } = usePrograms();
  const { data: skills    = [] } = useSkills();
  const interviews = useInterviews();
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [form,          setForm]          = useState(makeEmptyForm);
  const [qbTexts,       setQbTexts]       = useState({ theory: "", coding: "", project: "", resume: "" });
  const [activeTab,     setActiveTab]     = useState("domains");
  const [bankQuestions,       setBankQuestions]       = useState([]);
  const [bankQuestionsLoaded, setBankQuestionsLoaded] = useState(false);
  const [assignedQIds,  setAssignedQIds]  = useState([]);
  const [qbSearch,      setQbSearch]      = useState("");
  const [qbDomainFilter,setQbDomainFilter]= useState("");
  const [saving,        setSaving]        = useState(false);
  const [migrating,     setMigrating]     = useState(false);
  const [syncingNames,  setSyncingNames]  = useState(false);
  const [toast,         setToast]         = useState(null);
  const [csvErrors,     setCsvErrors]     = useState([]);
  const csvFileRef = useRef(null);

  const [activeProgram,  setActiveProgram]  = useState("all"); // "all" | programId | "unassigned"

  // Lazy-load bank questions only when the question bank tab is first opened
  useEffect(() => {
    if (activeTab === "questionbank" && !bankQuestionsLoaded) {
      getQuestions().then(qs => {
        setBankQuestions(qs.filter(q => q.status !== "archived"));
        setBankQuestionsLoaded(true);
      });
    }
  }, [activeTab, bankQuestionsLoaded]);

  // Stats per templateId: { [id]: { scheduled, completed, cancelled } }
  const templateStats = useMemo(() => interviews.reduce((acc, iv) => {
    const tid = iv.templateId;
    if (!tid) return acc;
    if (!acc[tid]) acc[tid] = { scheduled: 0, completed: 0, cancelled: 0 };
    if (iv.status === "completed")                                      acc[tid].completed++;
    else if (iv.status === "cancelled" || iv.status === "no_show")      acc[tid].cancelled++;
    else if (iv.status !== "declined")                                  acc[tid].scheduled++;
    return acc;
  }, {}), [interviews]);

  const toTexts = (qb = {}) => ({
    theory:  (qb.theory  || []).join("\n"),
    coding:  (qb.coding  || []).join("\n"),
    project: (qb.project || []).join("\n"),
    resume:  (qb.resume  || []).join("\n"),
  });

  const toArrays = (texts = {}) => ({
    theory:  texts.theory?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
    coding:  texts.coding?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
    project: texts.project?.split("\n").map(q => q.trim()).filter(Boolean) || [],
    resume:  texts.resume?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
  });

  const openNew = () => {
    if (templates.length === 0) {
      openBlank();
    } else {
      setShowNewPicker(true);
    }
  };

  const openBlank = () => {
    setEditTarget(null);
    const defaultProgram = (activeProgram !== "all" && activeProgram !== "unassigned") ? activeProgram : "";
    setForm({ name: "", program: defaultProgram, skills: [], domains: [], questionBank: {} });
    setQbTexts({ theory: "", coding: "", project: "", resume: "" });
    setAssignedQIds([]);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowNewPicker(false);
    setShowModal(true);
  };

  const migrateDomainsForEdit = (rawDomains) =>
    rawDomains.map(domain => {
      const cardFields = (domain.cardFields || [])
        .filter(f => f.type !== "computed")
        .map(f => {
          if (f.type === "dropdown" && f.options?.length > 0 && f.optionsSource) {
            const { optionsSource, ...rest } = f;
            return rest;
          }
          return f;
        });
      const existing = (domain.domainFields || []).filter(f => f.type !== "computed_domain");
      // If no domain-level fields exist (old schema), seed from preset so the user sees defaults
      const domainFields = existing.length > 0
        ? existing
        : deepClone(DOMAIN_PRESETS[domain.type]?.domainFields || []);
      const scored = cardFields.filter(f => f.type === "scored_dropdown");
      const hasWeights = scored.some(f => f.weight != null);
      const migratedCardFields = (scored.length > 0 && !hasWeights)
        ? cardFields.map(f => f.type === "scored_dropdown"
            ? { ...f, weight: parseFloat((100 / scored.length).toFixed(1)) }
            : f)
        : cardFields;
      return { ...domain, cardFields: migratedCardFields, domainFields };
    });

  const openClone = (source) => {
    setEditTarget(null);
    const rawDomains = (source.domains || []).length > 0
      ? source.domains
      : DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i }));
    const resluggedDomains = deepClone(migrateDomainsForEdit(rawDomains)).map(d => {
      const slug = slugify(d.label) || d.id;
      return { ...d, id: slug, type: slug };
    });
    setForm({ name: `Copy of ${source.name}`, program: source.program || "", skills: source.skills || [], domains: resluggedDomains });
    setQbTexts(toTexts(source.questionBank || source.questions));
    setAssignedQIds(source.questionIds || []);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowNewPicker(false);
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditTarget(t);
    const rawDomains = (t.domains || []).length > 0
      ? t.domains
      : DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i }));
    setForm({ name: t.name, program: t.program || "", skills: t.skills || [], domains: deepClone(migrateDomainsForEdit(rawDomains)) });
    setQbTexts(toTexts(t.questionBank || t.questions));
    setAssignedQIds(t.questionIds || []);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowModal(true);
  };

  // ── CSV import ─────────────────────────────────────────────────────────────

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { template, errors } = parseTemplateCSV(ev.target.result);
      if (errors.length) { setCsvErrors(errors); return; }
      setCsvErrors([]);
      setEditTarget(null);
      setForm({ name: template.name, domains: template.domains, questionBank: template.questionBank || {} });
      setQbTexts({ theory: "", coding: "", project: "", resume: "" });
      setActiveTab("domains");
      setShowNewPicker(false);
      setShowModal(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };


  // ── Domain mutations ────────────────────────────────────────────────────────

  const updateDomain = (domainId, newDomain) =>
    setForm(prev => ({
      ...prev,
      domains: prev.domains.map(d => d.id === domainId ? newDomain : d),
    }));

  const moveDomain = (domainId, direction) => {
    setForm(prev => {
      const sorted = [...prev.domains].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(d => d.id === domainId);
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === sorted.length - 1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      const next = [...sorted];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, domains: next.map((d, i) => ({ ...d, order: i })) };
    });
  };

  const addDomain = (type) => {
    if (type === "custom") {
      setForm(prev => {
        const customCount = prev.domains.filter(d => d.type === "custom").length;
        const newId = `custom_${customCount + 1}`;
        return {
          ...prev,
          domains: [...prev.domains, {
            id: newId, type: "custom", label: "New Domain",
            order: prev.domains.length, enabled: true, weightInVerdict: 0,
            defaultCardCount: 0, cardFields: [],
            domainFields: [{ id: makeFieldId("domain_remarks"), label: "Domain Remarks", type: "text", placeholder: "" }],
          }],
        };
      });
    } else {
      const preset = DOMAIN_PRESETS[type];
      if (!preset) return;
      setForm(prev => {
        const existing = prev.domains.filter(d => d.type === type);
        const newId = existing.length > 0 ? `${type}_${existing.length + 1}` : type;
        return {
          ...prev,
          domains: [...prev.domains, { ...deepClone(preset), id: newId, order: prev.domains.length }],
        };
      });
    }
  };

  const removeDomain = (domainId) => {
    setForm(prev => ({
      ...prev,
      domains: prev.domains.filter(d => d.id !== domainId).map((d, i) => ({ ...d, order: i })),
    }));
  };

  const equalize = () => {
    const scored = sortedDomains.filter(d => d.enabled && (d.weightInVerdict ?? 0) > 0);
    if (!scored.length) return;
    const share = parseFloat((100 / scored.length).toFixed(1));
    setForm(prev => ({
      ...prev,
      domains: prev.domains.map(d =>
        d.enabled && (d.weightInVerdict ?? 0) > 0 ? { ...d, weightInVerdict: share } : d
      ),
    }));
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) return setToast({ message: "Template name is required.", type: "error" });
    const scored = sortedDomains.filter(d => d.enabled && (d.weightInVerdict ?? 0) > 0);
    const total = scored.reduce((s, d) => s + (d.weightInVerdict ?? 0), 0);
    if (scored.length > 0 && Math.abs(total - 100) > 0.5) {
      return setToast({ message: `Domain weights must total 100% (currently ${total}%). Use Equalize to fix.`, type: "error" });
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        program: form.program || "",
        skills: form.skills || [],
        domains: [...form.domains].sort((a, b) => a.order - b.order),
        questionBank: toArrays(qbTexts),
        questionIds: assignedQIds,
        schemaVersion: 2,
      };
      if (editTarget) {
        await updateTemplate(editTarget.id, data);
        setToast({ message: "Template updated." });
      } else {
        await createTemplate(data);
        setToast({ message: "Template created." });
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: QK.templates });
      if (editTarget && previewTarget?.id === editTarget.id) {
        setPreviewTarget(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete "${t.name}"? This won't affect existing interviews.`)) return;
    await deleteTemplate(t.id);
    queryClient.invalidateQueries({ queryKey: QK.templates });
    setToast({ message: "Template deleted." });
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const sortedDomains  = useMemo(() => [...form.domains].sort((a, b) => a.order - b.order), [form.domains]);
  const enabledDomains = useMemo(() => sortedDomains.filter(d => d.enabled), [sortedDomains]);
  const scoredDomains  = useMemo(() => enabledDomains.filter(d => (d.weightInVerdict ?? 0) > 0), [enabledDomains]);
  const totalWeight    = useMemo(() => scoredDomains.reduce((s, d) => s + (d.weightInVerdict ?? 0), 0), [scoredDomains]);
  const weightOk       = useMemo(() => scoredDomains.length === 0 || Math.abs(totalWeight - 100) < 0.5, [scoredDomains, totalWeight]);

  const previewTemplate = previewTarget && {
    ...previewTarget,
    questionBank: previewTarget.questionBank || previewTarget.questions || {},
  };

  // Filtered templates for the active program tab
  const visibleTemplates = useMemo(() => templates.filter(t => {
    if (activeProgram === "all")        return true;
    if (activeProgram === "unassigned") return !t.program;
    return t.program === activeProgram;
  }), [templates, activeProgram]);

  const programTemplateCounts = useMemo(() => {
    const counts = new Map();
    for (const t of templates) {
      counts.set(t.program || "__unassigned__", (counts.get(t.program || "__unassigned__") || 0) + 1);
    }
    return counts;
  }, [templates]);

  const handleMigrateDomainIds = async () => {
    if (!confirm(
      `This will re-generate domain IDs from their labels for all ${templates.length} template(s).\n\nExample: "Drill Down on Web Coding Questions" → drill_down_on_web_coding_questions\n\nContinue?`
    )) return;
    setMigrating(true);
    try {
      for (const t of templates) {
        const newDomains = (t.domains || []).map(d => {
          const slug = slugify(d.label) || d.id;
          return { ...d, id: slug, type: slug };
        });
        await updateTemplate(t.id, { domains: newDomains });
      }
      setToast({ message: `${templates.length} template(s) migrated — domain IDs now match labels.` });
      queryClient.invalidateQueries({ queryKey: QK.templates });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setMigrating(false);
  };

  // A template's name is snapshotted onto every interview at creation time
  // (so history reads correctly even if a template is later deleted). When a
  // template is renamed, those old copies go stale — this backfills them.
  const handleSyncTemplateNames = async () => {
    const nameById = new Map(templates.map(t => [t.id, t.name]));
    const stale = interviews.filter(iv => iv.templateId && nameById.has(iv.templateId) && iv.templateName !== nameById.get(iv.templateId));
    if (stale.length === 0) {
      setToast({ message: "Every interview's template name is already up to date." });
      return;
    }
    if (!confirm(
      `${stale.length} interview record(s) reference a template that's since been renamed.\n\nUpdate them to show the current template name (including completed interviews)?`
    )) return;
    setSyncingNames(true);
    try {
      for (const iv of stale) {
        await updateInterview(iv.id, { templateName: nameById.get(iv.templateId) });
      }
      setToast({ message: `${stale.length} interview record(s) updated to the current template name.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSyncingNames(false);
  };

  const programTabs = [
    { id: "all",        label: "All",        count: templates.length },
    ...programs.map(p => ({ id: p.id, label: p.name, count: programTemplateCounts.get(p.id) || 0 })),
    { id: "unassigned", label: "Unassigned", count: programTemplateCounts.get("__unassigned__") || 0 },
  ];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interview Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Define domains, evaluation fields, and question banks</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSyncTemplateNames} disabled={syncingNames || templates.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-brand-300 text-brand-700 text-xs font-semibold rounded-xl hover:bg-brand-50 disabled:opacity-40 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${syncingNames ? "animate-spin" : ""}`} />
            {syncingNames ? "Syncing…" : "Sync Template Names"}
          </button>
          <button onClick={handleMigrateDomainIds} disabled={migrating || templates.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 text-xs font-semibold rounded-xl hover:bg-amber-50 disabled:opacity-40 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${migrating ? "animate-spin" : ""}`} />
            {migrating ? "Migrating…" : "Sync Domain IDs"}
          </button>
          <Button variant="primary" size="md" icon={Plus} onClick={openNew}>
            New Template
          </Button>
        </div>
      </motion.div>

      {/* ── Program Tabs (filter only — manage programs in Settings) ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="flex border-b border-gray-200 mb-6 overflow-x-auto scrollbar-thin"
      >
        {programTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveProgram(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
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

      {/* ── Template list ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-6 w-6 rounded-lg flex-shrink-0" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-12 text-center">
          {templates.length === 0 ? (
            <>
              <p className="text-gray-400 text-sm mb-4">No templates yet.</p>
              <button onClick={openNew} className="text-brand-600 text-sm font-semibold hover:underline">
                Create your first template →
              </button>
            </>
          ) : (
            <p className="text-gray-400 text-sm">No templates in this program yet.</p>
          )}
        </div>
      ) : (
        <motion.div
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {visibleTemplates.map(t => {
            const domains = (t.domains || []).filter(d => d.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const isV2 = t.schemaVersion === 2;
            const programName = programs.find(p => p.id === t.program)?.name;
            return (
              <motion.div key={t.id} variants={fadeUp}
                className="bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-card transition-shadow p-5 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h2 className="text-base font-bold text-gray-900 leading-tight">{t.name}</h2>
                  </div>
                  <KebabMenu actions={[
                    { label: "Preview",  onClick: () => setPreviewTarget(t) },
                    { label: "Export",   onClick: () => exportTemplateToExcel(t), highlight: true },
                    { label: "Edit",     onClick: () => openEdit(t) },
                    { label: "Delete",   onClick: () => handleDelete(t), danger: true },
                  ]} />
                </div>

                {/* Program badge (only visible on "All" tab) */}
                {activeProgram === "all" && programName && (
                  <span className="self-start text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                    {programName}
                  </span>
                )}

                {/* Domain chips */}
                {isV2 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {domains.map(d => (
                      <span key={d.id} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-medium">
                        {d.label}{(d.weightInVerdict ?? 0) > 0 ? ` ${d.weightInVerdict}%` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {["Coding", t.hasTheory && "Theory", t.hasProject && "Project", t.hasResume && "Resume"].filter(Boolean).map(l => (
                      <span key={l} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{l}</span>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400">Created {formatDateShort(t.createdAt)}</p>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── Interview Stats Table ── */}
      {!isLoading && visibleTemplates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-8"
        >
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-gray-400" /> Interview Stats
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Template", "Program", "Scheduled", "Completed", "Cancelled", "Total"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleTemplates.map(t => {
                  const s = templateStats[t.id];
                  const programName = programs.find(p => p.id === t.program)?.name;
                  const scheduled  = s?.scheduled  ?? 0;
                  const completed  = s?.completed  ?? 0;
                  const cancelled  = s?.cancelled  ?? 0;
                  const total      = scheduled + completed + cancelled;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                      <td className="px-4 py-3">
                        {programName
                          ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap">{programName}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-brand-700">{scheduled}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-emerald-700">{completed}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-red-500">{cancelled}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-gray-700">{total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── New Template Picker Modal ── */}
      <Modal open={showNewPicker} onClose={() => setShowNewPicker(false)} title="New Interview Template">
        <div className="space-y-4">
          {/* From scratch */}
          <button
            type="button"
            onClick={openBlank}
            className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 hover:shadow-card transition-all text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-brand-100 group-hover:bg-brand-200 rounded-xl flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Start from scratch</p>
              <p className="text-xs text-gray-500 mt-0.5">Build a new template with the default domain structure</p>
            </div>
          </button>

          {/* Import from CSV */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Import from CSV</p>
            <button
              type="button"
              onClick={() => { setCsvErrors([]); csvFileRef.current?.click(); }}
              className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-card transition-all text-left group"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                <Upload className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Upload CSV file</p>
                <p className="text-xs text-gray-500 mt-0.5">Build the full template — domains, fields, weights, options — from a spreadsheet</p>
              </div>
            </button>
            <input ref={csvFileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />

            <button type="button" onClick={downloadSampleExcel}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 py-1.5 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Download sample Excel template
            </button>

            {csvErrors.length > 0 && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <p className="text-xs font-bold text-red-700 mb-1 flex items-center gap-1.5">
                  <FileWarning className="w-3.5 h-3.5" /> CSV parse errors — fix these and re-upload:
                </p>
                {csvErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">• {err}</p>
                ))}
              </div>
            )}
          </div>

          {/* Clone existing */}
          {templates.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Clone an existing template</p>
              <div className="space-y-2">
                {templates.map(t => {
                  const domains = (t.domains || []).filter(d => d.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openClone(t)}
                      className="w-full flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-colors text-left group"
                    >
                      <div className="flex-shrink-0 w-10 h-10 bg-gray-100 group-hover:bg-brand-100 rounded-xl flex items-center justify-center transition-colors">
                        <Copy className="w-5 h-5 text-gray-500 group-hover:text-brand-600 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{t.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {domains.map(d => (
                            <span key={d.id} className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                              {d.label}{(d.weightInVerdict ?? 0) > 0 ? ` ${d.weightInVerdict}%` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Edit Template" : "New Interview Template"} wide>
        <div className="space-y-5">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Template Name *
              </label>
              <input type="text" placeholder="e.g. Systems Mastery - Novice || V1"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Program
              </label>
              <select
                value={form.program || ""}
                onChange={e => setForm(f => ({ ...f, program: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white transition-shadow"
              >
                <option value="">— Unassigned —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Required Skills</label>
            <SkillsSelect
              skills={skills}
              value={form.skills || []}
              onChange={v => setForm(f => ({ ...f, skills: v }))}
              placeholder="Tag required skills for this template…"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[["domains", "Domains"], ["questionbank", "Question Banks"]].map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}>{label}</button>
            ))}
          </div>

          {/* ── Domains tab ── */}
          {activeTab === "domains" && (
            <div className="space-y-2">
              {sortedDomains.map((domain, i) => (
                <DomainRow
                  key={domain.id}
                  domain={domain}
                  isFirst={i === 0}
                  isLast={i === sortedDomains.length - 1}
                  onChange={newDomain => updateDomain(domain.id, newDomain)}
                  onRemove={() => removeDomain(domain.id)}
                  onMove={dir => moveDomain(domain.id, dir)}
                />
              ))}

              <AddDomainPanel onAdd={addDomain} />

              {/* Weight total indicator */}
              <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${
                weightOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2">
                  {weightOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${weightOk ? "text-emerald-700" : "text-red-700"}`}>
                    Total verdict weight: {totalWeight.toFixed(1)}%
                  </span>
                  {!weightOk && <span className="text-xs text-red-500">Must equal 100%</span>}
                </div>
                <button type="button" onClick={equalize}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors">
                  Equalize
                </button>
              </div>
            </div>
          )}

          {/* ── Question Banks tab ── */}
          {activeTab === "questionbank" && (() => {
            const enabledTypes = new Set(enabledDomains.filter(d => d.type !== "overall_feedback").map(d => d.type));
            const assigned   = bankQuestions.filter(q => assignedQIds.includes(q.id));
            const available  = bankQuestions.filter(q => !assignedQIds.includes(q.id) && (enabledTypes.size === 0 || enabledTypes.has(q.domainType)));
            const filteredAvail = available.filter(q => {
              if (qbDomainFilter && q.domainType !== qbDomainFilter) return false;
              if (qbSearch) {
                const sq = qbSearch.toLowerCase();
                return q.text?.toLowerCase().includes(sq) || q.topic?.toLowerCase().includes(sq);
              }
              return true;
            });
            const availDomainTypes = [...new Set(available.map(q => q.domainType).filter(Boolean))].sort();
            const DIFF_COLORS = { easy: "text-emerald-600", medium: "text-amber-600", hard: "text-red-600" };

            return (
              <div className="space-y-4">
                {/* Assigned questions */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Assigned to this template ({assigned.length})
                  </p>
                  {assigned.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center">
                      <p className="text-sm text-gray-400">No questions assigned yet. Search below to add from the bank.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto">
                      {assigned.map(q => (
                        <div key={q.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{q.text}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-brand-500">{q.domainType}</span>
                              {q.topic && <span className="text-[10px] text-gray-400">· {q.topic}</span>}
                              {q.difficulty && <span className={`text-[10px] font-semibold ${DIFF_COLORS[q.difficulty] || ""}`}>· {q.difficulty}</span>}
                            </div>
                          </div>
                          <button type="button"
                            onClick={() => setAssignedQIds(ids => ids.filter(id => id !== q.id))}
                            className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors mt-0.5">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search from bank */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Add from Question Bank
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Search questions…"
                      value={qbSearch}
                      onChange={e => setQbSearch(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                    />
                    <select value={qbDomainFilter} onChange={e => setQbDomainFilter(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow">
                      <option value="">All Domains</option>
                      {availDomainTypes.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {bankQuestions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No questions in the bank yet. Go to <span className="font-semibold">Question Bank</span> to add some.
                    </p>
                  ) : filteredAvail.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {available.length === 0 ? "All matching questions are already assigned." : "No questions match your search."}
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {filteredAvail.map(q => (
                        <button key={q.id} type="button"
                          onClick={() => setAssignedQIds(ids => [...ids, q.id])}
                          className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-brand-50 text-left transition-colors">
                          <Plus className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{q.text}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-brand-500">{q.domainType}</span>
                              {q.topic && <span className="text-[10px] text-gray-400">· {q.topic}</span>}
                              {q.difficulty && <span className={`text-[10px] font-semibold ${DIFF_COLORS[q.difficulty] || ""}`}>· {q.difficulty}</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="md" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : editTarget ? "Update Template" : "Create Template"}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Preview Modal ── */}
      {previewTarget && (
        <Modal open onClose={() => setPreviewTarget(null)} title={`Preview — ${previewTarget.name}`} wide>
          <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              Preview mode — exactly what the interviewer will see. Interactive but nothing is saved.
            </p>
          </div>
          {previewTemplate?.domains ? (
            <DynamicFeedbackForm
              template={previewTemplate}
              interview={null}
              onSubmit={() => {}}
              saving={false}
              previewMode
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              Legacy template format. Edit and re-save to upgrade.
            </p>
          )}
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
