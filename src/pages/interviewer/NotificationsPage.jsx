import { useState } from "react";
import { formatDate, formatDateTime } from "../../utils/dates";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { updateNotification, createNotification } from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import { useUserNotifications } from "../../hooks/subscriptions";
import Toast from "../../components/Toast";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all">{part}</a>
      : part
  );
}


export default function NotificationsPage() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [responding,  setResponding]  = useState({});
  const [reasonModal, setReasonModal] = useState(null);
  const [reason,      setReason]      = useState("");
  const [toast,       setToast]       = useState(null);

  const allNotifications = useUserNotifications(currentUser.uid);
  const notifications    = allNotifications.filter(n => n.type === "nudge" || n.type === "feedback_reminder");

  const nudges   = notifications;
  const unread   = nudges.filter(n => n.status === "unread").length;

  const handleAvailable = (n) => {
    // Navigate immediately — don't make the interviewer wait for Firestore
    const params = new URLSearchParams();
    if (n.dateRangeStart) params.set("from", n.dateRangeStart);
    if (n.dateRangeEnd)   params.set("to",   n.dateRangeEnd);
    if (n.templateName)   params.set("template", n.templateName);
    params.set("notifId", n.id);
    navigate(`/interviewer/availability?${params.toString()}`);

    // Background: mark notification + notify admin
    const responderName = userProfile?.displayName || userProfile?.email || "Interviewer";
    const dateRange = n.dateRangeStart
      ? ` (${formatDate(n.dateRangeStart)} – ${formatDate(n.dateRangeEnd)})`
      : n.date ? ` on ${formatDate(n.date)}` : "";
    updateNotification(n.id, { status: "available", respondedAt: new Date().toISOString() }).catch(() => {});
    createNotification({
      type:         "response",
      recipientId:  n.senderId,
      senderId:     currentUser.uid,
      senderName:   responderName,
      templateName: n.templateName,
      date:         n.date,
      message:      `${responderName} is available for "${n.templateName || "interview"}"${dateRange}. They will add their slots shortly.`,
      status:       "unread",
      originalNotificationId: n.id,
    }).catch(() => {});
    if (APPS_SCRIPT_URL && n.senderEmail) {
      callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject: `Slot Response — ${responderName} is Available`,
        body: `${responderName} responded to your slot request for "${n.templateName || "interview"}"${dateRange} and is AVAILABLE. They are adding their slots now.`,
        recipients: [{ email: n.senderEmail, name: n.senderName || "Admin" }],
      }).catch(() => {});
    }
  };

  const openDecline = (n) => { setReasonModal(n); setReason(""); };

  const handleUnavailable = async () => {
    if (!reasonModal) return;
    const n = reasonModal;
    setResponding(s => ({ ...s, [n.id]: true }));
    await updateNotification(n.id, { status: "unavailable", reason, respondedAt: new Date().toISOString() });
    const responderName = userProfile?.displayName || userProfile?.email || "Interviewer";
    const dateRange = n.dateRangeStart
      ? ` (${formatDate(n.dateRangeStart)} – ${formatDate(n.dateRangeEnd)})`
      : n.date ? ` on ${formatDate(n.date)}` : "";
    await createNotification({
      type:         "response",
      recipientId:  n.senderId,
      senderId:     currentUser.uid,
      senderName:   responderName,
      templateName: n.templateName,
      date:         n.date,
      message:      `${responderName} is NOT available for "${n.templateName || "interview"}"${dateRange}${reason ? ` — "${reason}"` : "."}`,
      status:       "unread",
      originalNotificationId: n.id,
    });
    // Best-effort email to admin
    if (APPS_SCRIPT_URL && n.senderEmail) {
      callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject: `Slot Response — ${responderName} is NOT Available`,
        body: `${responderName} responded to your slot request for "${n.templateName || "interview"}"${dateRange} and is NOT available${reason ? `: "${reason}"` : "."}.`,
        recipients: [{ email: n.senderEmail, name: n.senderName || "Admin" }],
      }).catch(() => {});
    }
    setReasonModal(null);
    setResponding(s => ({ ...s, [n.id]: false }));
    setToast({ message: "Response sent to admin." });
  };

  const statusBadge = (status) => {
    if (status === "available")   return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Available</span>;
    if (status === "unavailable") return <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">✗ Not Available</span>;
    return null;
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        {unread > 0 && (
          <span className="text-sm font-bold bg-red-100 text-red-600 px-2.5 py-0.5 rounded-full">{unread} new</span>
        )}
      </div>

      {nudges.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-3">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          <p className="text-sm text-gray-400">No notifications yet.</p>
          <p className="text-xs text-gray-300">You'll see availability requests from the admin here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {nudges.map(n => {
            const isNew = n.status === "unread";
            const responded = n.status === "available" || n.status === "unavailable";
            return (
              <div key={n.id}
                className={`bg-white rounded-2xl border p-5 transition-colors ${
                  isNew ? "border-indigo-200 shadow-sm" : "border-gray-200"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isNew && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />}
                    <div>
                      {n.type === "feedback_reminder" ? (
                        <>
                          <p className="text-sm font-bold text-gray-900">Feedback Reminder — {n.candidateName || "Interview"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.createdAt ? formatDateTime(n.createdAt) : ""}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-gray-900">
                            {n.templateName || "Interview"}
                            {(n.dateRangeStart || n.date) && (
                              <span className="font-normal text-gray-500">
                                {" · "}
                                {n.dateRangeStart
                                  ? `${formatDate(n.dateRangeStart)} – ${formatDate(n.dateRangeEnd)}`
                                  : formatDate(n.date)}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">From {n.senderName} · {n.createdAt ? formatDateTime(n.createdAt) : ""}</p>
                        </>
                      )}
                    </div>
                  </div>
                  {n.type === "nudge" && responded && statusBadge(n.status)}
                  {n.type === "feedback_reminder" && !isNew && (
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Seen</span>
                  )}
                </div>

                {/* Message */}
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 whitespace-pre-line leading-relaxed mb-4">
                  {linkify(n.message)}
                </p>

                {/* Actions — feedback reminder */}
                {n.type === "feedback_reminder" && isNew && n.interviewId && (
                  <Link
                    to={`/interviewer/interviews/${n.interviewId}`}
                    onClick={() => updateNotification(n.id, { status: "read" })}
                    className="flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    Go to Interview →
                  </Link>
                )}

                {/* Actions — availability nudge */}
                {n.type === "nudge" && !responded && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAvailable(n)}
                      disabled={responding[n.id]}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                      I'm Available
                    </button>
                    <button
                      onClick={() => openDecline(n)}
                      disabled={responding[n.id]}
                      className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-60 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                      Not Available
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Decline reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Not Available</h3>
            <p className="text-sm text-gray-600">
              Let the admin know why (optional):
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Out of town, other commitments…"
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={handleUnavailable}
                disabled={responding[reasonModal?.id]}
                className="flex-1 bg-red-500 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-600 disabled:opacity-60 transition-colors">
                {responding[reasonModal?.id] ? "Sending…" : "Send Response"}
              </button>
              <button onClick={() => setReasonModal(null)}
                className="px-4 bg-gray-100 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
