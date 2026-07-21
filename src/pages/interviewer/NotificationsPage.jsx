import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, XCircle, Inbox } from "lucide-react";
import { formatDate, formatDateTime } from "../../utils/dates";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { updateNotification, createNotification } from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import { useUserNotifications } from "../../hooks/subscriptions";
import Toast from "../../components/Toast";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { SkeletonRows } from "../../components/Skeleton";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline break-all">{part}</a>
      : part
  );
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3, ease: "easeOut" } }),
};

export default function NotificationsPage() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [responding,  setResponding]  = useState({});
  const [reasonModal, setReasonModal] = useState(null);
  const [reason,      setReason]      = useState("");
  const [toast,       setToast]       = useState(null);

  const allNotifications = useUserNotifications(currentUser.uid);
  const notifications    = allNotifications.filter(n =>
    n.type === "nudge" || n.type === "feedback_reminder" || n.type === "interview_approval"
  );

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
    const savedReason = reason;

    // Close modal immediately so UI isn't frozen
    setReasonModal(null);
    setReason("");

    const responderName = userProfile?.displayName || userProfile?.email || "Interviewer";
    const dateRange = n.dateRangeStart
      ? ` (${formatDate(n.dateRangeStart)} – ${formatDate(n.dateRangeEnd)})`
      : n.date ? ` on ${formatDate(n.date)}` : "";

    try {
      await updateNotification(n.id, { status: "unavailable", reason: savedReason, respondedAt: new Date().toISOString() });
      await createNotification({
        type:         "response",
        recipientId:  n.senderId,
        senderId:     currentUser.uid,
        senderName:   responderName,
        templateName: n.templateName,
        date:         n.date,
        message:      `${responderName} is NOT available for "${n.templateName || "interview"}"${dateRange}${savedReason ? ` — "${savedReason}"` : "."}`,
        status:       "unread",
        originalNotificationId: n.id,
      });
      setToast({ message: "Response sent to admin." });
      // Best-effort email
      if (APPS_SCRIPT_URL && n.senderEmail) {
        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action: "sendEmail",
          subject: `Slot Response — ${responderName} is NOT Available`,
          body: `${responderName} responded to your slot request for "${n.templateName || "interview"}"${dateRange} and is NOT available${savedReason ? `: "${savedReason}"` : "."}.`,
          recipients: [{ email: n.senderEmail, name: n.senderName || "Admin" }],
        }).catch(() => {});
      }
    } catch {
      setToast({ message: "Failed to send response. Please try again.", type: "error" });
    }
  };

  const statusBadge = (status) => {
    if (status === "available")   return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Available</span>;
    if (status === "unavailable") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Not Available</span>;
    return null;
  };

  return (
    <div className="p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Notifications</h1>
        {unread > 0 && (
          <span className="text-sm font-bold bg-red-100 text-red-600 px-2.5 py-0.5 rounded-full">{unread} new</span>
        )}
      </motion.div>

      {nudges.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Inbox className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">No notifications yet.</p>
          <p className="text-xs text-gray-300">You'll see availability requests from the admin here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {nudges.map((n, idx) => {
            const isNew = n.status === "unread";
            const responded = n.status === "available" || n.status === "unavailable";
            return (
              <motion.div key={n.id}
                custom={idx} initial="hidden" animate="visible" variants={fadeUp}
                className={`bg-white rounded-2xl border p-5 transition-colors ${
                  isNew ? "border-emerald-200 shadow-card" : "border-gray-100 shadow-soft"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isNew && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1" />}
                    <div>
                      {n.type === "feedback_reminder" ? (
                        <>
                          <p className="text-sm font-bold text-gray-900">Feedback Reminder — {n.candidateName || "Interview"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.createdAt ? formatDateTime(n.createdAt) : ""}</p>
                        </>
                      ) : n.type === "interview_approval" ? (
                        <>
                          <p className="text-sm font-bold text-gray-900">New Interview — {n.candidateName || "Candidate"}</p>
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
                  {(n.type === "feedback_reminder" || n.type === "interview_approval") && !isNew && (
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Seen</span>
                  )}
                </div>

                {/* Message */}
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 whitespace-pre-line leading-relaxed mb-4">
                  {linkify(n.message)}
                </p>

                {/* Actions — feedback reminder / interview approval */}
                {(n.type === "feedback_reminder" || n.type === "interview_approval") && isNew && n.interviewId && (
                  <Link
                    to={`/interviewer/interviews/${n.interviewId}`}
                    onClick={() => updateNotification(n.id, { status: "read" })}
                    className="flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    {n.type === "interview_approval" ? "Review & Respond →" : "Go to Interview →"}
                  </Link>
                )}

                {/* Actions — availability nudge */}
                {n.type === "nudge" && !responded && (
                  <div className="flex gap-3">
                    <Button
                      variant="primary" icon={CheckCircle2}
                      onClick={() => handleAvailable(n)}
                      disabled={responding[n.id]}
                      className="flex-1 !bg-emerald-600 hover:!bg-emerald-700"
                    >
                      I'm Available
                    </Button>
                    <Button
                      variant="secondary" icon={XCircle}
                      onClick={() => openDecline(n)}
                      disabled={responding[n.id]}
                      className="flex-1"
                    >
                      Not Available
                    </Button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Decline reason modal */}
      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title="Not Available">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Let the admin know why (optional):
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Out of town, other commitments…"
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors resize-none"
          />
          <div className="flex gap-3">
            <Button variant="danger" onClick={handleUnavailable}
              disabled={responding[reasonModal?.id]} className="flex-1 !bg-red-500 hover:!bg-red-600">
              {responding[reasonModal?.id] ? "Sending…" : "Send Response"}
            </Button>
            <Button variant="secondary" onClick={() => setReasonModal(null)} className="px-4">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
