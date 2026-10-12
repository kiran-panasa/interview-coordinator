import { AlertTriangle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";

const CURRENT_LABEL = {
  completed:           "Completed",
  partially_completed: "Partially Completed",
  no_show:             "No Show",
  cancelled:            "Cancelled",
};

const STATUS_OPTIONS = [
  { value: "partially_completed", label: "Partially Completed" },
  { value: "cancelled",           label: "Cancelled" },
  { value: "no_show",             label: "No Show" },
];

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";

export default function CorrectStatusModal({
  correctStatusModal, onClose,
  newStatus, setNewStatus, reason, setReason,
  handleCorrectStatus, correcting,
}) {
  return (
    <Modal
      open={!!correctStatusModal}
      onClose={onClose}
      title={`Correct Status (Audit) — ${correctStatusModal?.candidateName || ""}`}>
      {correctStatusModal && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              For overriding a status after reviewing the recording/transcript — e.g. the interviewer marked this
              "Completed" but the call actually ended early. Feedback, recording, transcript and the AI report are
              left untouched; they stay as the evidence this correction is based on.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Current Status</label>
            <p className="text-sm font-semibold text-gray-700">{CURRENT_LABEL[correctStatusModal.status] || correctStatusModal.status}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Correct To</label>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls}>
              <option value="">Select a status…</option>
              {STATUS_OPTIONS.filter(o => o.value !== correctStatusModal.status).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Audit Remark (required)</label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Recording shows the candidate joined and left after ~10 minutes — not a full interview."
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              variant="primary"
              onClick={handleCorrectStatus}
              disabled={correcting || !newStatus || !reason.trim()}
              className="flex-1">
              {correcting ? "Saving…" : "Save Correction"}
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
