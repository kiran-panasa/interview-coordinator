import Modal from "../../components/Modal";
import { formatDate } from "../../utils/dates";

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
          <div className="text-xs text-gray-500 space-y-0.5">
            <p><span className="font-semibold text-gray-600">Template:</span> {feedbackEditModal.templateName}</p>
            <p><span className="font-semibold text-gray-600">Round:</span> {feedbackEditModal.round} · {formatDate(feedbackEditModal.scheduledDate)}</p>
            <p><span className="font-semibold text-gray-600">Interviewer:</span> {feedbackEditModal.interviewerName || feedbackEditModal.interviewerEmail}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Overall Recommendation</label>
            <select
              value={feedbackEditForm.overallRecommendation}
              onChange={e => setFeedbackEditForm(f => ({ ...f, overallRecommendation: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Select —</option>
              <option value="Proceed">Proceed</option>
              <option value="Hold">Hold</option>
              <option value="Reject">Reject</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              rows={4}
              value={feedbackEditForm.comments}
              onChange={e => setFeedbackEditForm(f => ({ ...f, comments: e.target.value }))}
              placeholder="Overall notes about this interview…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {feedbackEditModal.status !== "completed" && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={feedbackEditForm.markCompleted}
                onChange={e => setFeedbackEditForm(f => ({ ...f, markCompleted: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Mark interview as Completed
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSaveFeedbackEdit}
              disabled={feedbackEditSaving || !feedbackEditForm.overallRecommendation}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {feedbackEditSaving ? "Saving…" : "Save Feedback"}
            </button>
            <button
              onClick={onClose}
              className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
