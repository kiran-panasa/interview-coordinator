import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import Modal from "../../components/Modal";
import { getInterviewIntegrity } from "../../api/interviewIntegrity";

// Same 3-option scale every Interview Integrity checklist field uses
// (INTEGRITY_OPTIONS in utils/templateEngine.js) — scores are fixed
// (5/3/1), independent of whatever admins have renamed the field labels
// to, so this is safe to keep in sync with that convention rather than
// re-deriving it from the live settings doc.
const SCORE_STYLE = {
  5: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  3: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  1: { cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function IntegrityDetailModal({ interview, onClose }) {
  const [domainFields, setDomainFields] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!interview) { setDomainFields(null); return; }
    setLoading(true);
    getInterviewIntegrity()
      .then(s => setDomainFields(s.domainFields || []))
      .catch(() => setDomainFields([]))
      .finally(() => setLoading(false));
  }, [interview]);

  const answers = interview?.integrityAnswers || {};
  const scoredFields = (domainFields || []).filter(f => f.type === "scored_dropdown");
  const remarksField = (domainFields || []).find(f => f.type === "text");

  return (
    <Modal open={!!interview} onClose={onClose}
      title={interview ? `Interview Integrity — ${interview.round || interview.templateName || "Interview"}` : ""}>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {interview?.integrityScore != null && (
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-5 text-white shadow-popover">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold opacity-90">Candidate Integrity Rating</div>
                    <div className="text-xs opacity-60 mt-0.5">Weighted checklist rating, out of 5</div>
                  </div>
                </div>
                <div className="text-4xl font-bold">{Number(interview.integrityScore).toFixed(1)}</div>
              </div>
            </div>
          )}

          {scoredFields.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No detailed checklist is available for this interview.</p>
          ) : (
            <div className="space-y-2">
              {scoredFields.map(f => {
                const score = answers[f.id];
                const option = (f.options || []).find(o => String(o.score) === String(score));
                return (
                  <div key={f.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-700">{f.label}</p>
                    {option ? (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${SCORE_STYLE[option.score]?.cls || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {option.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 flex-shrink-0">Not recorded</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {remarksField && answers[remarksField.id] && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{remarksField.label}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{answers[remarksField.id]}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
