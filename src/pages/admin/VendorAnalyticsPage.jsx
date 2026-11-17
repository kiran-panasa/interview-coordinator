import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  PieChart, Users, CalendarClock, CheckCircle2, Hourglass, RefreshCw,
  XCircle, UserX, UserMinus, AlertTriangle, Download, X, ArrowUpDown, Lock,
} from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useInterviewsInDateRange } from "../../hooks/subscriptions";
import { useTemplates, usePrograms, useUsers, useVendors } from "../../hooks/queries";
import { usePagination } from "../../hooks/usePagination";
import { isSupersededPartial } from "../../utils/interviewCompletionStats";
import { exportVendorAnalytics } from "../../utils/vendorAnalyticsExport";
import SkillsSelect from "../../components/SkillsSelect";
import DatePicker from "../../components/DatePicker";
import Pagination from "../../components/Pagination";

// ── Date-range helpers — same shape as InterviewerStatsPage's own, kept
// local rather than shared since each page's "previous period" math differs
// (this page needs one, that page doesn't). ──────────────────────────────
// Local calendar date, not toISOString() — that converts to UTC first,
// which silently shifts the date backward by a day for any positive UTC
// offset (e.g. IST, UTC+5:30: local midnight Nov 1 is 18:30 UTC on Oct 31).
// scheduledDate strings elsewhere in this app are plain local calendar
// dates, not UTC timestamps, so this has to match that or every period
// boundary (and the header's own date range) comes out one day early.
function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayIso() { return iso(new Date()); }
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { from: iso(monday), to: iso(sunday) };
}
function thisMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: iso(first), to: iso(last) };
}
function allTimeRange() { return { from: "2000-01-01", to: "2099-12-31" }; }
// "16 Nov 2026" — a compact, readable form for the header's date range,
// parsed as a local date (not `new Date(isoStr)`, which some browsers
// read as UTC midnight and can again print one day early/late depending
// on the viewer's own timezone).
function formatRangeDate(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const PERIOD_LABEL = { week: "This Week", month: "This Month", overall: "All Time", custom: "Custom Range" };
// The immediately-preceding period of the SAME length — e.g. this week's
// comparison is last week, this month's is last month, a custom 10-day
// range's is the 10 days right before it. "Overall" has no meaningful
// predecessor, so callers skip this entirely for that period.
function previousEquivalentRange(from, to) {
  const f = new Date(from), t = new Date(to);
  const lengthMs = t - f;
  const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs);
  return { from: iso(prevFrom), to: iso(prevTo) };
}

const UNASSIGNED_PROGRAM_ID = "__unassigned__";
const NO_VENDOR_ID = "__no_vendor__";

// Every status this page's totals/rates are built from — "scheduled" and
// "pending_acceptance" ARE included (unlike the per-interviewer stats
// page) because "Total Scheduled" here means every interview booked in
// the period regardless of what's happened to it since, which is the
// denominator every rate below divides into.
const STATUS_OPTIONS = [
  { id: "scheduled",           name: "Scheduled (upcoming)" },
  { id: "pending_acceptance",  name: "Pending Acceptance" },
  { id: "completed",           name: "Completed" },
  { id: "partially_completed", name: "Partially Completed" },
  { id: "cancelled",           name: "Cancelled" },
  { id: "no_show",             name: "No-show" },
  { id: "declined",            name: "Declined" },
];

const SORT_OPTIONS = [
  { id: "scheduled",        name: "Scheduled" },
  { id: "completed",        name: "Completed" },
  { id: "panelists",        name: "Panelists" },
  { id: "completionRate",   name: "Completion Rate" },
  { id: "cancellationRate", name: "Cancellation Rate" },
  { id: "noShowRate",       name: "No-Show Rate" },
];

function emptyCounts() {
  return {
    scheduled: 0, completed: 0, partiallyCompleted: 0, rescheduled: 0,
    cancelledAdmin: 0, cancelledStudent: 0, cancelledInterviewer: 0,
    noShow: 0, declined: 0,
  };
}

function bumpCounts(row, iv) {
  row.scheduled++;
  if (iv.status === "completed") row.completed++;
  else if (iv.status === "partially_completed" && !isSupersededPartial(iv)) row.partiallyCompleted++;
  else if (iv.status === "no_show") row.noShow++;
  else if (iv.status === "declined") row.declined++;
  else if (iv.status === "cancelled") {
    // Independent of WHO cancelled it — a cancelled interview that was
    // then rebooked is both "cancelled by X" and "rescheduled" at once,
    // two different questions about the same record, not a double-count
    // of "scheduled" (the rebooked slot is its own separate document that
    // gets counted on its own whenever its own date falls in range).
    if (iv.rescheduledTo) row.rescheduled++;
    if (iv.cancelledBy === "admin") row.cancelledAdmin++;
    else if (iv.cancelledBy === "candidate") row.cancelledStudent++;
    else if (iv.cancelledBy === "interviewer") row.cancelledInterviewer++;
  }
}

function withRates(row) {
  const cancelled = row.cancelledAdmin + row.cancelledStudent + row.cancelledInterviewer;
  return {
    ...row,
    cancelled,
    completionRate:   row.scheduled ? (row.completed / row.scheduled) * 100 : 0,
    cancellationRate: row.scheduled ? (cancelled / row.scheduled) * 100 : 0,
    noShowRate:       row.scheduled ? (row.noShow / row.scheduled) * 100 : 0,
  };
}

const pct = (n) => `${n.toFixed(0)}%`;
const delta = (cur, prev) => {
  if (!prev) return null;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.5) return { label: "No change", positive: null };
  return { label: `${diff > 0 ? "+" : ""}${diff} vs previous period`, positive: diff > 0 };
};

export default function VendorAnalyticsPage() {
  const { userProfile } = useAuth();

  const [period,     setPeriod]     = useState("week"); // week | month | overall | custom
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo,   setCustomTo]   = useState(todayIso());
  const [compareBy,  setCompareBy]  = useState("vendor"); // vendor | panelist

  const [vendorIds,   setVendorIds]   = useState([]);
  const [programIds,  setProgramIds]  = useState([]);
  const [templateIds, setTemplateIds] = useState([]);
  const [statuses,    setStatuses]    = useState([]);
  const [durations,   setDurations]   = useState([]);
  const [search,      setSearch]      = useState("");
  const [sortBy,      setSortBy]      = useState("scheduled");
  const [sortDir,     setSortDir]     = useState("desc");

  const range = period === "week" ? thisWeekRange()
    : period === "month" ? thisMonthRange()
    : period === "overall" ? allTimeRange()
    : { from: customFrom, to: customTo };
  const hasPrevPeriod = period !== "overall";
  const prevRange = hasPrevPeriod ? previousEquivalentRange(range.from, range.to) : null;

  const interviews     = useInterviewsInDateRange(range.from, range.to);
  const prevInterviews = useInterviewsInDateRange(prevRange?.from || "2099-01-01", prevRange?.to || "2099-01-02");

  const { data: templates = [] } = useTemplates();
  const { data: programs  = [] } = usePrograms();
  const { data: usersAll  = [] } = useUsers();
  const { data: vendors   = [] } = useVendors();

  const templateProgramById = useMemo(
    () => new Map(templates.map(t => [t.id, t.program || UNASSIGNED_PROGRAM_ID])),
    [templates]
  );
  const effectiveProgramOf = (templateId) => templateProgramById.get(templateId) || UNASSIGNED_PROGRAM_ID;
  const usersByEmail = useMemo(() => new Map(usersAll.map(u => [u.email, u])), [usersAll]);
  const vendorsById   = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);
  const vendorNameOf  = (vendorId) => vendorId ? (vendorsById.get(vendorId) || "Unknown Vendor") : "No Vendor";

  const vendorOptions   = useMemo(() => vendors.map(v => ({ id: v.id, name: v.name })), [vendors]);
  const programOptions  = useMemo(() => programs.map(p => ({ id: p.id, name: p.name })), [programs]);
  const templateOptions = useMemo(
    () => templates
      .filter(t => !programIds.length || programIds.includes(t.program || UNASSIGNED_PROGRAM_ID))
      .map(t => ({ id: t.id, name: t.name })),
    [templates, programIds]
  );
  const durationOptions = useMemo(() => {
    const set = new Set(interviews.map(iv => iv.duration || 60));
    return [...set].sort((a, b) => a - b).map(d => ({ id: String(d), name: `${d} mins` }));
  }, [interviews]);

  const passesCommonFilters = (iv) => {
    if (programIds.length && !programIds.includes(effectiveProgramOf(iv.templateId))) return false;
    if (templateIds.length && !templateIds.includes(iv.templateId)) return false;
    if (durations.length && !durations.includes(String(iv.duration || 60))) return false;
    if (vendorIds.length && !vendorIds.includes(iv.vendorId)) return false;
    if (statuses.length && !statuses.includes(iv.status)) return false;
    return true;
  };

  const filtered     = useMemo(() => interviews.filter(passesCommonFilters),
    [interviews, programIds, templateIds, durations, vendorIds, statuses, templateProgramById]); // eslint-disable-line
  const filteredPrev = useMemo(() => prevInterviews.filter(passesCommonFilters),
    [prevInterviews, programIds, templateIds, durations, vendorIds, statuses, templateProgramById]); // eslint-disable-line

  // Active interviewers, optionally narrowed to the selected vendors — the
  // denominator for "Total Panelists" and each vendor row's own count.
  // Counted from the users collection, not from who happened to have an
  // interview in range, so a panelist with zero interviews this week still
  // shows up as available capacity rather than silently vanishing.
  const activeInterviewers = useMemo(
    () => usersAll.filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"),
    [usersAll]
  );
  const panelistsByVendor = useMemo(() => {
    const m = new Map();
    activeInterviewers.forEach(u => {
      const k = u.vendorId || NO_VENDOR_ID;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [activeInterviewers]);
  const totalPanelists = useMemo(
    () => vendorIds.length
      ? activeInterviewers.filter(u => u.vendorId && vendorIds.includes(u.vendorId)).length
      : activeInterviewers.length,
    [activeInterviewers, vendorIds]
  );

  // ── Aggregation — one pass builds the overall KPI totals, a second
  // groups the SAME filtered interviews by vendor or by panelist for the
  // comparison table. Both read from `filtered`, so the table's own totals
  // always reconcile exactly with the KPI cards above it. ──────────────
  const aggregateTotals = (list) => {
    const acc = emptyCounts();
    list.forEach(iv => bumpCounts(acc, iv));
    return withRates(acc);
  };
  const totals     = useMemo(() => aggregateTotals(filtered),     [filtered]);
  const prevTotals = useMemo(() => aggregateTotals(filteredPrev), [filteredPrev]);

  const groupRows = (list, keyOf, nameOf, extra) => {
    const map = new Map();
    list.forEach(iv => {
      const key = keyOf(iv);
      if (!map.has(key)) map.set(key, { key, name: nameOf(iv, key), ...emptyCounts() });
      bumpCounts(map.get(key), iv);
    });
    return [...map.values()].map(r => ({ ...withRates(r), ...(extra ? extra(r) : {}) }));
  };

  const vendorRows = useMemo(() => groupRows(
    filtered,
    iv => iv.vendorId || NO_VENDOR_ID,
    (iv, key) => vendorNameOf(key === NO_VENDOR_ID ? null : key),
    (r) => ({ panelists: panelistsByVendor.get(r.key) || 0 })
  ), [filtered, panelistsByVendor, vendorsById]); // eslint-disable-line

  const panelistRows = useMemo(() => groupRows(
    filtered,
    iv => iv.interviewerEmail || "(unknown)",
    (iv, key) => iv.interviewerName || usersByEmail.get(key)?.displayName || key,
    (r) => ({ vendorName: vendorNameOf(usersByEmail.get(r.key)?.vendorId) })
  ), [filtered, usersByEmail, vendorsById]); // eslint-disable-line

  const allRows = compareBy === "vendor" ? vendorRows : panelistRows;

  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r => r.name.toLowerCase().includes(q));
  }, [allRows, search]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...searchedRows].sort((a, b) => {
      const av = sortBy === "panelists" ? (a.panelists ?? 0) : a[sortBy];
      const bv = sortBy === "panelists" ? (b.panelists ?? 0) : b[sortBy];
      return (av - bv) * dir;
    });
  }, [searchedRows, sortBy, sortDir]);

  const rowsPagination = usePagination(sortedRows, 10);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const handleExport = () => {
    const base = ["Scheduled", "Completed", "Partially Completed", "Rescheduled", "Cancelled by Admin", "Cancelled by Student", "Cancelled by Interviewer", "No-Show", "Declined", "Completion Rate", "Cancellation Rate", "No-Show Rate"];
    const headers = compareBy === "vendor" ? ["Vendor", "Panelists", ...base] : ["Panelist", "Vendor", ...base];
    const toRow = (r) => [
      r.name, ...(compareBy === "vendor" ? [r.panelists] : [r.vendorName]),
      r.scheduled, r.completed, r.partiallyCompleted, r.rescheduled,
      r.cancelledAdmin, r.cancelledStudent, r.cancelledInterviewer, r.noShow, r.declined,
      `${r.completionRate.toFixed(1)}%`, `${r.cancellationRate.toFixed(1)}%`, `${r.noShowRate.toFixed(1)}%`,
    ];
    const rows = sortedRows.map(toRow);
    rows.push(["Total", compareBy === "vendor" ? totalPanelists : "—",
      totals.scheduled, totals.completed, totals.partiallyCompleted, totals.rescheduled,
      totals.cancelledAdmin, totals.cancelledStudent, totals.cancelledInterviewer, totals.noShow, totals.declined,
      `${totals.completionRate.toFixed(1)}%`, `${totals.cancellationRate.toFixed(1)}%`, `${totals.noShowRate.toFixed(1)}%`]);
    exportVendorAnalytics(headers, rows, `vendor_analytics_${compareBy}`);
  };

  const hasFilters = vendorIds.length || programIds.length || templateIds.length || statuses.length || durations.length || search;
  const clearFilters = () => { setVendorIds([]); setProgramIds([]); setTemplateIds([]); setStatuses([]); setDurations([]); setSearch(""); };

  // Only "admin" — not content_team/interviewer_content, who DO get the
  // rest of the admin area via ADMIN_ROLES — sees this consolidated
  // cross-vendor view. Checked here, not just by hiding the sidebar link,
  // since the route itself is reachable by anyone AdminGuard lets into
  // /admin/* at all.
  if (userProfile?.role !== "admin") {
    return (
      <div className="p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Lock className="w-8 h-8 text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-600">Admins only</p>
        <p className="text-xs text-gray-400 mt-1">Vendor Analytics isn't available for your role.</p>
      </div>
    );
  }

  const KPI_CARDS = [
    { key: "scheduled",            label: "Total Scheduled",      icon: CalendarClock, color: "text-gray-900",    iconBg: "bg-gray-100",    value: totals.scheduled,            prev: prevTotals.scheduled },
    { key: "panelists",            label: "Total Panelists",      icon: Users,         color: "text-brand-600",   iconBg: "bg-brand-50",    value: totalPanelists,              prev: null },
    { key: "completed",            label: "Completed",            icon: CheckCircle2,  color: "text-emerald-600", iconBg: "bg-emerald-50",  value: totals.completed,            prev: prevTotals.completed },
    { key: "partiallyCompleted",   label: "Partially Completed",  icon: Hourglass,     color: "text-sky-600",     iconBg: "bg-sky-50",      value: totals.partiallyCompleted,   prev: prevTotals.partiallyCompleted },
    { key: "rescheduled",          label: "Rescheduled",          icon: RefreshCw,     color: "text-violet-600",  iconBg: "bg-violet-50",   value: totals.rescheduled,           prev: prevTotals.rescheduled },
    { key: "cancelledAdmin",       label: "Cancelled by Admin",   icon: XCircle,       color: "text-amber-600",   iconBg: "bg-amber-50",    value: totals.cancelledAdmin,        prev: prevTotals.cancelledAdmin },
    { key: "cancelledStudent",     label: "Cancelled by Student", icon: UserMinus,     color: "text-amber-600",   iconBg: "bg-amber-50",    value: totals.cancelledStudent,      prev: prevTotals.cancelledStudent },
    { key: "cancelledInterviewer", label: "Cancelled by Panelist",icon: UserX,         color: "text-amber-600",   iconBg: "bg-amber-50",    value: totals.cancelledInterviewer,  prev: prevTotals.cancelledInterviewer },
    { key: "noShow",               label: "No-Shows",             icon: AlertTriangle, color: "text-red-600",     iconBg: "bg-red-50",      value: totals.noShow,                prev: prevTotals.noShow },
    { key: "declined",             label: "Declined",             icon: X,             color: "text-red-600",     iconBg: "bg-red-50",      value: totals.declined,              prev: prevTotals.declined },
  ];

  const sortLabel = SORT_OPTIONS.find(s => s.id === sortBy)?.name || sortBy;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <PieChart className="w-5 h-5 text-brand-500" /> Vendor Analytics
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-1.5">
          Compare every vendor's interview performance from one screen —
          <span className="inline-flex items-center gap-1 font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
            {PERIOD_LABEL[period]} · {range.from === range.to ? formatRangeDate(range.from) : `${formatRangeDate(range.from)} – ${formatRangeDate(range.to)}`}
          </span>
        </p>
      </motion.div>

      {/* ── Period toggle ── */}
      <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-full mb-4 w-fit max-w-full overflow-x-auto scrollbar-thin">
        {[["week", "Weekly"], ["month", "Monthly"], ["overall", "Overall"], ["custom", "Custom"]].map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${
              period === id ? "bg-white text-brand-600 shadow-card" : "text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <DatePicker value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <span className="text-gray-400 text-sm">–</span>
          <DatePicker value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {KPI_CARDS.map((c, i) => {
          const d = hasPrevPeriod ? delta(c.value, c.prev) : null;
          return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{c.label}</p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
                  <c.icon className={`w-4 h-4 ${c.color}`} strokeWidth={2} />
                </div>
              </div>
              <p className={`text-2xl font-bold mt-1.5 ${c.color}`}>{c.value}</p>
              {d && (
                <p className={`text-[11px] mt-0.5 font-medium ${d.positive === null ? "text-gray-400" : d.positive ? "text-emerald-600" : "text-red-500"}`}>
                  {d.label}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-52">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vendor</label>
            <SkillsSelect skills={vendorOptions} value={vendorIds} onChange={setVendorIds} placeholder="All Vendors" searchPlaceholder="Search vendors…" />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Program</label>
            <SkillsSelect skills={programOptions} value={programIds} onChange={setProgramIds} placeholder="All Programs" searchPlaceholder="Search programs…" />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Template</label>
            <SkillsSelect skills={templateOptions} value={templateIds} onChange={setTemplateIds} placeholder="All Templates" searchPlaceholder="Search templates…" />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interview Status</label>
            <SkillsSelect skills={STATUS_OPTIONS} value={statuses} onChange={setStatuses} placeholder="All Statuses" searchPlaceholder="Search statuses…" />
          </div>
          <div className="w-full sm:w-36">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
            <SkillsSelect skills={durationOptions} value={durations} onChange={setDurations} placeholder="All Durations" searchPlaceholder="Search durations…" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-2 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <button onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── Compare-by toggle + search + sort ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-full w-fit">
          {[["vendor", "Compare by Vendor"], ["panelist", "Compare by Panelist"]].map(([id, label]) => (
            <button key={id} onClick={() => setCompareBy(id)}
              className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${
                compareBy === id ? "bg-white text-brand-600 shadow-card" : "text-gray-500 hover:text-gray-700"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={compareBy === "vendor" ? "Search vendor…" : "Search panelist…"}
          className="border border-gray-200 rounded-full px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-52" />
        <div className="w-full sm:w-44 sm:ml-auto">
          <SkillsSelect skills={SORT_OPTIONS} value={sortBy ? [sortBy] : []}
            onChange={(ids) => setSortBy(ids[ids.length - 1] || "scheduled")}
            placeholder={`Sort: ${sortLabel}`} />
        </div>
        <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5" /> {sortDir === "desc" ? "High → Low" : "Low → High"}
        </button>
      </div>

      {/* ── Comparison table ── */}
      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden">
        {rowsPagination.paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <PieChart className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm text-gray-400">
              {search ? `No ${compareBy === "vendor" ? "vendor" : "panelist"} matches "${search}".` : "No interviews match the current filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="sticky left-0 bg-white text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 z-10">
                    {compareBy === "vendor" ? "Vendor" : "Panelist"}
                  </th>
                  {compareBy === "vendor" ? (
                    <SortableHeader field="panelists" label="Panelists" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  ) : (
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Vendor</th>
                  )}
                  <SortableHeader field="scheduled" label="Scheduled" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHeader field="completed" label="Completed" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Partial</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Rescheduled</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Cancelled (A/S/I)</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">No-Show</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Declined</th>
                  <SortableHeader field="completionRate" label="Completion" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableHeader field="cancellationRate" label="Cancel Rate" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableHeader field="noShowRate" label="No-Show Rate" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rowsPagination.paged.map((r, idx) => {
                  // Simple, explainable thresholds — not a scored ranking,
                  // just a quick visual flag for "look at this one."
                  const strong = r.scheduled >= 5 && r.completionRate >= 80;
                  const weak   = r.scheduled >= 5 && (r.cancellationRate >= 20 || r.noShowRate >= 15);
                  return (
                    <tr key={r.key}
                      className={`transition-colors ${strong ? "bg-emerald-50/40" : weak ? "bg-red-50/40" : idx % 2 === 1 ? "bg-gray-50/40" : "bg-white"} hover:bg-gray-100/60`}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {r.name}
                        {strong && <span className="ml-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full align-middle">Strong</span>}
                        {weak && <span className="ml-1.5 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full align-middle">Needs attention</span>}
                      </td>
                      {compareBy === "vendor" ? (
                        <td className="px-4 py-3 text-right text-gray-700">{r.panelists}</td>
                      ) : (
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.vendorName}</td>
                      )}
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{r.scheduled}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{r.completed}</td>
                      <td className="px-4 py-3 text-right text-sky-600">{r.partiallyCompleted}</td>
                      <td className="px-4 py-3 text-right text-violet-600">{r.rescheduled}</td>
                      <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">{r.cancelledAdmin}/{r.cancelledStudent}/{r.cancelledInterviewer}</td>
                      <td className="px-4 py-3 text-right text-red-500">{r.noShow}</td>
                      <td className="px-4 py-3 text-right text-red-500">{r.declined}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{pct(r.completionRate)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{pct(r.cancellationRate)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{pct(r.noShowRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-bold">
                  <td className="sticky left-0 bg-gray-50 px-4 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-gray-700">{compareBy === "vendor" ? totalPanelists : "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{totals.scheduled}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{totals.completed}</td>
                  <td className="px-4 py-3 text-right text-sky-600">{totals.partiallyCompleted}</td>
                  <td className="px-4 py-3 text-right text-violet-600">{totals.rescheduled}</td>
                  <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">{totals.cancelledAdmin}/{totals.cancelledStudent}/{totals.cancelledInterviewer}</td>
                  <td className="px-4 py-3 text-right text-red-500">{totals.noShow}</td>
                  <td className="px-4 py-3 text-right text-red-500">{totals.declined}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{pct(totals.completionRate)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{pct(totals.cancellationRate)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{pct(totals.noShowRate)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pagination page={rowsPagination.page} totalPages={rowsPagination.totalPages} total={rowsPagination.total} pageSize={rowsPagination.pageSize} onPageChange={rowsPagination.setPage} />
      </div>
    </div>
  );
}

function SortableHeader({ field, label, sortBy, sortDir, onSort, align = "right" }) {
  const active = sortBy === field;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={() => onSort(field)}
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${
          align === "right" ? "ml-auto" : ""} ${active ? "text-brand-600" : "text-gray-400 hover:text-gray-600"}`}>
        {label}
        <ArrowUpDown className="w-3 h-3" />
        {active && <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}
