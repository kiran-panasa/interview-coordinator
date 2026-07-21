import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  CODING_PS_LABELS, CODING_CI_LABELS, THEORY_LABELS,
  PROJECT_LABELS, RESUME_LABELS,
  saveFeedbackAutoDraft,
} from "../api/firestore";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import AutosaveIndicator from "./AutosaveIndicator";
import Button from "./Button";

// ── Collapsible section wrapper ───────────────────────────────────────────────

function Section({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
          {badge && (
            <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Collapsible problem block within the coding section ───────────────────────

function ProblemBlock({ index, children, complete }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-600 uppercase">Problem {index + 1}</span>
          {complete && <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Shared rating primitives ──────────────────────────────────────────────────

export function RatingInput({ value, onChange, max = 5 }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
            value === n
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-gray-500 border-gray-200 hover:border-brand-400 hover:text-brand-700"
          }`}>{n}</button>
      ))}
    </div>
  );
}

export function RatingDisplay({ value, labels }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="w-7 h-7 rounded bg-brand-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
        {value}
      </span>
      {labels?.[value] && (
        <p className="text-xs text-gray-700">{labels[value]}</p>
      )}
    </div>
  );
}

function DescriptiveRating({ value, onChange, labels }) {
  const options = Object.entries(labels).map(([k, v]) => ({ n: Number(k), label: v })).sort((a, b) => b.n - a.n);
  return (
    <div className="space-y-1.5">
      {options.map(({ n, label }) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
            value === n
              ? "bg-brand-50 border-brand-400 ring-1 ring-brand-400"
              : "bg-white border-gray-200 hover:border-brand-300 hover:bg-gray-50"
          }`}>
          <span className={`mt-0.5 w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center flex-shrink-0 ${
            value === n ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"
          }`}>{n}</span>
          <span className={`text-xs leading-relaxed ${value === n ? "text-brand-800 font-medium" : "text-gray-600"}`}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

function initFeedback(numProblems, existing) {
  return {
    coding: Array.from({ length: numProblems }, (_, i) => ({
      problemSolvingRating:      existing?.coding?.[i]?.problemSolvingRating      || 0,
      problemSolvingRemarks:     existing?.coding?.[i]?.problemSolvingRemarks     || "",
      codeImplementationRating:  existing?.coding?.[i]?.codeImplementationRating  || 0,
      codeImplementationRemarks: existing?.coding?.[i]?.codeImplementationRemarks || "",
    })),
    theory:  { rating: existing?.theory?.rating  || 0, remarks: existing?.theory?.remarks || "" },
    project: {
      explanation:   existing?.project?.explanation   || "",
      type:          existing?.project?.type          || "",
      buildApproach: existing?.project?.buildApproach || "",
      rating:        existing?.project?.rating        || 0,
      link:          existing?.project?.link          || "",
      remarks:       existing?.project?.remarks       || "",
    },
    resume: {
      rating:   existing?.resume?.rating   || 0,
      link:     existing?.resume?.link     || "",
      feedback: existing?.resume?.feedback || "",
    },
    interviewerFeedback: existing?.interviewerFeedback || "",
  };
}

// ── Read-only submitted view ──────────────────────────────────────────────────

export function StructuredFeedbackDisplay({ interview, template, feedback }) {
  return (
    <div className="space-y-3">
      {/* Coding */}
      <Section title="Coding" badge={feedback.codingAvgRating ? `Avg ${feedback.codingAvgRating} / 5` : null}>
        {feedback.coding?.map((p, i) => (
          <div key={i} className="border border-gray-100 rounded-lg px-4 py-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase">Problem {i + 1}</p>
            {interview?.codingProblems?.[i] && (
              <p className="text-xs bg-gray-50 rounded px-3 py-2 text-gray-600">{interview.codingProblems[i]}</p>
            )}
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-400 mb-1">Problem Solving</p>
                <RatingDisplay value={p.problemSolvingRating} labels={CODING_PS_LABELS} />
                {p.problemSolvingRemarks && <p className="text-xs text-gray-500 mt-1 pl-9">{p.problemSolvingRemarks}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Code Implementation</p>
                <RatingDisplay value={p.codeImplementationRating} labels={CODING_CI_LABELS} />
                {p.codeImplementationRemarks && <p className="text-xs text-gray-500 mt-1 pl-9">{p.codeImplementationRemarks}</p>}
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* Theory */}
      {template.hasTheory && feedback.theory && (
        <Section title="Theory">
          {interview?.theorySubject && <p className="text-xs text-gray-500">Subject: {interview.theorySubject}</p>}
          <div>
            <p className="text-xs text-gray-400 mb-1">Rating</p>
            <RatingDisplay value={feedback.theory.rating} labels={THEORY_LABELS} />
          </div>
          {feedback.theory.remarks && (
            <div><p className="text-xs text-gray-400">Remarks</p><p className="text-sm text-gray-700">{feedback.theory.remarks}</p></div>
          )}
        </Section>
      )}

      {/* Project */}
      {template.hasProject && feedback.project && (
        <Section title="Project">
          {[
            { label: "Explanation",    val: feedback.project.explanation },
            { label: "Type",           val: feedback.project.type },
            { label: "Build Approach", val: feedback.project.buildApproach },
            { label: "Remarks",        val: feedback.project.remarks },
          ].map(({ label, val }) => val ? (
            <div key={label}><p className="text-xs text-gray-400">{label}</p><p className="text-sm text-gray-700">{val}</p></div>
          ) : null)}
          {feedback.project.rating > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Rating</p>
              <RatingDisplay value={feedback.project.rating} labels={PROJECT_LABELS} />
            </div>
          )}
          {feedback.project.link && (
            <div>
              <p className="text-xs text-gray-400">Project Link</p>
              <a href={feedback.project.link} target="_blank" rel="noreferrer"
                className="text-sm text-brand-600 hover:underline break-all">{feedback.project.link} ↗</a>
            </div>
          )}
        </Section>
      )}

      {/* Resume */}
      {template.hasResume && feedback.resume && (
        <Section title="Resume">
          {feedback.resume.rating > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Rating</p>
              <RatingDisplay value={feedback.resume.rating} labels={RESUME_LABELS} />
            </div>
          )}
          {feedback.resume.feedback && (
            <div><p className="text-xs text-gray-400">Feedback</p><p className="text-sm text-gray-700">{feedback.resume.feedback}</p></div>
          )}
          {feedback.resume.link && (
            <div>
              <p className="text-xs text-gray-400">Resume Link</p>
              <a href={feedback.resume.link} target="_blank" rel="noreferrer"
                className="text-sm text-brand-600 hover:underline break-all">{feedback.resume.link} ↗</a>
            </div>
          )}
        </Section>
      )}

      {/* Overall Feedback */}
      {feedback.interviewerFeedback && (
        <Section title="Overall Feedback">
          <p className="text-sm text-gray-700">{feedback.interviewerFeedback}</p>
        </Section>
      )}
    </div>
  );
}

// ── Editable form (used by interviewer + preview) ─────────────────────────────

export function StructuredFeedbackForm({ interview, template, onSubmit, saving, previewMode = false }) {
  const numProblems = template.codingProblems || 2;
  const [fb, setFb] = useState(() => initFeedback(numProblems, interview?.feedbackDraft || null));

  const autosaveEnabled = !previewMode && !!interview?.id && !interview?.feedback?.submittedAt;
  const { status: draftStatus, lastSavedAt: draftSavedAt } = useAutosaveDraft(
    fb,
    (data) => saveFeedbackAutoDraft(interview.id, data),
    { enabled: autosaveEnabled }
  );

  const setCodingField = (i, key, val) =>
    setFb(f => ({ ...f, coding: f.coding.map((p, idx) => idx === i ? { ...p, [key]: val } : p) }));
  const setTheory  = (key, val) => setFb(f => ({ ...f, theory:  { ...f.theory,  [key]: val } }));
  const setProject = (key, val) => setFb(f => ({ ...f, project: { ...f.project, [key]: val } }));
  const setResume  = (key, val) => setFb(f => ({ ...f, resume:  { ...f.resume,  [key]: val } }));

  const avgCoding = (() => {
    const ratings = fb.coding.flatMap(p => [p.problemSolvingRating, p.codeImplementationRating]).filter(Boolean);
    return ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
  })();

  const isProblemComplete = (p) => p.problemSolvingRating > 0 && p.codeImplementationRating > 0;

  const handleSubmit = () => {
    if (previewMode) return;
    const errors = [];
    fb.coding.forEach((p, i) => {
      if (!p.problemSolvingRating)     errors.push(`Problem ${i + 1}: Problem Solving rating`);
      if (!p.codeImplementationRating) errors.push(`Problem ${i + 1}: Code Implementation rating`);
    });
    if (template.hasTheory  && !fb.theory.rating)  errors.push("Theory rating");
    if (template.hasProject && !fb.project.rating) errors.push("Project rating");
    if (template.hasResume  && !fb.resume.rating)  errors.push("Resume rating");
    if (errors.length) return onSubmit(null, `Please fill in: ${errors.join(", ")}`);
    onSubmit({ ...fb, type: "structured", codingAvgRating: avgCoding });
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
  const labelCls = "block text-sm font-semibold text-gray-700 mb-2";

  return (
    <div className="space-y-3">
      {/* ── Coding ── */}
      <Section title="Coding" badge={avgCoding ? `Avg ${avgCoding} / 5` : null} defaultOpen={!previewMode}>
        <div className="space-y-3">
          {fb.coding.map((problem, i) => (
            <ProblemBlock key={i} index={i} complete={isProblemComplete(problem)}>
              {interview?.codingProblems?.[i] && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400 mb-0.5">Question</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{interview.codingProblems[i]}</p>
                </div>
              )}
              <div>
                <label className={labelCls}>Problem Solving <span className="text-red-500">*</span></label>
                <DescriptiveRating value={problem.problemSolvingRating}
                  onChange={v => setCodingField(i, "problemSolvingRating", v)} labels={CODING_PS_LABELS} />
              </div>
              <div>
                <label className={labelCls}>Problem Solving Remarks</label>
                <textarea rows={2} className={`${inputCls} resize-none`}
                  placeholder="Observations on approach, hints given…"
                  value={problem.problemSolvingRemarks}
                  onChange={e => setCodingField(i, "problemSolvingRemarks", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Code Implementation <span className="text-red-500">*</span></label>
                <DescriptiveRating value={problem.codeImplementationRating}
                  onChange={v => setCodingField(i, "codeImplementationRating", v)} labels={CODING_CI_LABELS} />
              </div>
              <div>
                <label className={labelCls}>Code Implementation Remarks</label>
                <textarea rows={2} className={`${inputCls} resize-none`}
                  placeholder="Code quality, syntax issues, edge cases…"
                  value={problem.codeImplementationRemarks}
                  onChange={e => setCodingField(i, "codeImplementationRemarks", e.target.value)} />
              </div>
            </ProblemBlock>
          ))}
        </div>
      </Section>

      {/* ── Theory ── */}
      {template.hasTheory && (
        <Section title="Theory" defaultOpen={!previewMode}>
          {interview?.theorySubject && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">Subject</p>
              <p className="text-sm text-gray-700">{interview.theorySubject}</p>
            </div>
          )}
          <div>
            <label className={labelCls}>Rating <span className="text-red-500">*</span></label>
            <DescriptiveRating value={fb.theory.rating} onChange={v => setTheory("rating", v)} labels={THEORY_LABELS} />
          </div>
          <div>
            <label className={labelCls}>Remarks</label>
            <textarea rows={3} className={`${inputCls} resize-none`}
              placeholder="Which topics were asked? How did the candidate perform?"
              value={fb.theory.remarks} onChange={e => setTheory("remarks", e.target.value)} />
          </div>
        </Section>
      )}

      {/* ── Project ── */}
      {template.hasProject && (
        <Section title="Project" defaultOpen={!previewMode}>
          <div>
            <label className={labelCls}>Project Explanation</label>
            <textarea rows={3} className={`${inputCls} resize-none`}
              placeholder="What project did the candidate explain?"
              value={fb.project.explanation} onChange={e => setProject("explanation", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Project Type</label>
              <select value={fb.project.type} onChange={e => setProject("type", e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {["Web Application", "Mobile App", "Data Science / ML", "API / Backend", "Other"].map(o =>
                  <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Build Approach</label>
              <select value={fb.project.buildApproach} onChange={e => setProject("buildApproach", e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {["Individual Project", "Team Project", "Open Source Contribution", "Guided / Tutorial"].map(o =>
                  <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Project Rating <span className="text-red-500">*</span></label>
            <DescriptiveRating value={fb.project.rating} onChange={v => setProject("rating", v)} labels={PROJECT_LABELS} />
          </div>
          <div>
            <label className={labelCls}>Project Link</label>
            <input type="url" className={inputCls} placeholder="https://github.com/…"
              value={fb.project.link} onChange={e => setProject("link", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Remarks</label>
            <textarea rows={2} className={`${inputCls} resize-none`}
              placeholder="Candidate's involvement, key challenges discussed…"
              value={fb.project.remarks} onChange={e => setProject("remarks", e.target.value)} />
          </div>
        </Section>
      )}

      {/* ── Resume ── */}
      {template.hasResume && (
        <Section title="Resume" defaultOpen={!previewMode}>
          <div>
            <label className={labelCls}>Resume Rating <span className="text-red-500">*</span></label>
            <DescriptiveRating value={fb.resume.rating} onChange={v => setResume("rating", v)} labels={RESUME_LABELS} />
          </div>
          <div>
            <label className={labelCls}>Resume Link</label>
            <input type="url" className={inputCls} placeholder="https://drive.google.com/…"
              value={fb.resume.link} onChange={e => setResume("link", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Resume Feedback</label>
            <textarea rows={2} className={`${inputCls} resize-none`}
              placeholder="Observations on resume quality, gaps, highlights…"
              value={fb.resume.feedback} onChange={e => setResume("feedback", e.target.value)} />
          </div>
        </Section>
      )}

      {/* ── Overall Feedback ── */}
      <Section title="Overall Feedback" defaultOpen={!previewMode}>
        <textarea rows={4} className={`${inputCls} resize-none`}
          placeholder="Summary of the candidate's overall performance…"
          value={fb.interviewerFeedback}
          onChange={e => setFb(f => ({ ...f, interviewerFeedback: e.target.value }))} />
      </Section>

      {autosaveEnabled && (
        <div className="flex justify-end">
          <AutosaveIndicator status={draftStatus} lastSavedAt={draftSavedAt} />
        </div>
      )}

      <Button variant="primary" onClick={handleSubmit} disabled={saving || previewMode}
        className={`w-full ${previewMode ? "!bg-gray-100 !text-gray-400 cursor-default border border-dashed border-gray-300 shadow-none" : ""}`}>
        {previewMode ? "Submit Feedback (Preview Only — not functional)" : saving ? "Submitting…" : "Submit Feedback"}
      </Button>
    </div>
  );
}
