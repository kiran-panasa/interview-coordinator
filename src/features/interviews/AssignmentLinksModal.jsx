import { Plus, Trash2, Save } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";

const inputCls = "flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";

export default function AssignmentLinksModal({
  assignmentLinksModal, onClose,
  assignmentLinksForm, setAssignmentLinksForm,
  handleSaveAssignmentLinks, assignmentLinksSaving,
}) {
  const addLink = () => setAssignmentLinksForm(links => [...links, ""]);
  const updateLink = (i, val) => setAssignmentLinksForm(links => links.map((l, j) => j === i ? val : l));
  const removeLink = (i) => setAssignmentLinksForm(links => links.filter((_, j) => j !== i));

  return (
    <Modal
      open={!!assignmentLinksModal}
      onClose={onClose}
      title={`Assignment Links — ${assignmentLinksModal?.candidateName || ""}`}>
      {assignmentLinksModal && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Shown to the interviewer alongside the Meet link, in this order — editable any time, even after the
            interview is scheduled.
          </p>

          <div className="space-y-2">
            {assignmentLinksForm.length === 0 && (
              <p className="text-xs text-gray-400 italic">No assignment links yet.</p>
            )}
            {assignmentLinksForm.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 w-16 flex-shrink-0">Assignment {i + 1}</span>
                <input
                  type="text"
                  value={url}
                  onChange={e => updateLink(i, e.target.value)}
                  placeholder="https://…"
                  className={inputCls}
                />
                <button type="button" onClick={() => removeLink(i)}
                  className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addLink}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-dashed border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Link
          </button>

          <div className="flex gap-3 pt-1">
            <Button
              variant="primary" icon={Save}
              onClick={handleSaveAssignmentLinks}
              disabled={assignmentLinksSaving}
              className="flex-1">
              {assignmentLinksSaving ? "Saving…" : "Save"}
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
