import { User, CalendarDays, Layers, Clock3, MessageSquare, Award } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { formatDate, formatDateTime } from "../../utils/dates";
import { DynamicFeedbackDisplay } from "../../components/DynamicFeedbackForm";

export default function FeedbackViewModal({ feedbackModal, onClose }) {
  return (
    <Modal open={!!feedbackModal} onClose={onClose}
      title={feedbackModal ? `Feedback — ${feedbackModal.interview.candidateName}` : ""} wide>
      {feedbackModal && (() => {
        const fb   = feedbackModal.interview.feedback;
        const tmpl = feedbackModal.template;
        const isDynamic = fb && (fb.domains || fb.sections);
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 pb-3 border-b border-gray-100">
              <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-gray-400" /><span className="font-semibold text-gray-700">Interviewer:</span> {feedbackModal.interview.interviewerName || feedbackModal.interview.interviewerEmail}</span>
              <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-gray-400" /><span className="font-semibold text-gray-700">Round:</span> {feedbackModal.interview.round}</span>
              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-gray-400" /><span className="font-semibold text-gray-700">Date:</span> {formatDate(feedbackModal.interview.scheduledDate)}</span>
              {fb?.submittedAt && (
                <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5 text-gray-400" /><span className="font-semibold text-gray-700">Submitted:</span> {formatDateTime(fb.submittedAt)}</span>
              )}
            </div>

            {isDynamic ? (
              <DynamicFeedbackDisplay template={tmpl} feedbackData={fb} />
            ) : (
              <div className="space-y-3">
                {fb?.answers && Object.entries(fb.answers).map(([qid, val]) => (
                  <div key={qid} className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {qid.replace(/_/g, " ")}
                    </p>
                    {typeof val === "number" ? (
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <div key={n} className={`w-4 h-4 rounded-sm ${n <= val ? "bg-brand-500" : "bg-gray-200"}`} />
                          ))}
                        </div>
                        <span className="text-sm font-bold text-brand-700">{val}/5</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-800">{val || "—"}</p>
                    )}
                  </div>
                ))}
                {fb?.comments && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400" /> Comments
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{fb.comments}</p>
                  </div>
                )}
                {fb?.overallRecommendation && (
                  <div className="bg-brand-50 rounded-lg px-4 py-3 flex items-center gap-3">
                    <Award className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommendation</p>
                    <span className="text-sm font-bold text-brand-700">{fb.overallRecommendation}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
