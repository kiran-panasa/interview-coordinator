import { Calendar, Mail, History } from "lucide-react";
import Modal from "../../components/Modal";
import { formatDateTime } from "../../utils/dates";

const SYNC_LABEL = {
  synced:         { text: "Calendar synced",       cls: "text-emerald-700 bg-emerald-50" },
  failed:         { text: "Calendar sync failed",  cls: "text-red-700 bg-red-50" },
  not_applicable: { text: "No calendar event yet", cls: "text-gray-500 bg-gray-100" },
};

const NOTIF_LABEL = {
  sent:           { text: "Notified",       cls: "text-emerald-700 bg-emerald-50" },
  failed:         { text: "Notify failed",  cls: "text-red-700 bg-red-50" },
  not_applicable: { text: "No one to notify", cls: "text-gray-500 bg-gray-100" },
};

function fmt(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export default function InterviewHistoryModal({ historyModal, onClose, entries, loading }) {
  return (
    <Modal
      open={!!historyModal}
      onClose={onClose}
      title={`Change History — ${historyModal?.candidateName || ""}`}
      wide
    >
      {historyModal && (
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-10">
              <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No edits have been made to this interview yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[28rem] overflow-y-auto">
              {entries.map(entry => {
                const sync  = SYNC_LABEL[entry.calendarSyncStatus]  || SYNC_LABEL.not_applicable;
                const notif = NOTIF_LABEL[entry.notificationStatus] || NOTIF_LABEL.not_applicable;
                return (
                  <div key={entry.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <p className="text-sm font-semibold text-gray-800">
                        {entry.changedByName || "Admin"}
                        <span className="font-normal text-gray-400"> · {formatDateTime(entry.changedAt)}</span>
                      </p>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sync.cls}`}>
                          <Calendar className="w-3 h-3" /> {sync.text}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${notif.cls}`}>
                          <Mail className="w-3 h-3" /> {notif.text}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {entry.changes.map((c, i) => (
                        <p key={i} className="text-xs text-gray-600">
                          <span className="font-semibold text-gray-700">{c.label}:</span>{" "}
                          <span className="text-gray-400">{fmt(c.from)}</span>{" "}→{" "}
                          <span className="text-gray-800 font-medium">{fmt(c.to)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
