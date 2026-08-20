import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Download, ChevronDown, X, IndianRupee } from "lucide-react";
import { useInterviews } from "../../hooks/subscriptions";
import { useTemplates, usePrograms, useUsers } from "../../hooks/queries";
import { exportPaymentStats, exportPaymentReportOnly } from "../../utils/paymentStatsExport";
import SkillsSelect from "../../components/SkillsSelect";

const STATUS_OPTIONS = [
  { id: "pending_acceptance",  name: "Pending Acceptance" },
  { id: "scheduled",           name: "Scheduled" },
  { id: "completed",           name: "Completed" },
  { id: "partially_completed", name: "Partially Completed" },
  { id: "cancelled",           name: "Cancelled" },
  { id: "declined",            name: "Declined" },
  { id: "no_show",             name: "Student No-show" },
];

const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

export default function PaymentStatsPage() {
  const interviews       = useInterviews();
  const { data: templates = [] } = useTemplates();
  const { data: programs  = [] } = usePrograms();
  const { data: usersAll  = [] } = useUsers();

  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [programIds,   setProgramIds]   = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [rounds,       setRounds]       = useState([]);
  const [showDownload, setShowDownload] = useState(false);
  const downloadRef = useRef(null);
  useEffect(() => {
    const close = (e) => { if (downloadRef.current && !downloadRef.current.contains(e.target)) setShowDownload(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const templateProgramById = useMemo(
    () => new Map(templates.map(t => [t.id, t.program || ""])),
    [templates]
  );
  const programNameByTemplateId = useMemo(() => {
    const nameById = new Map(programs.map(p => [p.id, p.name]));
    const out = new Map();
    templates.forEach(t => out.set(t.id, nameById.get(t.program) || ""));
    return out;
  }, [templates, programs]);
  const usersByEmail = useMemo(() => new Map(usersAll.map(u => [u.email, u])), [usersAll]);

  const roundOptions = useMemo(
    () => [...new Set(interviews.map(iv => iv.round).filter(Boolean))].sort().map(r => ({ id: r, name: r })),
    [interviews]
  );
  const programOptions = useMemo(
    () => programs.map(p => ({ id: p.id, name: p.name })),
    [programs]
  );

  const filtered = useMemo(() => interviews.filter(iv => {
    if (dateFrom && iv.scheduledDate < dateFrom) return false;
    if (dateTo   && iv.scheduledDate > dateTo)   return false;
    if (programIds.length && !programIds.includes(templateProgramById.get(iv.templateId))) return false;
    if (statuses.length   && !statuses.includes(iv.status)) return false;
    if (rounds.length     && !rounds.includes(iv.round)) return false;
    return true;
  }), [interviews, dateFrom, dateTo, programIds, statuses, rounds, templateProgramById]);

  const interviewerStats = useMemo(() => {
    const map = new Map();
    filtered.forEach(iv => {
      const key = iv.interviewerEmail || "(unknown)";
      if (!map.has(key)) {
        const userRec = usersByEmail.get(iv.interviewerEmail);
        map.set(key, {
          email: key,
          name: iv.interviewerName || userRec?.displayName || key,
          rate: userRec?.paymentRatePerInterview ?? null,
          completed: 0, partiallyCompleted: 0, cancelled: 0, noShow: 0, other: 0, total: 0,
        });
      }
      const row = map.get(key);
      row.total++;
      if (iv.status === "completed") row.completed++;
      else if (iv.status === "partially_completed") row.partiallyCompleted++;
      else if (iv.status === "cancelled") row.cancelled++;
      else if (iv.status === "no_show") row.noShow++;
      else row.other++;
    });
    return [...map.values()]
      .map(row => ({
        ...row,
        payment: row.rate != null ? row.completed * row.rate + row.partiallyCompleted * row.rate * 0.5 : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, usersByEmail]);

  const totals = useMemo(() => interviewerStats.reduce((acc, r) => ({
    completed:          acc.completed + r.completed,
    partiallyCompleted: acc.partiallyCompleted + r.partiallyCompleted,
    cancelled:          acc.cancelled + r.cancelled,
    noShow:             acc.noShow + r.noShow,
    other:              acc.other + r.other,
    total:              acc.total + r.total,
    payment:            acc.payment + (r.payment || 0),
  }), { completed: 0, partiallyCompleted: 0, cancelled: 0, noShow: 0, other: 0, total: 0, payment: 0 }),
  [interviewerStats]);

  const hasFilters = dateFrom || dateTo || programIds.length || statuses.length || rounds.length;
  const clearFilters = () => { setDateFrom(""); setDateTo(""); setProgramIds([]); setStatuses([]); setRounds([]); };

  const download = (sortBy, filenamePrefix) => {
    exportPaymentStats(filtered, interviewerStats, totals, programNameByTemplateId, sortBy, filenamePrefix);
    setShowDownload(false);
  };

  const fmt = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Payment &amp; Statistics</h1>
          <p className="text-sm text-gray-500 mt-1">Interviewer-wise interview counts and payment reconciliation</p>
        </div>
        <div className="relative" ref={downloadRef}>
          <button onClick={() => setShowDownload(v => !v)} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <Download className="w-3.5 h-3.5" /> Download <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {showDownload && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-popover z-20 overflow-hidden animate-scale-in origin-top-right">
              <button onClick={() => download("date", "payment_stats_all")}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Download All
              </button>
              <button onClick={() => download("interviewer", "payment_stats_by_interviewer")}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                Download by Interviewer
              </button>
              <button onClick={() => download("program", "payment_stats_by_program")}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                Download by Program
              </button>
              <button onClick={() => download("round", "payment_stats_by_stage")}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                Download by Interview Stage/Round
              </button>
              <button onClick={() => { exportPaymentReportOnly(interviewerStats, totals); setShowDownload(false); }}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 border-t border-gray-100 transition-colors">
                Download Payment Report
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Program</label>
            <SkillsSelect skills={programOptions} value={programIds} onChange={setProgramIds} placeholder="All Programs" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interview Status</label>
            <SkillsSelect skills={STATUS_OPTIONS} value={statuses} onChange={setStatuses} placeholder="All Statuses" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interview Stage / Round</label>
            <SkillsSelect skills={roundOptions} value={rounds} onChange={setRounds} placeholder="All Stages" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-2 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </motion.div>

      {/* Stats table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        {interviewerStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <IndianRupee className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm text-gray-400">No interviews match the current filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Interviewer", "Completed", "Partially Completed", "Cancelled", "Student No-show", "Other", "Total Interviews", "Payment"].map((h, i) => (
                  <th key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {interviewerStats.map(r => (
                <tr key={r.email} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{r.completed}</td>
                  <td className="px-4 py-3 text-right text-amber-700 font-semibold">{r.partiallyCompleted}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.cancelled}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{r.noShow}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{r.other}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{r.total}</td>
                  <td className="px-4 py-3 text-right">
                    {r.payment != null
                      ? <span className="font-semibold text-gray-900">₹{fmt(r.payment)}</span>
                      : <span className="text-xs text-gray-300" title="Set a payment rate on the Interviewers page">Rate not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                <td className="px-4 py-3 font-bold text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">{totals.completed}</td>
                <td className="px-4 py-3 text-right font-bold text-amber-700">{totals.partiallyCompleted}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-500">{totals.cancelled}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-600">{totals.noShow}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-400">{totals.other}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{totals.total}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">₹{fmt(totals.payment)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </motion.div>
    </div>
  );
}
