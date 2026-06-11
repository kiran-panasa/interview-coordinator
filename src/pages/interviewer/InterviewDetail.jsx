import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getInterview, updateInterview, saveFeedbackDraft,
  markSlotFree, DEFAULT_FEEDBACK_QUESTIONS, getTemplate,
} from "../../api/firestore";
import Badge from "../../components/Badge";
import Toast from "../../components/Toast";
import {
  RatingInput, RatingDisplay,
  StructuredFeedbackForm, StructuredFeedbackDisplay,
} from "../../components/StructuredFeedbackForm";
import DynamicFeedbackForm, { DynamicFeedbackDisplay } from "../../components/DynamicFeedbackForm";

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function isPastInterviewTime(scheduledDate, scheduledTime) {
  if (!scheduledDate || !scheduledTime) return false;
  try {
    const match = scheduledTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return false;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const start = new Date(`${scheduledDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    return Date.now() >= start.getTime();
  } catch { return false; }
}

export default function InterviewDetail() {
  const { id } = useParams();
  const [interview, setInterview] = useState(null);
  const [template,  setTemplate]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [answers,   setAnswers]   = useState({});
  const [comments,  setComments]  = useState("");
  const [now,       setNow]       = useState(new Date());

  // tick every minute so the "Mark as Completed" gate re-evaluates when time passes
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getInterview(id).then(async iv => {
      setInterview(iv);
      if (iv?.templateId) {
        const tmpl = await getTemplate(iv.templateId);
        setTemplate(tmpl);
      }
      if (iv?.feedback) {
        setAnswers(iv.feedback.answers || {});
        setComments(iv.feedback.comments || "");
      }
      setLoading(false);
    });
  }, [id]);

  const setAnswer = (qid, val) => setAnswers(a => ({ ...a, [qid]: val }));

  const handleAccept = async () => {
    setSaving(true);
    await updateInterview(id, { status: "scheduled" });
    setInterview(iv => ({ ...iv, status: "scheduled" }));
    setToast({ message: "Interview accepted. It's now scheduled." });
    setSaving(false);
  };

  const handleDecline = async () => {
    if (!confirm("Decline this interview?")) return;
    setSaving(true);
    await updateInterview(id, { status: "declined" });
    const slotId = `${interview.scheduledDate}_${interview.scheduledTime.replace(/[: ]/g, "")}`;
    await markSlotFree(interview.interviewerId, slotId).catch(() => {});
    setInterview(iv => ({ ...iv, status: "declined" }));
    setToast({ message: "Interview declined." });
    setSaving(false);
  };

  const handleMarkCompleted = async () => {
    if (!confirm("Mark this interview as completed?")) return;
    setSaving(true);
    await updateInterview(id, { status: "completed" });
    setInterview(iv => ({ ...iv, status: "completed" }));
    setToast({ message: "Interview marked as completed." });
    setSaving(false);
  };

  // Saves feedback WITHOUT marking completed — called from all form types while scheduled
  const handleSaveFeedback = async (feedbackData, errorMsg) => {
    if (errorMsg) return setToast({ message: errorMsg, type: "error" });
    setSaving(true);
    try {
      await saveFeedbackDraft(id, feedbackData);
      const saved = { ...feedbackData, submittedAt: new Date().toISOString() };
      setInterview(iv => ({ ...iv, feedback: saved }));
      setToast({ message: "Evaluation saved. Mark as Completed when the interview is done." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSaving(false);
  };

  // Legacy generic form submit
  const handleLegacySubmit = async () => {
    const missingRatings = DEFAULT_FEEDBACK_QUESTIONS.filter(q => q.type === "rating" && !answers[q.id]);
    if (missingRatings.length > 0)
      return setToast({ message: `Please fill in: ${missingRatings.map(q => q.label).join(", ")}`, type: "error" });
    const recQuestion = DEFAULT_FEEDBACK_QUESTIONS.find(q => q.type === "select");
    if (recQuestion && !answers[recQuestion.id])
      return setToast({ message: "Please select an overall recommendation.", type: "error" });
    const overallRecommendation = recQuestion ? (answers[recQuestion.id] || "") : "";
    await handleSaveFeedback({ answers, overallRecommendation, comments }, null);
  };

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  if (!interview) return <div className="p-8 text-gray-400 text-sm">Interview not found.</div>;

  const isPending    = interview.status === "pending_acceptance";
  const isScheduled  = interview.status === "scheduled";
  const isCompleted  = interview.status === "completed";
  const hasFeedback  = !!interview.feedback?.submittedAt;
  const isDynamic    = !!(template?.domains);
  const isStructured = !!template && !isDynamic;

  const pastTime     = isPastInterviewTime(interview.scheduledDate, interview.scheduledTime);
  const canComplete  = hasFeedback && pastTime;

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-sm font-semibold text-gray-700 mb-2";

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/interviewer/interviews"
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← Back to My Interviews
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{interview.candidateName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{interview.roleAppliedFor}</p>
          {template && (
            <span className="inline-block mt-1.5 text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
              {template.name}
            </span>
          )}
        </div>
        <Badge value={interview.status} />
      </div>

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Interview Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Date</p>
            <p className="text-sm font-semibold text-gray-800">{fmt(interview.scheduledDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Time</p>
            <p className="text-sm font-semibold text-gray-800">{interview.scheduledTime}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Round</p>
            <p className="text-sm font-semibold text-gray-800">{interview.round || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Candidate Email</p>
            <p className="text-sm font-semibold text-gray-800">{interview.candidateEmail || "—"}</p>
          </div>
          {interview.meetLink && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">Meet Link</p>
              <a href={interview.meetLink} target="_blank" rel="noreferrer"
                className="text-sm text-indigo-600 font-medium hover:underline break-all">
                {interview.meetLink} ↗
              </a>
            </div>
          )}
          {interview.resumeLink && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">Resume</p>
              <a href={interview.resumeLink} target="_blank" rel="noreferrer"
                className="text-sm text-indigo-600 font-medium hover:underline">
                View Resume ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Accept / Decline */}
      {isPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">Awaiting your response</p>
          <p className="text-xs text-amber-600 mb-4">
            {fmt(interview.scheduledDate)} at {interview.scheduledTime} · {interview.round}
          </p>
          <div className="flex gap-3">
            <button onClick={handleAccept} disabled={saving}
              className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              Accept
            </button>
            <button onClick={handleDecline} disabled={saving}
              className="bg-white border border-red-300 text-red-600 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-60">
              Decline
            </button>
          </div>
        </div>
      )}

      {/* ── Evaluation section (scheduled or completed) ── */}
      {(isScheduled || isCompleted) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900">Evaluation</h2>
            {hasFeedback && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Submitted {new Date(interview.feedback.submittedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Feedback form — dynamic v2, only when not yet submitted */}
          {!hasFeedback && isDynamic && (
            <DynamicFeedbackForm
              template={template}
              interview={interview}
              onSubmit={handleSaveFeedback}
              saving={saving}
            />
          )}

          {/* Feedback form — structured v1, only when not yet submitted */}
          {!hasFeedback && isStructured && (
            <StructuredFeedbackForm
              interview={interview} template={template}
              onSubmit={handleSaveFeedback} saving={saving}
            />
          )}

          {/* Feedback form — legacy (no template), only when not yet submitted */}
          {!hasFeedback && !isDynamic && !isStructured && (
            <div className="space-y-5">
              {DEFAULT_FEEDBACK_QUESTIONS.map(q => (
                <div key={q.id}>
                  <label className={labelCls}>{q.label}{q.type === "rating" ? " *" : ""}</label>
                  {q.type === "rating" && (
                    <RatingInput value={answers[q.id] || 0} onChange={v => setAnswer(q.id, v)} />
                  )}
                  {q.type === "text" && (
                    <textarea rows={3} value={answers[q.id] || ""}
                      onChange={e => setAnswer(q.id, e.target.value)}
                      className={`${inputCls} resize-none`} />
                  )}
                  {q.type === "select" && (
                    <select value={answers[q.id] || ""} onChange={e => setAnswer(q.id, e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <div>
                <label className={labelCls}>Additional Comments</label>
                <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)}
                  placeholder="Any additional observations…" className={`${inputCls} resize-none`} />
              </div>
              <button onClick={handleLegacySubmit} disabled={saving}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {saving ? "Saving…" : "Save Evaluation"}
              </button>
            </div>
          )}

          {/* Read-only feedback display — dynamic v2 */}
          {hasFeedback && isDynamic && (
            <DynamicFeedbackDisplay template={template} feedbackData={interview.feedback} />
          )}

          {/* Read-only feedback display — structured v1 */}
          {hasFeedback && isStructured && (
            <StructuredFeedbackDisplay
              interview={interview} template={template} feedback={interview.feedback}
            />
          )}

          {/* Read-only feedback display — legacy */}
          {hasFeedback && !isDynamic && !isStructured && (
            <div className="space-y-4">
              {DEFAULT_FEEDBACK_QUESTIONS.map(q => {
                const val = interview.feedback.answers?.[q.id];
                if (!val && val !== 0) return null;
                return (
                  <div key={q.id}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{q.label}</p>
                    {q.type === "rating" ? <RatingDisplay value={val} /> : <p className="text-sm text-gray-700 mt-1">{val}</p>}
                  </div>
                );
              })}
              {interview.feedback.comments && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional Comments</p>
                  <p className="text-sm text-gray-700 mt-1">{interview.feedback.comments}</p>
                </div>
              )}
            </div>
          )}

          {/* Mark as Completed — only when scheduled */}
          {isScheduled && (
            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Mark as Completed</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {!hasFeedback && "Submit the evaluation above first."}
                    {hasFeedback && !pastTime && `Available after interview start time (${interview.scheduledTime}).`}
                    {canComplete && "Ready — interview time has passed and evaluation is submitted."}
                  </p>
                </div>
                <button
                  onClick={handleMarkCompleted}
                  disabled={!canComplete || saving}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    canComplete
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {saving ? "Saving…" : "Mark as Completed"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
