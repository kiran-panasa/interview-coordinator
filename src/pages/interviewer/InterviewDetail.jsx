import { useState, useEffect, useMemo } from "react";
import { formatDate, formatDateShort, parseInterviewStart } from "../../utils/dates";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Calendar, Video, FileText, CheckCircle2, XCircle,
  AlertTriangle, HelpCircle, ArrowUpRight, ClipboardList, Loader2,
} from "lucide-react";
import {
  subscribeToInterview, updateInterview, saveFeedbackDraft,
  saveFeedbackAutoDraft, clearFeedbackAutoDraft,
  markSlotFree, markCandidateAttendance,
  DEFAULT_FEEDBACK_QUESTIONS, getTemplate,
  getAllUsers, getCandidate,
} from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import { resolveActionAdminRecipients } from "../../utils/adminNotify";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;
import Badge from "../../components/Badge";
import CopyButton from "../../components/CopyButton";
import Toast from "../../components/Toast";
import AutosaveIndicator from "../../components/AutosaveIndicator";
import { Skeleton } from "../../components/Skeleton";
import { useAutosaveDraft } from "../../hooks/useAutosaveDraft";
import {
  RatingInput, RatingDisplay,
  StructuredFeedbackForm, StructuredFeedbackDisplay,
} from "../../components/StructuredFeedbackForm";
import DynamicFeedbackForm, { DynamicFeedbackDisplay } from "../../components/DynamicFeedbackForm";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3, ease: "easeOut" } }),
};

export default function InterviewDetail() {
  const { id } = useParams();
  const [interview, setInterview] = useState(null);
  const [template,  setTemplate]  = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [answers,        setAnswers]        = useState({});
  const [comments,       setComments]       = useState("");
  const [now,            setNow]            = useState(new Date());

  // tick every minute so the "Mark as Completed" gate re-evaluates when time passes
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Live subscription — so an admin edit (reschedule, panelist swap, new
  // Meet/assignment links, etc.) shows up here immediately instead of only
  // on the next page load. Also supersedes the old window-focus refresh
  // that only kept questionsAsked in sync; the live snapshot covers that
  // and everything else in one place now.
  useEffect(() => {
    let cancelled = false;
    let seeded = false;
    let loadedTemplateId = null;
    let loadedCandidateId = null;

    const unsubscribe = subscribeToInterview(id, iv => {
      if (cancelled) return;
      setInterview(iv);

      if (iv?.templateId && iv.templateId !== loadedTemplateId) {
        loadedTemplateId = iv.templateId;
        getTemplate(iv.templateId).then(tmpl => { if (!cancelled) setTemplate(tmpl); });
      }
      // Live candidate lookup — so a resume link (or any other candidate
      // detail) added/edited after this interview was scheduled shows up
      // here immediately, instead of the stale snapshot taken at scheduling
      // time. Falls back to that snapshot below if there's no resolvable
      // candidate (legacy/imported interviews).
      if (iv?.candidateId && iv.candidateId !== loadedCandidateId) {
        loadedCandidateId = iv.candidateId;
        getCandidate(iv.candidateId).then(c => { if (!cancelled) setCandidate(c); }).catch(() => {});
      }

      // Seed the evaluation form from the last-saved draft/feedback once, on
      // first load only — later snapshots (e.g. an admin reschedule while
      // this page is open) must never clobber what the panelist is actively
      // typing.
      if (!seeded) {
        seeded = true;
        const legacySource = iv?.feedbackDraft || iv?.feedback;
        if (legacySource) {
          setAnswers(legacySource.answers || {});
          setComments(legacySource.comments || "");
        }
      }

      setLoading(false);
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [id]);

  const setAnswer = (qid, val) => setAnswers(a => ({ ...a, [qid]: val }));

  const notifyAdminsInterviewAccepted = async (iv) => {
    try {
      const allUsers = await getAllUsers();
      const admins = resolveActionAdminRecipients(allUsers, iv.createdBy);
      if (!admins.length || !APPS_SCRIPT_URL) return;
      const round = iv.round || iv.templateName || "Interview";
      const subject = `${iv.interviewerName || "Interviewer"} accepted the interview with ${iv.candidateName}`;
      const body =
        "Hi {{name}},\n\n" +
        `${iv.interviewerName || "The interviewer"} has accepted the interview with ${iv.candidateName} — it's now confirmed on their end:\n\n` +
        `• Candidate:   ${iv.candidateName}\n` +
        `• Round:       ${round}\n` +
        `• Date:        ${formatDate(iv.scheduledDate)}\n` +
        `• Time:        ${iv.scheduledTime}\n\n` +
        `Please send the interview invitation to the candidate now, if you haven't already:\n${window.location.origin}/admin/interviews\n\n` +
        "— NxtWave Interview Coordinator";
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail", subject, body,
        recipients: admins.map(a => ({ email: a.email, name: a.displayName || "" })),
      });
    } catch (e) {
      console.error("Failed to notify admins of interview acceptance:", e);
    }
  };

  const handleAccept = async () => {
    setSaving(true);
    await updateInterview(id, { status: "scheduled" });
    setInterview(iv => ({ ...iv, status: "scheduled" }));
    setToast({ message: "Interview accepted. It's now scheduled." });
    notifyAdminsInterviewAccepted(interview);
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

  const handleCandidateJoined = async () => {
    setSaving(true);
    await markCandidateAttendance(id, true);
    setInterview(iv => ({ ...iv, candidateJoined: true }));
    setToast({ message: "Attendance marked. You can now submit feedback." });
    setSaving(false);
  };

  const handleCandidateNoShow = async () => {
    if (!confirm("Mark this candidate as a no-show?\n\nThis will set the interview status to no-show and no feedback is required.")) return;
    setSaving(true);
    await markCandidateAttendance(id, false);
    setInterview(iv => ({ ...iv, candidateJoined: false, status: "no_show" }));
    setToast({ message: "Marked as no-show." });
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
      await clearFeedbackAutoDraft(id).catch(() => {});
      const saved = { ...feedbackData, submittedAt: new Date().toISOString() };
      setInterview(iv => ({ ...iv, feedback: saved, feedbackDraft: null }));
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

  // Legacy form (no template) autosave — Dynamic/Structured forms manage their own.
  const legacyAutosaveEnabled = !!interview?.id && !template && !loading && !interview?.feedback?.submittedAt;
  const legacyDraftData = useMemo(() => ({ answers, comments }), [answers, comments]);
  const { status: legacyDraftStatus, lastSavedAt: legacyDraftSavedAt } = useAutosaveDraft(
    legacyDraftData,
    (data) => saveFeedbackAutoDraft(interview.id, data),
    { enabled: legacyAutosaveEnabled }
  );

  if (loading) return (
    <div className="p-8 max-w-3xl">
      <Skeleton className="h-4 w-40 mb-6" />
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (!interview) return (
    <div className="p-8 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-10 text-center">
        <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Interview not found.</p>
      </div>
    </div>
  );

  const isPending    = interview.status === "pending_acceptance";
  const isScheduled  = interview.status === "scheduled";
  const isCompleted  = interview.status === "completed";
  const hasFeedback  = !!interview.feedback?.submittedAt;
  const isDynamic    = !!(template?.domains);
  const isStructured = !!template && !isDynamic;

  const interviewStart    = parseInterviewStart(interview.scheduledDate, interview.scheduledTime);
  const pastTime          = !!interviewStart && now.getTime() >= interviewStart.getTime();
  const attended          = interview.candidateJoined ?? null; // null | true | false
  const showAttendanceGate = isScheduled && pastTime && attended === null;
  const isNoShow          = attended === false;
  const showEvaluation    = isCompleted || (isScheduled && !showAttendanceGate && !isNoShow);
  const canComplete       = hasFeedback && pastTime && attended === true;

  const totalQuestions = template?.questionIds?.length || 0;
  const askedCount      = interview.questionsAsked?.length || 0;

  // Live candidate value wins when available — see the candidateId fetch
  // above. Falls back to the interview's own snapshot for legacy/imported
  // interviews with no resolvable candidate record.
  const resumeLink = candidate?.resumeLink || interview.resumeLink || "";
  const assignmentLinks = interview.assignmentLinks || [];

  const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors bg-white";
  const labelCls = "block text-sm font-semibold text-gray-700 mb-2";

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/interviewer/interviews"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-emerald-600 transition-colors mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to My Interviews
      </Link>

      {/* Header */}
      <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}
        className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{interview.candidateName}</h1>
          <p className="text-sm text-gray-500 mt-1">{interview.roleAppliedFor}</p>
          {template && (
            <span className="inline-block mt-2 text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
              {template.name}
            </span>
          )}
        </div>
        <Badge value={interview.status} />
      </motion.div>

      {/* Details card */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-400" /> Interview Details
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Date</p>
            <p className="text-sm font-semibold text-gray-800">{formatDate(interview.scheduledDate)}</p>
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
              <div className="inline-flex items-center gap-1">
                <a href={interview.meetLink} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:underline break-all">
                  <Video className="w-3.5 h-3.5 flex-shrink-0" /> {interview.meetLink} <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                </a>
                <CopyButton value={interview.meetLink} />
              </div>
            </div>
          )}
          {resumeLink && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">Resume</p>
              <a href={resumeLink} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:underline">
                <FileText className="w-3.5 h-3.5 flex-shrink-0" /> View Resume <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}
          {assignmentLinks.map((url, i) => (
            <div className="col-span-2" key={i}>
              <p className="text-xs text-gray-400 mb-0.5">Assignment {i + 1}</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:underline break-all">
                <FileText className="w-3.5 h-3.5 flex-shrink-0" /> {url} <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Accept / Decline */}
      {isPending && (
        <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">Awaiting your response</p>
          <p className="text-xs text-amber-600 mb-4">
            {formatDate(interview.scheduledDate)} at {interview.scheduledTime} · {interview.round}
          </p>
          <div className="flex gap-3">
            <button onClick={handleAccept} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-soft hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Accept
            </button>
            <button onClick={handleDecline} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-white border border-red-300 text-red-600 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors">
              <XCircle className="w-4 h-4" /> Decline
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Attendance gate — appears once interview time has passed ── */}
      {showAttendanceGate && (
        <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
          <p className="text-sm font-bold text-amber-800 mb-1">Did the candidate join?</p>
          <p className="text-xs text-amber-600 mb-4">
            Scheduled for {interview.scheduledTime} · {formatDate(interview.scheduledDate)}
          </p>
          <div className="flex gap-3">
            <button onClick={handleCandidateJoined} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-soft hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Candidate Joined
            </button>
            <button onClick={handleCandidateNoShow} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-white border border-red-300 text-red-600 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors">
              <XCircle className="w-4 h-4" /> Candidate Didn't Join
            </button>
          </div>
        </motion.div>
      )}

      {/* ── No-show confirmation ── */}
      {isNoShow && (
        <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}
          className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-5 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Candidate did not join</p>
            <p className="text-xs text-red-400 mt-0.5">Marked as no-show. No feedback required.</p>
          </div>
        </motion.div>
      )}

      {/* ── Questions Asked — opens in a separate tab so the evaluation form isn't lost ── */}
      {showEvaluation && totalQuestions > 0 && (
        <motion.div initial="hidden" animate="visible" custom={3} variants={fadeUp}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-400" /> Questions Asked
            </h2>
            <p className="text-xs text-gray-400 mt-1">{askedCount} / {totalQuestions} marked</p>
          </div>
          <Link
            to={`/interviewer/interviews/${id}/questions`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-soft hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            View/Select Questions to be Asked
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}

      {/* ── Evaluation section (scheduled or completed) ── */}
      {showEvaluation && (
        <motion.div initial="hidden" animate="visible" custom={4} variants={fadeUp}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gray-400" /> Evaluation
            </h2>
            {hasFeedback && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Submitted {formatDateShort(interview.feedback.submittedAt)}
              </span>
            )}
          </div>

          {/* Feedback form — dynamic v2, editable while scheduled */}
          {isScheduled && isDynamic && (
            <DynamicFeedbackForm
              template={template}
              interview={interview}
              onSubmit={handleSaveFeedback}
              saving={saving}
            />
          )}

          {/* Feedback form — structured v1, editable while scheduled */}
          {isScheduled && isStructured && (
            <StructuredFeedbackForm
              interview={interview} template={template}
              onSubmit={handleSaveFeedback} saving={saving}
            />
          )}

          {/* Feedback form — legacy (no template), editable while scheduled */}
          {isScheduled && !isDynamic && !isStructured && (
            <div className="space-y-5">
              {DEFAULT_FEEDBACK_QUESTIONS.map(q => (
                <div key={q.id}>
                  <label className={labelCls}>{q.label}{q.type === "rating" && <span className="text-red-500"> *</span>}</label>
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
              {legacyAutosaveEnabled && (
                <div className="flex justify-end">
                  <AutosaveIndicator status={legacyDraftStatus} lastSavedAt={legacyDraftSavedAt} />
                </div>
              )}
              <button onClick={handleLegacySubmit} disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold shadow-soft hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving…" : hasFeedback ? "Update Evaluation" : "Save Evaluation"}
              </button>
            </div>
          )}

          {/* Read-only feedback display — dynamic v2, only after completed */}
          {isCompleted && hasFeedback && isDynamic && (
            <DynamicFeedbackDisplay template={template} feedbackData={interview.feedback} />
          )}

          {/* Read-only feedback display — structured v1, only after completed */}
          {isCompleted && hasFeedback && isStructured && (
            <StructuredFeedbackDisplay
              interview={interview} template={template} feedback={interview.feedback}
            />
          )}

          {/* Read-only feedback display — legacy, only after completed */}
          {isCompleted && hasFeedback && !isDynamic && !isStructured && (
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
              <div className="flex items-center justify-between gap-4">
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
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                    canComplete
                      ? "bg-emerald-600 text-white shadow-soft hover:bg-emerald-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving…" : "Mark as Completed"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
