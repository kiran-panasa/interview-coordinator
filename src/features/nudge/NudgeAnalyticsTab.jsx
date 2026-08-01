import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Send, Clock3, AlertTriangle, CalendarCheck2, CalendarClock,
  CheckCircle2, UserX, XCircle, Hourglass, X, ArrowUpDown, FileSpreadsheet,
} from "lucide-react";
import { formatDateTime } from "../../utils/dates";
import {
  LIFECYCLE_STATUS, LIFECYCLE_LABELS, deriveLifecycleStatus, summarizeLifecycle,
  isFinalOutcome, lastNudgeAt,
} from "../../utils/nudgeLifecycle";
import { exportNudgeAnalyticsToExcel } from "../../utils/nudgeAnalyticsExport";
import StatCard from "../../components/ui/StatCard";
import { SkeletonStatCards } from "../../components/Skeleton";
import Badge from "../../components/Badge";
import Pagination from "../../components/Pagination";
import DatePicker from "../../components/DatePicker";
import { usePagination } from "../../hooks/usePagination";

const INTERVIEW_STATUSES = ["pending_acceptance", "scheduled", "completed", "cancelled", "declined", "no_show"];

const CANDIDATE_STATUS_OPTIONS = Object.values(LIFECYCLE_STATUS);

export default function NudgeAnalyticsTab({
  invites, interviews, templates, programs, users,
  blockedDates = [],
  setToast,
}) {
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [filterProgram,  setFilterProgram]  = useState("All");
  const [filterTemplate, setFilterTemplate] = useState("All");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterIvStatus, setFilterIvStatus] = useState("All");
  const [filterSentBy,   setFilterSentBy]   = useState("All");
  const [sortKey,        setSortKey]        = useState("initialNudgeAt");
  const [sortDir,        setSortDir]        = useState("desc");

  const interviewsById = useMemo(() => new Map(interviews.map(iv => [iv.id, iv])), [interviews]);
  const programNameById = useMemo(() => new Map(programs.map(p => [p.id, p.name])), [programs]);
  const userNameById = useMemo(() => new Map(users.map(u => [u.id, u.displayName || u.email])), [users]);

  const rows = useMemo(() => invites.map(inv => {
    const interview = inv.interviewId ? interviewsById.get(inv.interviewId) || null : null;
    const status = deriveLifecycleStatus(inv, interview);
    const statusLabel = LIFECYCLE_LABELS[status] || status;
    const interviewDateTime = interview?.scheduledDate
      ? `${interview.scheduledDate}T${(interview.scheduledTime || "00:00")}`
      : null;
    return {
      id:             inv.id,
      invite:         inv,
      interview,
      status,
      statusLabel,
      candidateUid:   inv.candidateUid || "",
      candidateName:  inv.candidateName || "",
      programId:      inv.program || "",
      programName:    inv.programName || programNameById.get(inv.program) || "",
      templateId:     inv.templateId || "",
      templateName:   inv.templateName || "",
      initialNudgeAt: inv.sentAt || null,
      reminder1At:    inv.reminder1SentAt || null,
      reminder2At:    inv.reminder2SentAt || null,
      lastNudgeAt:    lastNudgeAt(inv),
      nudgeCount:     inv.nudgeCount ?? 1,
      slotBookingAt:  inv.bookedAt || null,
      interviewDate:  interviewDateTime,
      finalOutcome:   isFinalOutcome(status) ? statusLabel : "In Progress",
      sentByName:     userNameById.get(inv.sentBy) || "",
      sentById:       inv.sentBy || "",
    };
  }), [invites, interviewsById, programNameById, userNameById]);

  const uniqueSenders = useMemo(
    () => [...new Map(rows.filter(r => r.sentById).map(r => [r.sentById, r.sentByName])).entries()],
    [rows]
  );

  const filtered = useMemo(() => rows.filter(r => {
    if (dateFrom && (!r.initialNudgeAt || r.initialNudgeAt.slice(0, 10) < dateFrom)) return false;
    if (dateTo   && (!r.initialNudgeAt || r.initialNudgeAt.slice(0, 10) > dateTo))   return false;
    if (filterProgram  !== "All" && r.programId  !== filterProgram)  return false;
    if (filterTemplate !== "All" && r.templateId !== filterTemplate) return false;
    if (filterStatus   !== "All" && r.status     !== filterStatus)   return false;
    if (filterIvStatus !== "All" && (r.interview?.status || "") !== filterIvStatus) return false;
    if (filterSentBy   !== "All" && r.sentById   !== filterSentBy)   return false;
    return true;
  }), [rows, dateFrom, dateTo, filterProgram, filterTemplate, filterStatus, filterIvStatus, filterSentBy]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => summarizeLifecycle(filtered), [filtered]);

  const pagination = usePagination(sorted, 10);

  const hasFilters = dateFrom || dateTo || filterProgram !== "All" || filterTemplate !== "All" ||
    filterStatus !== "All" || filterIvStatus !== "All" || filterSentBy !== "All";

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setFilterProgram("All"); setFilterTemplate("All");
    setFilterStatus("All"); setFilterIvStatus("All"); setFilterSentBy("All");
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      setToast?.({ message: "No rows match the current filters.", type: "error" });
      return;
    }
    exportNudgeAnalyticsToExcel(filtered);
  };

  const SortHeader = ({ label, sortField }) => (
    <th
      onClick={() => toggleSort(sortField)}
      className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 cursor-pointer select-none hover:text-gray-600"
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortKey === sortField ? "text-brand-600" : "text-gray-300"}`} />
      </span>
    </th>
  );

  const loaded = invites != null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft px-5 py-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex items-center gap-1.5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
              <DatePicker value={dateFrom} onChange={e => setDateFrom(e.target.value)} blockedDates={blockedDates}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
              <DatePicker value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} blockedDates={blockedDates}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Program</label>
            <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="All">All Programs</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
            <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="All">All Templates</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Candidate Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="All">All Statuses</option>
              {CANDIDATE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Interview Status</label>
            <select value={filterIvStatus} onChange={e => setFilterIvStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="All">Any</option>
              {INTERVIEW_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          {uniqueSenders.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sent By</label>
              <select value={filterSentBy} onChange={e => setFilterSentBy(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="All">All Admins</option>
                {uniqueSenders.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <button onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export{filtered.length !== rows.length ? ` (${filtered.length})` : ""}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {!loaded ? (
        <SkeletonStatCards count={10} />
      ) : (
        <motion.div
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
        >
          {[
            { label: "Total Nudges Sent",             value: stats.totalNudgesSent,     color: "text-gray-900",    icon: Send,          iconBg: "bg-gray-100" },
            { label: "Reminder 1 Sent",                value: stats.reminder1Sent,       color: "text-amber-600",   icon: Clock3,        iconBg: "bg-amber-50" },
            { label: "Reminder 2 Sent",                value: stats.reminder2Sent,       color: "text-orange-600",  icon: Clock3,        iconBg: "bg-orange-50" },
            { label: "Slots Booked",                   value: stats.slotsBooked,         color: "text-violet-600",  icon: CalendarCheck2, iconBg: "bg-violet-50" },
            { label: "Interviews Scheduled",           value: stats.interviewsScheduled, color: "text-blue-600",    icon: CalendarClock, iconBg: "bg-blue-50" },
            { label: "Interviews Completed",           value: stats.interviewsCompleted, color: "text-emerald-600", icon: CheckCircle2,  iconBg: "bg-emerald-50" },
            { label: "No Shows",                       value: stats.noShows,             color: "text-orange-600",  icon: UserX,         iconBg: "bg-orange-50" },
            { label: "Cancelled Interviews",           value: stats.cancelledInterviews, color: "text-gray-500",    icon: XCircle,       iconBg: "bg-gray-100" },
            { label: "Pending Slot Booking",           value: stats.pendingSlotBooking,  color: "text-brand-600",   icon: Hourglass,     iconBg: "bg-brand-50" },
            { label: "No Response After 2 Reminders",  value: stats.noResponse,          color: "text-red-600",     icon: AlertTriangle, iconBg: "bg-red-50" },
          ].map(card => (
            <motion.div key={card.label} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
              <StatCard {...card} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Candidate Tracking {filtered.length !== rows.length ? `(filtered: ${filtered.length})` : `(${rows.length} total)`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <SortHeader label="Candidate"        sortField="candidateName" />
                <SortHeader label="Program"          sortField="programName" />
                <SortHeader label="Template"         sortField="templateName" />
                <SortHeader label="Initial Nudge"    sortField="initialNudgeAt" />
                <SortHeader label="Reminder 1"       sortField="reminder1At" />
                <SortHeader label="Reminder 2"       sortField="reminder2At" />
                <SortHeader label="Nudges Sent"      sortField="nudgeCount" />
                <SortHeader label="Last Nudge"       sortField="lastNudgeAt" />
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Current Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Final Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pagination.paged.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-10 text-sm">
                  {rows.length === 0 ? "No nudges sent yet." : "No candidates match the selected filters."}
                </td></tr>
              ) : pagination.paged.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{r.candidateName}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.candidateUid || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.programName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px]"><span className="line-clamp-2">{r.templateName || "—"}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.initialNudgeAt ? formatDateTime(r.initialNudgeAt) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.reminder1At ? formatDateTime(r.reminder1At) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.reminder2At ? formatDateTime(r.reminder2At) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 text-center">{r.nudgeCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.lastNudgeAt ? formatDateTime(r.lastNudgeAt) : "—"}</td>
                  <td className="px-4 py-3"><Badge value={r.status} /></td>
                  <td className="px-4 py-3 text-xs">
                    {r.finalOutcome === "In Progress"
                      ? <span className="text-gray-400">In Progress</span>
                      : <span className="font-semibold text-gray-700">{r.finalOutcome}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={pagination.setPage} />
      </div>
    </div>
  );
}
