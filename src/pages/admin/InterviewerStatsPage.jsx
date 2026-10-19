import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, X, BarChart3, Trophy, Medal, Award } from "lucide-react";
import { useInterviewsInDateRange } from "../../hooks/subscriptions";
import { useTemplates, usePrograms, useUsers, useVendors } from "../../hooks/queries";
import { exportInterviewerStats } from "../../utils/interviewerStatsExport";
import SkillsSelect from "../../components/SkillsSelect";

// Defaults the report to the current month instead of reading the entire
// interviews collection on every visit — same "scope by default" pattern as
// the admin Interviews page. Widen the Start/End Date fields for a longer
// report; clearing them snaps back to this default rather than going
// unbounded.
function todayIso() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
// This ISO week (Monday–Sunday) and this calendar month, both containing
// "today" — used by the Leaderboard view's Weekly/Monthly toggle, same
// pattern as the vendor dashboard's own leaderboard.
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}
function thisMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}
// First name kept, everything after it masked — e.g. "Kopal Rastogi" ->
// "Kopal *****" — so the leaderboard (visible dashboard-wide, not just to
// the interviewer's own vendor) doesn't expose full interviewer identities.
function maskName(fullName) {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(/\s+/);
  return parts.length <= 1 ? parts[0] : `${parts[0]} *****`;
}

// The only statuses this report counts — a candidate's still-pending/
// scheduled interviews aren't meaningful here, so they're excluded from
// the stats entirely (not just hidden behind an empty filter). "declined"
// IS counted (unlike pending/scheduled) since it's a real interviewer
// action worth tracking per-interviewer, same as the other outcomes here.
const STATUS_OPTIONS = [
  { id: "completed",           name: "Completed" },
  { id: "partially_completed", name: "Partially Completed" },
  { id: "cancelled",           name: "Cancelled" },
  { id: "no_show",             name: "Student No-show" },
  { id: "declined",            name: "Declined" },
];
const RELEVANT_STATUSES = STATUS_OPTIONS.map(s => s.id);

const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

export default function InterviewerStatsPage() {
  const [view, setView] = useState("stats");
  const [dateFrom,     setDateFrom]     = useState(firstOfMonthIso());
  const [dateTo,       setDateTo]       = useState(todayIso());
  const interviews       = useInterviewsInDateRange(dateFrom, dateTo);
  const { data: templates = [] } = useTemplates();
  const { data: programs  = [] } = usePrograms();
  const { data: usersAll  = [] } = useUsers();
  const { data: vendors   = [] } = useVendors();

  // Leaderboard — its own Weekly/Monthly window, independent of the Stats
  // tab's date filter above, and ranks every active interviewer across
  // every vendor (no vendor filter here, unlike the Stats table).
  const [leaderboardPeriod, setLeaderboardPeriod] = useState("week");
  const leaderboardRange = leaderboardPeriod === "week" ? thisWeekRange() : thisMonthRange();
  const leaderboardInterviews = useInterviewsInDateRange(leaderboardRange.from, leaderboardRange.to);

  const [programIds,   setProgramIds]   = useState([]);
  const [statuses,     setStatuses]     = useState([]);
  const [templateIds,  setTemplateIds]  = useState([]);
  const [interviewerEmails, setInterviewerEmails] = useState([]);
  const [vendorIds,    setVendorIds]    = useState([]);
  const [durations,    setDurations]    = useState([]);

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
  const vendorOptions = useMemo(
    () => vendors.map(v => ({ id: v.id, name: v.name })),
    [vendors]
  );
  // Distinct durations actually scheduled — not hardcoded, so a new
  // duration (e.g. 45m) shows up here the moment it's used anywhere.
  // Interviews without a duration fall back to 60 (matches every other
  // read site's "iv.duration || 60" convention).
  const durationOptions = useMemo(() => {
    const set = new Set(interviews.map(iv => iv.duration || 60));
    return [...set].sort((a, b) => a - b).map(d => ({ id: String(d), name: `${d} mins` }));
  }, [interviews]);

  // An interview only carries interviewerEmail, not who that interviewer's
  // vendor is — resolved via the same usersByEmail lookup used for the
  // Interviewer column, so the Vendor filter (and its priorSessions
  // crediting below) works off the interviewer's CURRENT vendor assignment.
  const emailBelongsToVendor = (email) => {
    if (!vendorIds.length) return true;
    const vId = usersByEmail.get(email)?.vendorId;
    return !!vId && vendorIds.includes(vId);
  };

  const filtered = useMemo(() => {
    const effectiveStatuses = statuses.length ? statuses : RELEVANT_STATUSES;
    return interviews.filter(iv => {
      if (!effectiveStatuses.includes(iv.status)) return false;
      if (dateFrom && iv.scheduledDate < dateFrom) return false;
      if (dateTo   && iv.scheduledDate > dateTo)   return false;
      if (programIds.length && !programIds.includes(templateProgramById.get(iv.templateId))) return false;
      if (templateIds.length && !templateIds.includes(iv.templateId)) return false;
      if (interviewerEmails.length && !interviewerEmails.includes(iv.interviewerEmail)) return false;
      if (!emailBelongsToVendor(iv.interviewerEmail)) return false;
      if (durations.length && !durations.includes(String(iv.duration || 60))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, dateFrom, dateTo, programIds, statuses, templateIds, interviewerEmails, vendorIds, durations, templateProgramById, usersByEmail]);

  // Every count column gets its own per-duration breakdown, keyed by
  // minutes (e.g. { 60: 2, 90: 4 }) — Completed and Completed (Resumed)
  // are tracked separately since they're already separate payment buckets.
  const COUNT_FIELDS = ["completed", "completedResumed", "partiallyCompleted", "cancelled", "noShow", "declined"];

  const getRow = (map, email, name) => {
    if (!map.has(email)) {
      const row = { email, name };
      COUNT_FIELDS.forEach(f => { row[f] = 0; row[`${f}ByDuration`] = {}; });
      map.set(email, row);
    }
    return map.get(email);
  };

  const bump = (row, field, duration) => {
    row[field]++;
    const d = duration || 60;
    const byDur = row[`${field}ByDuration`];
    byDur[d] = (byDur[d] || 0) + 1;
  };

  // "60m: 2, 90m: 4" always shows which duration(s) the count is made up of
  // — previously collapsed to a bare number ("1") whenever a panelist's
  // count for this column only spanned one duration, which left it
  // ambiguous whether that single interview was 60 or 90 minutes.
  const formatBreakdownCell = (count, byDuration) => {
    const entries = Object.entries(byDuration).filter(([, n]) => n > 0).sort(([a], [b]) => Number(a) - Number(b));
    if (entries.length === 0) return String(count);
    return entries.map(([mins, n]) => `${mins}m: ${n}`).join(", ");
  };

  const withDisplays = (row) => {
    const out = { ...row };
    COUNT_FIELDS.forEach(f => { out[`${f}Display`] = formatBreakdownCell(row[f], row[`${f}ByDuration`]); });
    return out;
  };

  const interviewerStats = useMemo(() => {
    const map = new Map();
    const effectiveStatuses = statuses.length ? statuses : RELEVANT_STATUSES;

    filtered.forEach(iv => {
      const key = iv.interviewerEmail || "(unknown)";
      const userRec = usersByEmail.get(iv.interviewerEmail);
      const row = getRow(map, key, iv.interviewerName || userRec?.displayName || key);
      if (iv.status === "completed") {
        // resumedFromPartial marks a Completed interview that was finished
        // off after at least one earlier Partially Completed session —
        // kept out of the plain Completed count so it's never mistaken for
        // a full interview at payment time (see Panelist Interview Count).
        if (iv.resumedFromPartial) bump(row, "completedResumed", iv.duration);
        else bump(row, "completed", iv.duration);
      }
      else if (iv.status === "partially_completed") bump(row, "partiallyCompleted", iv.duration);
      else if (iv.status === "cancelled") bump(row, "cancelled", iv.duration);
      else if (iv.status === "no_show") bump(row, "noShow", iv.duration);
      else if (iv.status === "declined") bump(row, "declined", iv.duration);
    });

    // A resumed interview's earlier session(s) live only in priorSessions,
    // under whichever interviewer ran them — which can differ from the
    // interview's CURRENT (top-level) interviewer once reassigned. Without
    // this, that panelist's partial-completion work would simply vanish
    // from the stats the moment the interview moves on to someone else.
    if (effectiveStatuses.includes("partially_completed")) {
      interviews.forEach(iv => {
        (iv.priorSessions || []).forEach(s => {
          if (!s.scheduledDate) return;
          if (dateFrom && s.scheduledDate < dateFrom) return;
          if (dateTo   && s.scheduledDate > dateTo)   return;
          if (programIds.length && !programIds.includes(templateProgramById.get(iv.templateId))) return;
          if (templateIds.length && !templateIds.includes(iv.templateId)) return;
          if (interviewerEmails.length && !interviewerEmails.includes(s.interviewerEmail)) return;
          if (!emailBelongsToVendor(s.interviewerEmail)) return;
          if (durations.length && !durations.includes(String(s.duration || 60))) return;
          const key = s.interviewerEmail || "(unknown)";
          const userRec = usersByEmail.get(s.interviewerEmail);
          const row = getRow(map, key, s.interviewerName || userRec?.displayName || key);
          bump(row, "partiallyCompleted", s.duration);
        });
      });
    }

    return [...map.values()]
      .map(withDisplays)
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, interviews, usersByEmail, statuses, dateFrom, dateTo, programIds, templateIds, interviewerEmails, vendorIds, durations, templateProgramById]);

  const totals = useMemo(() => {
    const acc = { email: "", name: "" };
    COUNT_FIELDS.forEach(f => { acc[f] = 0; acc[`${f}ByDuration`] = {}; });
    interviewerStats.forEach(r => {
      COUNT_FIELDS.forEach(f => {
        acc[f] += r[f];
        Object.entries(r[`${f}ByDuration`]).forEach(([d, n]) => {
          acc[`${f}ByDuration`][d] = (acc[`${f}ByDuration`][d] || 0) + n;
        });
      });
    });
    return withDisplays(acc);
  }, [interviewerStats]);

  // Ranked by COMPLETED interviews (actual work done) in the period — total
  // (every status) shown alongside as secondary context, not the ranking
  // metric itself, so a panelist with a lot of no-shows/cancellations
  // doesn't outrank one who actually completed more interviews. Same
  // ranking rule as the vendor dashboard's own leaderboard.
  const leaderboardRanked = useMemo(() => {
    const activeInterviewers = usersAll.filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active");
    return activeInterviewers
      .map(ivr => {
        const ivrInterviews = leaderboardInterviews.filter(iv => iv.interviewerEmail === ivr.email);
        const completed = ivrInterviews.filter(iv => ["completed", "partially_completed"].includes(iv.status)).length;
        return { interviewer: ivr, completed, total: ivrInterviews.length };
      })
      .sort((a, b) => b.completed - a.completed || b.total - a.total);
  }, [usersAll, leaderboardInterviews]);

  const hasFilters = dateFrom !== firstOfMonthIso() || dateTo !== todayIso() ||
    programIds.length || statuses.length || templateIds.length || interviewerEmails.length || vendorIds.length || durations.length;
  const clearFilters = () => {
    setDateFrom(firstOfMonthIso()); setDateTo(todayIso());
    setProgramIds([]); setStatuses([]); setTemplateIds([]); setInterviewerEmails([]); setVendorIds([]); setDurations([]);
  };

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interviewer Statistics</h1>
          <p className="text-sm text-gray-500 mt-1">
            {view === "stats"
              ? `Interviewer-wise interview counts by status (${dateFrom} – ${dateTo}) — widen the date range below for a longer report`
              : "Ranked by completed interviews across every vendor — names shown first-name-only for privacy"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {[["stats", "Stats", BarChart3], ["leaderboard", "Leaderboard", Trophy]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  view === id ? "bg-white text-brand-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {view === "stats" && (
            <button onClick={() => exportInterviewerStats(interviewerStats, totals)} disabled={interviewerStats.length === 0}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          )}
        </div>
      </motion.div>

      {view === "leaderboard" ? (() => {
        const RANK_STYLE = [
          { icon: Trophy, badge: "bg-gradient-to-br from-amber-400 to-yellow-500 text-white", card: "border-amber-200 bg-amber-50/60" },
          { icon: Medal,  badge: "bg-gradient-to-br from-gray-300 to-gray-400 text-white",    card: "border-gray-200 bg-gray-50/60" },
          { icon: Award,  badge: "bg-gradient-to-br from-orange-400 to-amber-700 text-white", card: "border-orange-200 bg-orange-50/40" },
        ];
        return (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 bg-gray-100 rounded-xl p-1 w-fit mx-auto">
                {[["week", "Weekly"], ["month", "Monthly"]].map(([id, label]) => (
                  <button key={id} onClick={() => setLeaderboardPeriod(id)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      leaderboardPeriod === id ? "bg-white text-orange-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">{leaderboardRange.from} – {leaderboardRange.to}</p>
            </div>

            {leaderboardRanked.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-14">
                <Trophy className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No active interviewers yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {leaderboardRanked.map((row, i) => {
                  const style = RANK_STYLE[i];
                  const RankIcon = style?.icon;
                  return (
                    <div key={row.interviewer.id} className={`bg-white rounded-2xl border border-gray-100 shadow-soft p-4 flex items-center gap-4 ${style?.card || ""}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                        style ? style.badge : "bg-gray-100 text-gray-500"
                      }`}>
                        {RankIcon ? <RankIcon className="w-5 h-5" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{maskName(row.interviewer.displayName) || row.interviewer.email}</p>
                        <p className="text-xs text-gray-400">{row.total} total interview{row.total !== 1 ? "s" : ""} this {leaderboardPeriod}</p>
                      </div>
                      <div className="text-center flex-shrink-0 w-16">
                        <p className="text-xl font-bold text-emerald-600">{row.completed}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Completed</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })() : (
      <>
      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value || firstOfMonthIso())} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value || todayIso())} className={inputCls} />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Program</label>
            <SkillsSelect skills={programOptions} value={programIds} onChange={setProgramIds} placeholder="All Programs" searchPlaceholder="Search programs…" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Template</label>
            <SkillsSelect skills={templateOptions} value={templateIds} onChange={setTemplateIds} placeholder="All Templates" searchPlaceholder="Search templates…" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interviewer</label>
            <SkillsSelect skills={interviewerOptions} value={interviewerEmails} onChange={setInterviewerEmails} placeholder="All Interviewers" searchPlaceholder="Search interviewers…" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vendor</label>
            <SkillsSelect skills={vendorOptions} value={vendorIds} onChange={setVendorIds} placeholder="All Vendors" searchPlaceholder="Search vendors…" />
          </div>
          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interviewer Status</label>
            <SkillsSelect skills={STATUS_OPTIONS} value={statuses} onChange={setStatuses} placeholder="All (Completed, Partially Completed, Cancelled, No-show)" searchPlaceholder="Search statuses…" />
          </div>
          <div className="w-44">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
            <SkillsSelect skills={durationOptions} value={durations} onChange={setDurations} placeholder="All Durations" searchPlaceholder="Search durations…" />
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
                {["Interviewer", "Completed", "Completed (Resumed)", "Partially Completed", "Cancelled", "Student No-show", "Declined"].map((h, i) => (
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
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold whitespace-nowrap">{r.completedDisplay}</td>
                  <td className="px-4 py-3 text-right text-sky-700 font-semibold whitespace-nowrap" title="Finished off a Partially Completed interview — not a full interview, kept separate for payment purposes">{r.completedResumedDisplay}</td>
                  <td className="px-4 py-3 text-right text-amber-700 font-semibold whitespace-nowrap">{r.partiallyCompletedDisplay}</td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{r.cancelledDisplay}</td>
                  <td className="px-4 py-3 text-right text-orange-600 whitespace-nowrap">{r.noShowDisplay}</td>
                  <td className="px-4 py-3 text-right text-red-600 whitespace-nowrap">{r.declinedDisplay}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                <td className="px-4 py-3 font-bold text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">{totals.completedDisplay}</td>
                <td className="px-4 py-3 text-right font-bold text-sky-700 whitespace-nowrap">{totals.completedResumedDisplay}</td>
                <td className="px-4 py-3 text-right font-bold text-amber-700 whitespace-nowrap">{totals.partiallyCompletedDisplay}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-500 whitespace-nowrap">{totals.cancelledDisplay}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-600 whitespace-nowrap">{totals.noShowDisplay}</td>
                <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">{totals.declinedDisplay}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </motion.div>
      </>
      )}
    </div>
  );
}
