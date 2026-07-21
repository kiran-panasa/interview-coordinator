import { ClipboardEdit, Save } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { formatDate } from "../../utils/dates";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

export default function FeedbackEditModal({
  feedbackEditModal, onClose,
  feedbackEditForm, setFeedbackEditForm,
  handleSaveFeedbackEdit, feedbackEditSaving,
}) {
  return (
    <Modal
      open={!!feedbackEditModal}
      onClose={onClose}
      title={
        feedbackEditModal?.feedback?.overallRecommendation
          ? `Edit Feedback — ${feedbackEditModal.candidateName}`
          : `Add Feedback — ${feedbackEditModal?.candidateName}`
      }>
      {feedbackEditModal && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <ClipboardEdit className="w-4 h-4 text-brand-600" />
            </div>
            <div className="text-xs text-gray-500 space-y-0.5">
              <p><span className="font-semibold text-gray-600">Template:</span> {feedbackEditModal.templateName}</p>
              <p><span className="font-semibold text-gray-600">Round:</span> {feedbackEditModal.round} · {formatDate(feedbackEditModal.scheduledDate)}</p>
              <p><span className="font-semibold text-gray-600">Interviewer:</span> {feedbackEditModal.interviewerName || feedbackEditModal.interviewerEmail}</p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Overall Recommendation</label>
            <select
              value={feedbackEditForm.overallRecommendation}
              onChange={e => setFeedbackEditForm(f => ({ ...f, overallRecommendation: e.target.value }))}
              className={inputCls}>
              <option value="">— Select —</option>
              <option value="Proceed">Proceed</option>
              <option value="Hold">Hold</option>
              <option value="Reject">Reject</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              rows={4}
              value={feedbackEditForm.comments}
              onChange={e => setFeedbackEditForm(f => ({ ...f, comments: e.target.value }))}
              placeholder="Overall notes about this interview…"
              className={`${inputCls} resize-none`} />
          </div>

          {feedbackEditModal.status !== "completed" && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={feedbackEditForm.markCompleted}
                onChange={e => setFeedbackEditForm(f => ({ ...f, markCompleted: e.target.checked }))}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Mark interview as Completed
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="primary" icon={Save}
              onClick={handleSaveFeedbackEdit}
              disabled={feedbackEditSaving || !feedbackEditForm.overallRecommendation}
              className="flex-1">
              {feedbackEditSaving ? "Saving…" : "Save Feedback"}
            </Button>
            <Button variant="secondary" onClick={onClose} className="px-5">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
