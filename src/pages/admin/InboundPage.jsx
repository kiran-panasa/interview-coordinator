import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Inbox, Search, X, ArrowRightCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "../../utils/dates";
import {
  createCandidate, moveInboundRequestToNudge, dismissInboundRequest,
} from "../../api/firestore";
import { useInboundRequests } from "../../hooks/subscriptions";
import { useCandidates, usePrograms, QK } from "../../hooks/queries";
import { useAuth } from "../../AuthContext";
import Badge from "../../components/Badge";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import Button from "../../components/Button";
import Toast from "../../components/Toast";
import { usePagination } from "../../hooks/usePagination";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

// Every inbound request today comes from the IOE Admin Portal, which is
// entirely the "Intensive Offline" program's own admin tool (confirmed:
// its own header reads "Intensive Offline Assessment") — every request
// therefore maps to Interview Coordinator's existing Intensive Offline
// program, not a new/separate one.
const INTENSIVE_PROGRAM_NAME = "Intensive Offline";

export default function InboundPage() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const requests = useInboundRequests();
  const { data: candidates = [] } = useCandidates();
  const { data: programs   = [] } = usePrograms();

  const intensiveProgram = programs.find(p => p.name === INTENSIVE_PROGRAM_NAME);

  const [search,       setSearch]       = useState("");
  const [phaseFilter,  setPhaseFilter]  = useState("All");
  const [batchFilter,  setBatchFilter]  = useState("All");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected,     setSelected]     = useState(new Set());
  const [moving,       setMoving]       = useState(false);
  const [toast,        setToast]        = useState(null);

  const phases = useMemo(() => [...new Set(requests.map(r => r.phase).filter(Boolean))].sort(), [requests]);
  const batches = useMemo(() => [...new Set(requests.map(r => r.batch).filter(Boolean))].sort(), [requests]);

  const filtered = useMemo(() => requests.filter(r => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (phaseFilter !== "All" && r.phase !== phaseFilter) return false;
    if (batchFilter !== "All" && r.batch !== batchFilter) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const hay = [r.candidateName, r.candidateEmail, r.uid].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [requests, statusFilter, phaseFilter, batchFilter, search]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => {
    const selectablePaged = paged.filter(r => r.status === "pending");
    const allSelected = selectablePaged.length > 0 && selectablePaged.every(r => selected.has(r.id));
    setSelected(prev => {
      const next = new Set(prev);
      selectablePaged.forEach(r => allSelected ? next.delete(r.id) : next.add(r.id));
      return next;
    });
  };

  const handleDismiss = async (r) => {
    if (!confirm(`Dismiss the request for ${r.candidateName}? It won't be moved to Nudge.`)) return;
    try {
      await dismissInboundRequest(r.id);
      setSelected(prev => { const next = new Set(prev); next.delete(r.id); return next; });
      setToast({ message: "Request dismissed." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  const handleMoveToNudge = async () => {
    const chosen = requests.filter(r => selected.has(r.id) && r.status === "pending");
    if (!chosen.length) return;
    setMoving(true);
    try {
      let created = 0, matched = 0;
      for (const r of chosen) {
        const existing = candidates.find(c => (c.email || "").toLowerCase() === (r.candidateEmail || "").toLowerCase());
        let candidateId = existing?.id;
        if (candidateId) {
          matched++;
        } else {
          candidateId = await createCandidate({
            name:        r.candidateName,
            email:       r.candidateEmail,
            uid:         r.uid || "",
            program:     intensiveProgram?.id || "",
            templateIds: [],
            source:      r.source || "ioe-portal",
            notes:       `Imported from IOE Admin Portal — Phase ${r.phase || "—"}, Batch ${r.batch || "—"}, Week ${r.week || "—"}.`,
            createdBy:   currentUser.uid,
          });
          created++;
        }
        await moveInboundRequestToNudge(r.id, candidateId, currentUser.uid);
      }
      queryClient.invalidateQueries({ queryKey: QK.candidates });
      setSelected(new Set());
      setToast({ message: `${chosen.length} candidate${chosen.length !== 1 ? "s" : ""} moved to Nudge (${created} new, ${matched} matched existing).` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setMoving(false);
  };

  const selectedPendingCount = [...selected].filter(id => requests.find(r => r.id === id)?.status === "pending").length;

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inbound</h1>
          <p className="text-sm text-gray-500 mt-1">
            Interview requests from the IOE Admin Portal — review before sending to Nudge.
            {pendingCount > 0 && ` ${pendingCount} awaiting review.`}
          </p>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="flex gap-3 mb-5 flex-wrap items-center"
      >
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email, UID…"
            className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 w-56 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="pending">Pending</option>
          <option value="moved_to_nudge">Moved to Nudge</option>
          <option value="dismissed">Dismissed</option>
          <option value="All">All Statuses</option>
        </select>
        <select value={phaseFilter} onChange={e => { setPhaseFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="All">All Phases</option>
          {phases.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={batchFilter} onChange={e => { setBatchFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="All">All Batches</option>
          {batches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
          Program: {INTENSIVE_PROGRAM_NAME}
        </span>
        {(search || statusFilter !== "pending" || phaseFilter !== "All" || batchFilter !== "All") && (
          <button onClick={() => { setSearch(""); setStatusFilter("pending"); setPhaseFilter("All"); setBatchFilter("All"); setPage(1); }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selectedPendingCount > 0 && (
            <Button variant="primary" size="md" icon={ArrowRightCircle} onClick={handleMoveToNudge} disabled={moving}>
              {moving ? "Moving…" : `Move to Nudge (${selectedPendingCount})`}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-3 w-8">
                <input type="checkbox"
                  checked={paged.some(r => r.status === "pending") && paged.filter(r => r.status === "pending").every(r => selected.has(r.id))}
                  onChange={toggleAll}
                  className="accent-brand-600 w-4 h-4 cursor-pointer" />
              </th>
              {["UID", "Name", "Email", "Phase / Batch / Week", "Requested Date", "Status", "Requested By", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paged.length === 0 ? (
              <tr><td colSpan={8} className="py-16">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Inbox className="w-8 h-8 text-gray-300" />
                  <p className="text-sm">No inbound requests found</p>
                </div>
              </td></tr>
            ) : paged.map((r, idx) => (
              <motion.tr key={r.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: idx * 0.02 }}
                className={`hover:bg-gray-50/70 transition-colors ${selected.has(r.id) ? "bg-brand-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} disabled={r.status !== "pending"}
                    onChange={() => toggle(r.id)}
                    className="accent-brand-600 w-4 h-4 cursor-pointer disabled:opacity-30" />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.uid || "—"}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{r.candidateName}</td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.candidateEmail}</td>
                <td className="px-4 py-3">
                  <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    {[r.phase, r.batch, r.week].filter(Boolean).join("-") || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{r.requestedDate ? formatDate(r.requestedDate) : "—"}</td>
                <td className="px-4 py-3"><Badge value={r.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-400">{r.requestedBy || "—"}</td>
                <td className="px-4 py-3 w-10">
                  <KebabMenu actions={[
                    { label: "Dismiss", onClick: () => handleDismiss(r), danger: true, show: r.status === "pending" },
                  ]} />
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
