import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Copy, Check, RotateCcw } from "lucide-react";
import { formatDateTime } from "../../utils/dates";
import { useFailedAccessRequests, useAccessRequestResolutions } from "../../hooks/subscriptions";
import { resolveAccessRequest, unresolveAccessRequest } from "../../api/accessRequests";
import { groupAccessRequests } from "../../utils/accessRequests";
import { useAuth } from "../../AuthContext";
import Button from "../../components/Button";
import Toast from "../../components/Toast";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-xs font-mono text-gray-600 hover:text-brand-700 transition-colors group"
      title="Copy"
    >
      {value}
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />}
    </button>
  );
}

// Surfaces students Forms tried to sign in who have no matching Candidate
// record here — otherwise the ONLY trace this ever leaves is Forms' own
// generic "Oops" error screen on the student's end, with nothing on our
// side pointing an admin at who needs adding. See ssoTokenRequestLog
// (written by api/sso-handler.js's accountsToken) and the
// student_not_found case specifically.
export default function AccessRequestsPage() {
  const { currentUser, userProfile } = useAuth();
  const logs        = useFailedAccessRequests();
  const resolutions = useAccessRequestResolutions();
  const [tab,   setTab]   = useState("pending");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const grouped = useMemo(() => groupAccessRequests(logs, resolutions), [logs, resolutions]);
  const pending  = grouped.filter(g => !g.resolved);
  const resolved = grouped.filter(g => g.resolved);
  const filtered = tab === "pending" ? pending : resolved;

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  const handleResolve = async (userId) => {
    setBusyId(userId);
    try {
      await resolveAccessRequest(userId, currentUser.uid, userProfile?.displayName || userProfile?.email || currentUser.email || "Admin");
      setToast({ message: "Marked resolved." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusyId(null);
  };

  const handleUnresolve = async (userId) => {
    setBusyId(userId);
    try {
      await unresolveAccessRequest(userId);
      setToast({ message: "Reopened — back in Pending." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusyId(null);
  };

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Access Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
          Students who tried to sign in but aren't in Candidates yet — they just see a generic error with no way to tell you.
          {pending.length > 0 && ` ${pending.length} pending.`}
        </p>
      </motion.div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[["pending", "Pending", pending.length], ["resolved", "Resolved", resolved.length]].map(([key, label, count]) => (
          <button key={key} onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {label} {count > 0 && <span className="ml-1 text-xs text-gray-400">({count})</span>}
          </button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {["Student UID", "Phone", "Name (if known)", "Attempts", "Last Attempted", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paged.length === 0 ? (
              <tr><td colSpan={6} className="py-16">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <ShieldAlert className="w-8 h-8 text-gray-300" />
                  <p className="text-sm">{tab === "pending" ? "No pending access requests" : "Nothing resolved yet"}</p>
                </div>
              </td></tr>
            ) : paged.map((g, idx) => (
              <motion.tr key={g.userId}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: idx * 0.02 }}
                className="hover:bg-gray-50/70 transition-colors"
              >
                <td className="px-4 py-3"><CopyButton value={g.userId} /></td>
                <td className="px-4 py-3"><CopyButton value={g.phone} /></td>
                <td className="px-4 py-3 text-gray-600">{g.extra?.name || g.extra?.email || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{g.attemptCount}</td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{g.lastAt ? formatDateTime(g.lastAt) : "—"}</td>
                <td className="px-4 py-3 w-40">
                  {tab === "pending" ? (
                    <Button variant="secondary" size="sm" disabled={busyId === g.userId} onClick={() => handleResolve(g.userId)}>
                      Mark Resolved
                    </Button>
                  ) : (
                    <button
                      onClick={() => handleUnresolve(g.userId)}
                      disabled={busyId === g.userId}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" /> Reopen
                    </button>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
      </motion.div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
