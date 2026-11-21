import { Loader2, AlertTriangle, CheckCircle2, PauseCircle, ListChecks, MessageSquare, Search, Sparkles } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import CopyButton from "../../components/CopyButton";

// Audits the PANELIST'S CONDUCT of an interview — see
// api/_lib/panelistAuditRubrics.js for the source rubric. Two distinct
// views, controlled by `audience`:
// - "admin": the full internal audit (verdict, critical findings with
//   quotes/timestamps, remarks table, wrong answers passed) plus the
//   drafted message, for review/coaching decisions.
// - "panelist": ONLY the drafted final message, framed as feedback on
//   their own interview — not the raw quote-by-quote critical findings
//   table or the formal verdict label (e.g. "pause solo"), matching the
//   source spec's own distinction between an internal audit and the
//   "ready-to-send message for the panelist".
const VERDICT_META = {
  good_to_continue:      { label: "Good to Continue",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  continue_after_feedback: { label: "Continue After Feedback", cls: "bg-amber-50 text-amber-700 border-amber-200",     icon: AlertTriangle },
  not_yet_pause_solo:    { label: "Not Yet — Pause Solo",    cls: "bg-red-50 text-red-700 border-red-200",           icon: PauseCircle },
};

const SEVERITY_CLS = {
  good:     "text-emerald-600",
  fix:      "text-amber-600",
  critical: "text-red-600",
};

const SectionHeader = ({ icon: Icon, children }) => (
  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
    <Icon className="w-4 h-4 text-gray-400" /> {children}
  </h3>
);

export default function PanelistAuditModal({ interview, loading, onClose, onGenerate, audience = "admin" }) {
  const audit = interview?.panelistAudit;
  const verdictMeta = audit ? (VERDICT_META[audit.verdict] || { label: audit.verdict, cls: "bg-gray-50 text-gray-700 border-gray-200", icon: Sparkles }) : null;
  const VerdictIcon = verdictMeta?.icon;

  return (
    <Modal open={!!interview} onClose={onClose}
      title={interview ? (audience === "panelist" ? `Feedback — ${interview.round || interview.templateName || "Interview"}` : `Panelist Audit — ${interview.interviewerName || "Interviewer"}`) : ""}
      wide>
      {!interview ? null : loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
          <p className="text-sm text-gray-400">Generating…</p>
        </div>
      ) : !audit ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <ListChecks className="w-8 h-8 text-gray-200" />
          {audience === "panelist" ? (
            <p className="text-sm text-gray-400 max-w-sm">
              Feedback for this interview isn't ready yet — check back shortly.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-400 max-w-sm">
                Not generated yet. This normally happens automatically once the transcript is ready — use this only if it's been a while or you want to regenerate it.
              </p>
              {onGenerate && (
                <Button onClick={onGenerate} icon={Sparkles}>Generate Now</Button>
              )}
            </>
          )}
        </div>
      ) : audience === "panelist" ? (
        <div className="space-y-4">
          <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
            {audit.finalMessage}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border ${verdictMeta.cls}`}>
              <VerdictIcon className="w-4 h-4" /> {verdictMeta.label}
            </span>
            <p className="text-xs text-gray-400">{audit.verdictReason}</p>
          </div>
          <p className="text-[11px] text-gray-400">
            Rubric: {audit.rubricLabel} · Generated {new Date(audit.generatedAt).toLocaleString()}
          </p>

          {audit.criticalFindings.length > 0 && (
            <div>
              <SectionHeader icon={AlertTriangle}>Critical Findings</SectionHeader>
              <ul className="space-y-2">
                {audit.criticalFindings.map((f, i) => (
                  <li key={i} className="text-sm bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-red-700 font-medium">{f.issue}</p>
                    <p className="text-xs text-red-500 mt-1">"{f.quote}" ({f.timestamp})</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {audit.checkRecordingItems.length > 0 && (
            <div>
              <SectionHeader icon={Search}>Check on Recording</SectionHeader>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {audit.checkRecordingItems.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {audit.remarks.length > 0 && (
            <div>
              <SectionHeader icon={ListChecks}>Remarks</SectionHeader>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Area", "What Happened", "Remark"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {audit.remarks.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap align-top">{r.area}</td>
                        <td className="px-3 py-2 text-gray-600 align-top">{r.whatHappened}</td>
                        <td className={`px-3 py-2 align-top font-medium ${SEVERITY_CLS[r.severity] || "text-gray-600"}`}>{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {audit.wrongAnswersPassed.length > 0 && (
            <div>
              <SectionHeader icon={AlertTriangle}>Wrong Answers That Passed</SectionHeader>
              <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                {audit.wrongAnswersPassed.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionHeader icon={MessageSquare}>Final Message to Panelist</SectionHeader>
              <CopyButton value={audit.finalMessage} />
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
              {audit.finalMessage}
            </div>
          </div>

          {onGenerate && (
            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <Button variant="secondary" onClick={onGenerate} icon={Sparkles}>Regenerate</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
