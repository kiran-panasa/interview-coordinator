import Modal from "../../components/Modal";
import { formatDate, formatDateTime } from "../../utils/dates";

const DECISION_META = {
  retake_tests:      { label: "Needs Improvement — Retake Tests",  cls: "bg-red-50 text-red-700 border-red-200" },
  retake_interview:  { label: "Average — Retake Interview",         cls: "bg-amber-50 text-amber-700 border-amber-200" },
  move_forward:      { label: "Good — Move Forward",                cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
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

export default function AiReportModal({ interview, loading, onClose, onRegenerate }) {
  const report = interview?.aiReport;
  const decisionMeta = report ? (DECISION_META[report.decision] || { label: report.decisionLabel, cls: "bg-gray-50 text-gray-700 border-gray-200" }) : null;

  return (
    <Modal open={!!interview} onClose={onClose}
      title={interview ? `AI Candidate Report — ${interview.candidateName}` : ""} wide>
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm text-gray-500">Analyzing the interview transcript…</p>
          <p className="text-xs text-gray-400">This can take up to a minute.</p>
        </div>
      )}

      {!loading && report && (
        <div className="space-y-5">
          {/* Header strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-900">{interview.candidateName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{interview.round || interview.templateName || "Interview"}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Interview Date: <span className="font-semibold text-gray-700">{formatDate(interview.scheduledDate)}</span></span>
              <span>Report Generated: <span className="font-semibold text-gray-700">{formatDateTime(report.generatedAt)}</span></span>
            </div>
          </div>

          {/* Decision banner */}
          <div className={`text-center py-3 rounded-full border text-sm font-bold uppercase tracking-wide ${decisionMeta.cls}`}>
            Decision: {decisionMeta.label}
          </div>

          {/* Summary */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Interview Summary</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.summary}</p>
          </div>

          {/* Competency Assessment */}
          {report.competencies?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Competency Assessment</h3>
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
                      <tr key={i}>
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
              <h3 className="text-sm font-bold text-gray-900 mb-2">Reasons for the Decision</h3>
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
              <h3 className="text-sm font-bold text-gray-900 mb-2">Positive Observations</h3>
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
              <h3 className="text-sm font-bold text-gray-900 mb-2">Recommendation</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.recommendation}</p>
            </div>
          )}

          {/* Next Steps */}
          {report.nextSteps?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Next Steps</h3>
              <div className="space-y-2">
                {report.nextSteps.map((step, i) => (
                  <div key={i} className="flex gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
                    <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
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
              className="text-xs text-gray-400 hover:text-gray-600 underline">
              Regenerate report
            </button>
            <button onClick={onClose}
              className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2 text-sm font-semibold hover:bg-gray-200">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
