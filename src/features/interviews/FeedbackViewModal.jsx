import Modal from "../../components/Modal";
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
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 pb-2 border-b border-gray-100">
              <span><span className="font-semibold text-gray-700">Interviewer:</span> {feedbackModal.interview.interviewerName || feedbackModal.interview.interviewerEmail}</span>
              <span><span className="font-semibold text-gray-700">Round:</span> {feedbackModal.interview.round}</span>
              <span><span className="font-semibold text-gray-700">Date:</span> {formatDate(feedbackModal.interview.scheduledDate)}</span>
              {fb?.submittedAt && (
                <span><span className="font-semibold text-gray-700">Submitted:</span> {formatDateTime(fb.submittedAt)}</span>
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
                            <div key={n} className={`w-4 h-4 rounded-sm ${n <= val ? "bg-indigo-500" : "bg-gray-200"}`} />
                          ))}
                        </div>
                        <span className="text-sm font-bold text-indigo-700">{val}/5</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-800">{val || "—"}</p>
                    )}
                  </div>
                ))}
                {fb?.comments && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Comments</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{fb.comments}</p>
                  </div>
                )}
                {fb?.overallRecommendation && (
                  <div className="bg-indigo-50 rounded-lg px-4 py-3 flex items-center gap-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommendation</p>
                    <span className="text-sm font-bold text-indigo-700">{fb.overallRecommendation}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button onClick={onClose}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2 text-sm font-semibold hover:bg-gray-200">
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
