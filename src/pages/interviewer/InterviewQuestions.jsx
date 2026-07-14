import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getInterview, updateInterview, getTemplate,
  getQuestionsByIds, getCandidateAskedQuestions,
  incrementQuestionUsage, createAdhocQuestion,
} from "../../api/firestore";
import Toast from "../../components/Toast";

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
        if (tmpl?.questionIds?.length) {
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
    templateQs.forEach(q => { if (q.topic) set.add(q.topic); });
    return [...set].sort();
  }, [templateQs]);

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

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  if (!interview) return <div className="p-8 text-gray-400 text-sm">Interview not found.</div>;

  const isCompleted = interview.status === "completed";

  return (
    <div className="p-8 max-w-3xl">
      <Link to={`/interviewer/interviews/${id}`}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← Back to evaluation
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Questions Asked</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {interview.candidateName}
          {template && <> · <span className="text-indigo-700 font-medium">{template.name}</span></>}
        </p>
      </div>

      {templateQs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No questions are attached to this interview's template.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-gray-400">{askedQIds.size} / {templateQs.length} marked</span>
          </div>

          {(domainOptions.length > 0 || topicOptions.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Domains</option>
                {domainOptions.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </select>
              <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
                      <div key={q.id} className={`rounded-lg border p-3 transition-colors ${isAsked ? "border-indigo-200 bg-indigo-50/40" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-start gap-2.5">
                          {isCompleted ? (
                            <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded ${isAsked ? "bg-indigo-600" : "bg-gray-200"}`}>
                              {isAsked && (
                                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          ) : (
                            <input type="checkbox" checked={isAsked} onChange={() => toggleAsked(q.id)}
                              className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
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
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Asked before
                                </span>
                              )}
                            </div>
                            {q.suggestedAnswer && (
                              <button type="button" onClick={() => toggleAnswerVisible(q.id)}
                                className="mt-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                                {expandedAnswers.has(q.id) ? "Hide Answer ▲" : "Show Answer ▼"}
                              </button>
                            )}
                            {expandedAnswers.has(q.id) && q.suggestedAnswer && (
                              <div className="mt-1.5 text-sm text-gray-700 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                                {q.suggestedAnswer}
                              </div>
                            )}
                            {isAsked && !isCompleted && (
                              <textarea
                                rows={2}
                                value={qRemarks[q.id] || ""}
                                onChange={e => setQRemarks(r => ({ ...r, [q.id]: e.target.value }))}
                                placeholder="Add remarks for this question…"
                                className="mt-2 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
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
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button onClick={handleAddAdhoc} disabled={qSaving || !adhocText.trim()}
                  className="self-end px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-40 whitespace-nowrap">
                  Submit
                </button>
              </div>
            </div>
          )}

          {!isCompleted && (
            <div className="mt-4 flex justify-end">
              <button onClick={handleSaveQuestions} disabled={qSaving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {qSaving ? "Saving…" : "Save Questions"}
              </button>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
