import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, Search, Send, ChevronDown, ChevronRight, Sparkles, UserX, CalendarClock, HelpCircle } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useStudentQueries } from "../../hooks/subscriptions";
import { replyToQueryAsAdmin, updateQueryStatus } from "../../api/studentQueries";
import { formatDateTime } from "../../utils/dates";
import Button from "../../components/Button";
import Toast from "../../components/Toast";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

// Mirrors QUERY_CATEGORIES in api/sso-handler.js's createQuery — label/icon
// pair for each, so a category never shows as a bare machine-readable key.
const CATEGORY_META = {
  ai_report:        { label: "AI Report Not Generated", icon: Sparkles },
  panelist_no_show: { label: "Panelist Didn't Join",     icon: UserX },
  slot_doubt:       { label: "Slot Doubt",                icon: CalendarClock },
  other:             { label: "Other",                     icon: HelpCircle },
};

const STATUS_STYLE = {
  open:    "bg-amber-50 text-amber-700 border-amber-200",
  replied: "bg-sky-50 text-sky-700 border-sky-200",
  closed:  "bg-gray-100 text-gray-500 border-gray-200",
};
const STATUS_LABEL = { open: "Open", replied: "Replied", closed: "Closed" };

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
}

function QueryThread({ q, onReplied, setToast }) {
  const { userProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const meta = CATEGORY_META[q.category] || CATEGORY_META.other;
  const Icon = meta.icon;
  const lastMessage = q.messages?.[q.messages.length - 1];

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const byName = userProfile?.displayName || userProfile?.email || "Admin";
      await replyToQueryAsAdmin(q.id, reply.trim(), byName);
      setReply("");
      onReplied?.();
    } catch (e) {
      setToast({ message: "Couldn't send reply: " + e.message, type: "error" });
    }
    setSending(false);
  };

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-3 w-full px-5 py-4 text-left hover:bg-gray-50/70 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{q.candidateName} <span className="text-gray-400 font-normal">· {meta.label}</span></p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{lastMessage?.text}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-400 hidden sm:inline">{formatDateTime(q.updatedAt)}</span>
          <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_STYLE[q.status] || STATUS_STYLE.open}`}>
            {STATUS_LABEL[q.status] || q.status}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-50 space-y-3">
          <p className="text-xs text-gray-400">{q.candidateEmail}</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {(q.messages || []).map((m, i) => (
              <div key={i} className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                  m.from === "admin" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-800"
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.from === "admin" ? "text-white/60" : "text-gray-400"}`}>
                    {m.from === "admin" ? (m.byName || "Admin") : q.candidateName} · {formatDateTime(m.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2 pt-2">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Reply to this query…"
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-none"
            />
            <Button variant="primary" icon={Send} onClick={handleSend} disabled={sending || !reply.trim()} className="flex-shrink-0">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          {q.status !== "closed" && (
            <button onClick={() => updateQueryStatus(q.id, "closed")}
              className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
              Mark as Closed
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function QueriesPage() {
  const queries = useStudentQueries();
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const filtered = useMemo(() => queries.filter(q => {
    if (statusFilter !== "All" && q.status !== statusFilter) return false;
    if (search) {
      const needle = search.trim().toLowerCase();
      const hay = [q.candidateName, q.candidateEmail].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [queries, statusFilter, search]);

  const counts = useMemo(() => ({
    All: queries.length,
    open: queries.filter(q => q.status === "open").length,
    replied: queries.filter(q => q.status === "replied").length,
    closed: queries.filter(q => q.status === "closed").length,
  }), [queries]);

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}
        className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Student Queries</h1>
          <p className="text-sm text-gray-500 mt-1">Questions and issues candidates raised from their dashboard.</p>
        </div>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1}
        className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {["All", "open", "replied", "closed"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                statusFilter === s ? "bg-white text-brand-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
              }`}>
              {s === "All" ? "All" : STATUS_LABEL[s]}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusFilter === s ? "bg-brand-100 text-brand-700" : "bg-gray-200 text-gray-500"}`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by candidate…"
            className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </motion.div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <LifeBuoy className="w-8 h-8 text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No queries here.</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((q, i) => (
            <motion.div key={q.id} initial="hidden" animate="visible" variants={fadeUp} custom={Math.min(i, 8)}>
              <QueryThread q={q} setToast={setToast} />
            </motion.div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
