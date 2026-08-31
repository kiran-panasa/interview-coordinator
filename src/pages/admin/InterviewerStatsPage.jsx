import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, X, BarChart3 } from "lucide-react";
import { useInterviews } from "../../hooks/subscriptions";
import { useTemplates, usePrograms, useUsers } from "../../hooks/queries";
import { exportInterviewerStats } from "../../utils/interviewerStatsExport";
import SkillsSelect from "../../components/SkillsSelect";

// The only statuses this report counts — a candidate's still-pending/
// scheduled/declined interviews aren't meaningful here, so they're excluded
// from the stats entirely (not just hidden behind an empty filter).
const STATUS_OPTIONS = [
  { id: "completed",           name: "Completed" },
  { id: "partially_completed", name: "Partially Completed" },
  { id: "cancelled",           name: "Cancelled" },
  { id: "no_show",             name: "Student No-show" },
];
const RELEVANT_STATUSES = STATUS_OPTIONS.map(s => s.id);

const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

export default function InterviewerStatsPage() {
  const interviews       = useInterviews();
  const { data: templates = [] } = useTemplates();
  const { data: programs  = [] } = usePrograms();
  const { data: usersAll  = [] } = useUsers();

  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [programIds,   setProgramIds]   = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [templateIds,  setTemplateIds]  = useState([]);
  const [interviewerEmails, setInterviewerEmails] = useState([]);

  const templateProgramById = useMemo(
    () => new Map(templates.map(t => [t.id, t.program || ""])),
    [templates]
  );
  const usersByEmail = useMemo(() => new Map(usersAll.map(u => [u.email, u])), [usersAll]);

  const programOptions = useMemo(
    () => programs.map(p => ({ id: p.id, name: p.name })),
    [programs]
  );
  // Scoped to the selected Program(s) — same "pick a program first to
  // narrow the template list" pattern as the Add Candidate form. Templates
  // with no program set are always included so nothing becomes unreachable.
  const templateOptions = useMemo(
    () => templates
      .filter(t => !programIds.length || !t.program || programIds.includes(t.program))
      .map(t => ({ id: t.id, name: t.name })),
    [templates, programIds]
  );
  // Clear any selected template that no longer applies once the Program
  // filter narrows (mirrors the Add Candidate form's Program->Template reset).
  useEffect(() => {
    setTemplateIds(prev => prev.filter(tid => templateOptions.some(t => t.id === tid)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programIds]);
  const interviewerOptions = useMemo(
    () => usersAll
      .filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active")
      .map(u => ({ id: u.email, name: u.displayName || u.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [usersAll]
  );

  const filtered = useMemo(() => {
    const effectiveStatuses = statuses.length ? statuses : RELEVANT_STATUSES;
    return interviews.filter(iv => {
      if (!effectiveStatuses.includes(iv.status)) return false;
      if (dateFrom && iv.scheduledDate < dateFrom) return false;
      if (dateTo   && iv.scheduledDate > dateTo)   return false;
      if (programIds.length && !programIds.includes(templateProgramById.get(iv.templateId))) return false;
      if (templateIds.length && !templateIds.includes(iv.templateId)) return false;
      if (interviewerEmails.length && !interviewerEmails.includes(iv.interviewerEmail)) return false;
      return true;
    });
  }, [interviews, dateFrom, dateTo, programIds, statuses, templateIds, interviewerEmails, templateProgramById]);

  const interviewerStats = useMemo(() => {
    const map = new Map();
    filtered.forEach(iv => {
      const key = iv.interviewerEmail || "(unknown)";
      if (!map.has(key)) {
        const userRec = usersByEmail.get(iv.interviewerEmail);
        map.set(key, {
          email: key,
          name: iv.interviewerName || userRec?.displayName || key,
          completed: 0, partiallyCompleted: 0, cancelled: 0, noShow: 0,
        });
      }
      const row = map.get(key);
      if (iv.status === "completed") row.completed++;
      else if (iv.status === "partially_completed") row.partiallyCompleted++;
      else if (iv.status === "cancelled") row.cancelled++;
      else if (iv.status === "no_show") row.noShow++;
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, usersByEmail]);

  const totals = useMemo(() => interviewerStats.reduce((acc, r) => ({
    completed:          acc.completed + r.completed,
    partiallyCompleted: acc.partiallyCompleted + r.partiallyCompleted,
    cancelled:          acc.cancelled + r.cancelled,
    noShow:             acc.noShow + r.noShow,
  }), { completed: 0, partiallyCompleted: 0, cancelled: 0, noShow: 0 }),
  [interviewerStats]);

  const hasFilters = dateFrom || dateTo || programIds.length || statuses.length || templateIds.length || interviewerEmails.length;
  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setProgramIds([]); setStatuses([]); setTemplateIds([]); setInterviewerEmails([]);
  };

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interviewer Statistics</h1>
          <p className="text-sm text-gray-500 mt-1">Interviewer-wise interview counts by status</p>
        </div>
        <button onClick={() => exportInterviewerStats(interviewerStats, totals)} disabled={interviewerStats.length === 0}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <Download className="w-3.5 h-3.5" /> Download
        </button>
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
            <label className="block text-xs font-semibold text-gray-500 mb-1">Template</label>
            <SkillsSelect skills={templateOptions} value={templateIds} onChange={setTemplateIds} placeholder="All Templates" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interviewer</label>
            <SkillsSelect skills={interviewerOptions} value={interviewerEmails} onChange={setInterviewerEmails} placeholder="All Interviewers" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interviewer Status</label>
            <SkillsSelect skills={STATUS_OPTIONS} value={statuses} onChange={setStatuses} placeholder="All (Completed, Partially Completed, Cancelled, No-show)" />
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
            <BarChart3 className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm text-gray-400">No interviews match the current filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Interviewer", "Completed", "Partially Completed", "Cancelled", "Student No-show"].map((h, i) => (
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
              </tr>
            </tfoot>
          </table>
        )}
      </motion.div>
    </div>
  );
}
