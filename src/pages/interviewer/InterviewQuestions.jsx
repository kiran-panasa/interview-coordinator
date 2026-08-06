import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ListChecks, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Send,
} from "lucide-react";
import {
  getInterview, updateInterview, getTemplate, getTemplates, getPrograms,
  getQuestionsByIds, getCandidateAskedQuestions,
  incrementQuestionUsage, createAdhocQuestion,
} from "../../api/firestore";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import AutosaveIndicator from "../../components/AutosaveIndicator";
import { Skeleton } from "../../components/Skeleton";
import { useAutosaveDraft } from "../../hooks/useAutosaveDraft";

const DIFF_BADGE = { easy: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-700", hard: "bg-red-50 text-red-700" };

// Questions may carry domains as the modern `domainTypes` array or the legacy
// singular `domainType` string — normalize to an array everywhere we read it.
function questionDomains(q) {
  return Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
}

export default function InterviewQuestions() {
  const { id } = useParams();
  const [interview, setInterview] = useState(null);
  const [template,  setTemplate]  = useState(null);
  const [programName, setProgramName] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  const [templateQs,     setTemplateQs]     = useState([]);
  const [askedQIds,      setAskedQIds]      = useState(new Set());
  const [qRemarks,       setQRemarks]       = useState({});
  const [priorAskedSet,  setPriorAskedSet]  = useState(new Set());
  const [adhocText,      setAdhocText]      = useState("");
  const [qSaving,        setQSaving]        = useState(false);
  const [filterDomain,   setFilterDomain]   = useState("");
  const [filterTopic,    setFilterTopic]    = useState("");
  const [expandedAnswers, setExpandedAnswers] = useState(new Set());

  useEffect(() => {
    getInterview(id).then(async iv => {
      setInterview(iv);
      if (iv?.templateId) {
        const tmpl = await getTemplate(iv.templateId);
        setTemplate(tmpl);
        if (tmpl?.program) {
          // Program-wide pool — questions are curated onto whichever
          // template they were assigned to, and a Program can have several
          // templates (different rounds). Interviewers should see every
          // question tagged anywhere within the candidate's Program, not
          // just the subset that happens to be linked to this one template.
          const [allTemplates, programs] = await Promise.all([getTemplates(), getPrograms()]);
          setProgramName(programs.find(p => p.id === tmpl.program)?.name || "");
          const idSet = new Set();
          allTemplates
            .filter(t => t.program === tmpl.program)
            .forEach(t => (t.questionIds || []).forEach(qid => idSet.add(qid)));
          if (idSet.size) getQuestionsByIds([...idSet]).then(setTemplateQs);
        } else if (tmpl?.questionIds?.length) {
          // No Program set on this template — fall back to just its own list.
          getQuestionsByIds(tmpl.questionIds).then(setTemplateQs);
        }
      }
      setAskedQIds(new Set(iv?.questionsAsked || []));
      setQRemarks(iv?.questionRemarks || {});
      if (iv?.candidateId) {
        getCandidateAskedQuestions(iv.candidateId, id).then(setPriorAskedSet);
      }
      setLoading(false);
    });
  }, [id]);

  const domainOptions = useMemo(() => {
    const set = new Set();
    templateQs.forEach(q => questionDomains(q).forEach(d => set.add(d)));
    return [...set].sort();
  }, [templateQs]);

  const topicOptions = useMemo(() => {
    const set = new Set();
    templateQs.forEach(q => {
      if (!q.topic) return;
      if (filterDomain && !questionDomains(q).includes(filterDomain)) return;
      set.add(q.topic);
    });
    return [...set].sort();
  }, [templateQs, filterDomain]);

  // Selected domain changed and the current topic no longer applies to it — clear it.
  useEffect(() => {
    if (filterTopic && !topicOptions.includes(filterTopic)) setFilterTopic("");
  }, [filterDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredQs = useMemo(() => templateQs.filter(q => {
    if (filterDomain && !questionDomains(q).includes(filterDomain)) return false;
    if (filterTopic && q.topic !== filterTopic) return false;
    return true;
  }), [templateQs, filterDomain, filterTopic]);

  const byDomain = useMemo(() => filteredQs.reduce((acc, q) => {
    const key = questionDomains(q)[0] || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {}), [filteredQs]);

  const toggleAnswerVisible = (qid) => setExpandedAnswers(prev => {
    const next = new Set(prev);
    if (next.has(qid)) next.delete(qid);
    else next.add(qid);
    return next;
  });

  const toggleAsked = (qid) => {
    setAskedQIds(prev => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  const handleSaveQuestions = async () => {
    setQSaving(true);
    try {
      const savedBefore = new Set(interview?.questionsAsked || []);
      const newlyAsked = [...askedQIds].filter(qid => !savedBefore.has(qid));
      await updateInterview(id, {
        questionsAsked: [...askedQIds],
        questionRemarks: qRemarks,
      });
      if (newlyAsked.length > 0) await incrementQuestionUsage(newlyAsked);
      setInterview(iv => ({ ...iv, questionsAsked: [...askedQIds], questionRemarks: qRemarks }));
      setToast({ message: "Questions saved." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setQSaving(false);
  };

  const handleAddAdhoc = async () => {
    const text = adhocText.trim();
    if (!text) return;
    setQSaving(true);
    try {
      await createAdhocQuestion({
        text,
        interviewId: id,
        candidateId: interview.candidateId,
        interviewerId: interview.interviewerId,
        templateId: interview.templateId || null,
      });
      setAdhocText("");
      setToast({ message: "Question submitted for review — content team will be notified." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setQSaving(false);
  };

  // Autosave directly to the real fields (no separate draft) — the explicit
  // "Save Questions" click still owns incrementing each question's usage count.
  const questionsDraftData = useMemo(() => ({
    questionsAsked: [...askedQIds],
    questionRemarks: qRemarks,
  }), [askedQIds, qRemarks]);
  const questionsAutosaveEnabled = !!interview?.id && !loading && interview?.status !== "completed";
  const { status: qDraftStatus, lastSavedAt: qDraftSavedAt } = useAutosaveDraft(
    questionsDraftData,
    (data) => updateInterview(id, data),
    { enabled: questionsAutosaveEnabled }
  );

  if (loading) {
    return (
      <div className="p-8 max-w-3xl space-y-5">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-3 w-40" /></div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }
  if (!interview) return <div className="p-8 text-gray-400 text-sm">Interview not found.</div>;

  const isCompleted = interview.status === "completed";

  return (
    <div className="p-8 max-w-3xl">
      <Link to={`/interviewer/interviews/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to evaluation
      </Link>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Questions Asked</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {interview.candidateName}
          {(programName || template?.name) && (
            <> · <span className="text-emerald-700 font-medium">{programName || template.name}</span></>
          )}
        </p>
      </motion.div>

      {templateQs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center text-sm text-gray-400">
          {programName
            ? `No questions are attached to any template in the ${programName} program yet.`
            : "No questions are attached to this interview's template."}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <ListChecks className="w-3.5 h-3.5 text-gray-400" /> {askedQIds.size} / {templateQs.length} marked
            </span>
          </div>

          {(domainOptions.length > 0 || topicOptions.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">All Domains</option>
                {domainOptions.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </select>
              <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">All Topics</option>
                {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(filterDomain || filterTopic) && (
                <button type="button" onClick={() => { setFilterDomain(""); setFilterTopic(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filteredQs.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No questions match the selected domain/topic.</p>
          )}

          <div className="space-y-5">
            {Object.entries(byDomain).map(([domain, qs]) => (
              <div key={domain}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{domain.replace(/_/g, " ")}</p>
                <div className="space-y-2">
                  {qs.map(q => {
                    const isAsked  = askedQIds.has(q.id);
                    const isRepeat = priorAskedSet.has(q.id);
                    return (
                      <div key={q.id} className={`rounded-xl border p-3 transition-colors ${isAsked ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-start gap-2.5">
                          {isCompleted ? (
                            <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded flex items-center justify-center ${isAsked ? "bg-emerald-600" : "bg-gray-200"}`}>
                              {isAsked && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                            </div>
                          ) : (
                            <input type="checkbox" checked={isAsked} onChange={() => toggleAsked(q.id)}
                              className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{q.text}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {q.difficulty && (
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded capitalize ${DIFF_BADGE[q.difficulty] || "bg-gray-100 text-gray-600"}`}>
                                  {q.difficulty}
                                </span>
                              )}
                              {q.topic && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{q.topic}</span>
                              )}
                              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                Used {q.usageCount || 0}×
                              </span>
                              {isRepeat && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <AlertTriangle className="w-3 h-3" />
                                  Asked before
                                </span>
                              )}
                            </div>
                            {q.suggestedAnswer && (
                              <button type="button" onClick={() => toggleAnswerVisible(q.id)}
                                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-800">
                                {expandedAnswers.has(q.id) ? <>Hide Answer <ChevronUp className="w-3 h-3" /></> : <>Show Answer <ChevronDown className="w-3 h-3" /></>}
                              </button>
                            )}
                            {expandedAnswers.has(q.id) && q.suggestedAnswer && (
                              <div className="mt-1.5 text-sm text-gray-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                                {q.suggestedAnswer}
                              </div>
                            )}
                            {isAsked && !isCompleted && (
                              <textarea
                                rows={2}
                                value={qRemarks[q.id] || ""}
                                onChange={e => setQRemarks(r => ({ ...r, [q.id]: e.target.value }))}
                                placeholder="Add remarks for this question…"
                                className="mt-2 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-white"
                              />
                            )}
                            {isAsked && isCompleted && qRemarks[q.id] && (
                              <p className="mt-1.5 text-xs text-gray-600 italic">{qRemarks[q.id]}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {!isCompleted && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">Add your own question</p>
              <p className="text-xs text-gray-400 mb-2">Questions you submit here go to the content team for review.</p>
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={adhocText}
                  onChange={e => setAdhocText(e.target.value)}
                  placeholder="Type a question you asked that isn't listed above…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <Button variant="secondary" icon={Send} onClick={handleAddAdhoc} disabled={qSaving || !adhocText.trim()}
                  className="self-end !bg-gray-800 !text-white hover:!bg-gray-700 disabled:!opacity-40 whitespace-nowrap">
                  Submit
                </Button>
              </div>
            </div>
          )}

          {!isCompleted && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <AutosaveIndicator status={qDraftStatus} lastSavedAt={qDraftSavedAt} />
              <Button variant="primary" onClick={handleSaveQuestions} disabled={qSaving}
                className="!bg-emerald-600 hover:!bg-emerald-700">
                {qSaving ? "Saving…" : "Save Questions"}
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
