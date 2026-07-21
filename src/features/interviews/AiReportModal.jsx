import { motion } from "framer-motion";
import {
  Loader2, Sparkles, FileText, ListChecks, ListOrdered, ThumbsUp,
  MessageSquare, ArrowRight, RefreshCw, Clock3, SearchX,
  CheckCircle2, AlertTriangle, XCircle, CalendarClock,
} from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { formatDate, formatDateTime } from "../../utils/dates";

const DECISION_META = {
  retake_tests:      { label: "Needs Improvement — Retake Tests",  cls: "bg-red-50 text-red-700 border-red-200",         icon: XCircle },
  retake_interview:  { label: "Average — Retake Interview",         cls: "bg-amber-50 text-amber-700 border-amber-200",   icon: AlertTriangle },
  move_forward:      { label: "Good — Move Forward",                cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

const ASSESSMENT_CLS = {
  "Needs Improvement": "text-red-600",
  "Average":            "text-amber-600",
  "Good":                "text-emerald-600",
  "Excellent":           "text-emerald-700",
};

function assessmentColor(label) {
  return ASSESSMENT_CLS[label] || "text-gray-700";
}

const STATUS_COPY = {
  processing: {
    icon: Clock3,
    title: "Recording is still being processed",
    body: "Transcript generation is pending because the recording isn't available yet. The AI report will be generated automatically once the transcript is ready — check back in a few minutes.",
  },
  not_found: {
    icon: SearchX,
    title: "Recording not found yet",
    body: "We couldn't find a Meet recording/transcript for this interview yet. This can happen right after a call ends — try again shortly.",
  },
};

const SectionHeader = ({ icon: Icon, children }) => (
  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
    <Icon className="w-4 h-4 text-gray-400" /> {children}
  </h3>
);

export default function AiReportModal({ interview, loading, status, onClose, onRegenerate, onRetry }) {
  const report = interview?.aiReport;
  const decisionMeta = report ? (DECISION_META[report.decision] || { label: report.decisionLabel, cls: "bg-gray-50 text-gray-700 border-gray-200", icon: Sparkles }) : null;
  const DecisionIcon = decisionMeta?.icon;

  return (
    <Modal open={!!interview} onClose={onClose}
      title={interview ? `AI Candidate Report — ${interview.candidateName}` : ""} wide>
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-brand-500 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Analyzing the interview transcript…</p>
          <p className="text-xs text-gray-400">This can take up to a minute.</p>
        </div>
      )}

      {!loading && !report && status && (() => {
        const StatusIcon = STATUS_COPY[status.status]?.icon || Clock3;
        return (
          <div className="flex flex-col items-center text-center py-14 gap-3 px-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
              <StatusIcon className="w-7 h-7 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-gray-900">{STATUS_COPY[status.status]?.title || "Not ready yet"}</p>
            <p className="text-xs text-gray-500 max-w-sm">{status.message || STATUS_COPY[status.status]?.body}</p>
            <Button variant="primary" icon={RefreshCw} onClick={onRetry} className="mt-2">
              Check Again
            </Button>
          </div>
        );
      })()}

      {!loading && report && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          {/* Header strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{interview.candidateName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{interview.round || interview.templateName || "Interview"}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                Interview Date: <span className="font-semibold text-gray-700">{formatDate(interview.scheduledDate)}</span>
              </span>
              <span>Report Generated: <span className="font-semibold text-gray-700">{formatDateTime(report.generatedAt)}</span></span>
            </div>
          </div>

          {/* Decision banner */}
          <div className={`flex items-center justify-center gap-2 text-center py-3 rounded-full border text-sm font-bold uppercase tracking-wide ${decisionMeta.cls}`}>
            {DecisionIcon && <DecisionIcon className="w-4 h-4" />}
            Decision: {decisionMeta.label}
          </div>

          {/* Summary */}
          <div>
            <SectionHeader icon={FileText}>Interview Summary</SectionHeader>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.summary}</p>
          </div>

          {/* Competency Assessment */}
          {report.competencies?.length > 0 && (
            <div>
              <SectionHeader icon={ListChecks}>Competency Assessment</SectionHeader>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 w-1/5">Competency</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 w-1/6">Assessment</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.competencies.map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900 align-top">{c.name}</td>
                        <td className={`px-4 py-3 font-semibold align-top ${assessmentColor(c.assessment)}`}>{c.assessment}</td>
                        <td className="px-4 py-3 text-gray-600 align-top">{c.observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reasons for the Decision */}
          {report.reasons?.length > 0 && (
            <div>
              <SectionHeader icon={ListOrdered}>Reasons for the Decision</SectionHeader>
              <ol className="list-decimal list-inside space-y-1">
                {report.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-gray-700">{r}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Positive Observations */}
          {report.positiveObservations?.length > 0 && (
            <div>
              <SectionHeader icon={ThumbsUp}>Positive Observations</SectionHeader>
              <ul className="space-y-1.5">
                {report.positiveObservations.map((p, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          {report.recommendation && (
            <div>
              <SectionHeader icon={MessageSquare}>Recommendation</SectionHeader>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.recommendation}</p>
            </div>
          )}

          {/* Next Steps */}
          {report.nextSteps?.length > 0 && (
            <div>
              <SectionHeader icon={ArrowRight}>Next Steps</SectionHeader>
              <div className="space-y-2">
                {report.nextSteps.map((step, i) => (
                  <div key={i} className="flex gap-3 bg-brand-50/60 border border-brand-100 rounded-xl px-4 py-3">
                    <div className="w-6 h-6 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <button onClick={onRegenerate}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw className="w-3 h-3" /> Regenerate report
            </button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      )}
    </Modal>
  );
}
