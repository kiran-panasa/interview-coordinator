import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2, BarChart3 } from "lucide-react";
import { useTemplates, usePrograms, QK } from "../../hooks/queries";
import { updateTemplate } from "../../api/firestore";
import { Skeleton } from "../Skeleton";
import { DEFAULT_HIDDEN_SCORE_MESSAGE, DEFAULT_NO_SHOW_LIMIT, DEFAULT_CANCEL_LIMIT, DEFAULT_SELF_BOOK_WINDOW_DAYS } from "../../constants/templateAttempts";
import { RUBRIC_OPTIONS } from "../../constants/panelistAuditRubricDefaults";
import ScoringRulesModal from "../../features/templates/ScoringRulesModal";

// Three states, student visibility is the only thing any of them touch —
// see the `status` field's comment in types.ts. Nothing here ever affects
// admin-side visibility (Templates/Nudge/Interviews always show and let
// you manage every template regardless of status) or any interview
// already scheduled/completed on it.
const STATUS_OPTIONS = [
  {
    value: "active",
    label: "Active",
    text: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    desc: "Normal, bookable state — shows in a candidate's Eligible Interviews and Self Book list. The default.",
  },
  {
    value: "draft",
    label: "Draft",
    text: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    desc: "Hidden from students. Use while still building/configuring a template that isn't ready to assign yet.",
  },
  {
    value: "archived",
    label: "Archived",
    text: "text-gray-600",
    bg: "bg-gray-100 border-gray-200",
    dot: "bg-gray-400",
    desc: "Hidden from students. Use to retire/pause a template that WAS running.",
  },
];
const STATUS_BY_VALUE = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o]));

// 0 = Sunday, matching Date.getUTCDay()/selfBookCycleAnchorWeekday and
// computeFixedCycleWindow in src/utils/selfBookWindow.js.
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TemplateLifecycleTab() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: programs  = [] } = usePrograms();

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [savedId,  setSavedId]  = useState(null);
  // Local drafts for the two free-typed fields — only committed on blur,
  // so an in-progress keystroke (especially in the number input, where an
  // empty/partial value mid-edit is normal) never gets written to
  // Firestore as a half-finished value.
  const [maxAttemptsDraft, setMaxAttemptsDraft] = useState({});
  const [messageDraft,     setMessageDraft]     = useState({});
  const [scoreMessageDraft, setScoreMessageDraft] = useState({});
  const [maxNoShowsDraft,   setMaxNoShowsDraft]   = useState({});
  const [noShowMessageDraft, setNoShowMessageDraft] = useState({});
  const [maxCancelsDraft,   setMaxCancelsDraft]   = useState({});
  const [cancelMessageDraft, setCancelMessageDraft] = useState({});
  const [windowDaysDraft,  setWindowDaysDraft]  = useState({});
  const [scoringModalTemplate, setScoringModalTemplate] = useState(null);

  const programName = (id) => programs.find(p => p.id === id)?.name || "";
  const statusOf = (t) => t.status || "active";
  const maxAttemptsOf = (t) => maxAttemptsDraft[t.id] ?? (t.maxAttempts != null ? String(t.maxAttempts) : "");
  const messageOf     = (t) => messageDraft[t.id] ?? (t.attemptLimitMessage || "");
  const showAiReportOf   = (t) => t.showAiReportToStudent !== false;
  const showFinalScoreOf = (t) => t.showFinalScoreToStudent !== false;
  const scoreMessageOf   = (t) => scoreMessageDraft[t.id] ?? (t.hiddenScoreMessage || "");
  const maxNoShowsOf     = (t) => maxNoShowsDraft[t.id] ?? (t.maxNoShows != null ? String(t.maxNoShows) : "");
  const noShowMessageOf  = (t) => noShowMessageDraft[t.id] ?? (t.noShowBlockedMessage || "");
  const maxCancelsOf     = (t) => maxCancelsDraft[t.id] ?? (t.maxCancellations != null ? String(t.maxCancellations) : "");
  const cancelMessageOf  = (t) => cancelMessageDraft[t.id] ?? (t.cancelBlockedMessage || "");
  const windowDaysOf     = (t) => windowDaysDraft[t.id] ?? (t.selfBookWindowDays != null ? String(t.selfBookWindowDays) : "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter(t => !programFilter || t.program === programFilter)
      .filter(t => !statusFilter || statusOf(t) === statusFilter)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search, programFilter, statusFilter]);

  const saveTemplate = async (t, data) => {
    setSavingId(t.id);
    setSavedId(null);
    try {
      await updateTemplate(t.id, data);
      queryClient.invalidateQueries({ queryKey: QK.templates });
      setSavedId(t.id);
      setTimeout(() => setSavedId(id => (id === t.id ? null : id)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const handleChangeStatus = (t, status) => {
    if (statusOf(t) === status) return;
    saveTemplate(t, { status });
  };

  // Which panelist-conduct audit rubric this template's completed
  // interviews get checked against (api/_lib/panelistAuditRubrics.js) —
  // "" means none assigned, so no audit is ever generated for this
  // template. Saves immediately on change, same as Status, since it's a
  // fixed choice from a short list, not free text needing a draft/blur.
  const handleChangeAuditRubric = (t, auditRubricKey) => {
    if ((t.auditRubricKey || "") === auditRubricKey) return;
    saveTemplate(t, { auditRubricKey: auditRubricKey || null });
  };

  const commitMaxAttempts = (t) => {
    const raw = maxAttemptsOf(t).trim();
    const next = raw === "" ? null : Math.max(1, Math.round(Number(raw)) || 1);
    setMaxAttemptsDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.maxAttempts ?? null)) return;
    saveTemplate(t, { maxAttempts: next });
  };

  const commitMessage = (t) => {
    const next = messageOf(t).trim();
    setMessageDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.attemptLimitMessage || "")) return;
    saveTemplate(t, { attemptLimitMessage: next });
  };

  const handleChangeShowAiReport = (t, showAiReport) => {
    if (showAiReportOf(t) === showAiReport) return;
    saveTemplate(t, { showAiReportToStudent: showAiReport });
  };

  const handleChangeShowFinalScore = (t, showFinalScore) => {
    if (showFinalScoreOf(t) === showFinalScore) return;
    saveTemplate(t, { showFinalScoreToStudent: showFinalScore });
  };

  const commitScoreMessage = (t) => {
    const next = scoreMessageOf(t).trim();
    setScoreMessageDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.hiddenScoreMessage || "")) return;
    saveTemplate(t, { hiddenScoreMessage: next });
  };

  // Blank -> null ("use the platform default of DEFAULT_NO_SHOW_LIMIT" —
  // unlike Attempt Limit, blank here is NOT unlimited). Typing 0 is how an
  // admin explicitly opts a template out of the no-show block entirely.
  const commitMaxNoShows = (t) => {
    const raw = maxNoShowsOf(t).trim();
    const next = raw === "" ? null : Math.max(0, Math.round(Number(raw)) || 0);
    setMaxNoShowsDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.maxNoShows ?? null)) return;
    saveTemplate(t, { maxNoShows: next });
  };

  const commitNoShowMessage = (t) => {
    const next = noShowMessageOf(t).trim();
    setNoShowMessageDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.noShowBlockedMessage || "")) return;
    saveTemplate(t, { noShowBlockedMessage: next });
  };

  // Same blank -> null ("use the platform default of DEFAULT_CANCEL_LIMIT")
  // shape as commitMaxNoShows above. Typing 0 is how an admin explicitly
  // opts a template out of the cancel block entirely.
  const commitMaxCancels = (t) => {
    const raw = maxCancelsOf(t).trim();
    const next = raw === "" ? null : Math.max(0, Math.round(Number(raw)) || 0);
    setMaxCancelsDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.maxCancellations ?? null)) return;
    saveTemplate(t, { maxCancellations: next });
  };

  const commitCancelMessage = (t) => {
    const next = cancelMessageOf(t).trim();
    setCancelMessageDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.cancelBlockedMessage || "")) return;
    saveTemplate(t, { cancelBlockedMessage: next });
  };

  // Blank -> null ("use the platform default of DEFAULT_SELF_BOOK_WINDOW_DAYS").
  // How many days of slots Self Book / reschedule opens up for this
  // template, from the earliest bookable date — see
  // effectiveSelfBookWindowDays in api/sso-handler.js.
  const commitWindowDays = (t) => {
    const raw = windowDaysOf(t).trim();
    const next = raw === "" ? null : Math.max(1, Math.round(Number(raw)) || 1);
    setWindowDaysDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (next === (t.selfBookWindowDays ?? null)) return;
    saveTemplate(t, { selfBookWindowDays: next });
  };

  // "Rolling" (default/unset) vs "Fixed" — see the selfBookWindowMode
  // comment in types.ts and computeFixedCycleWindow in
  // src/utils/selfBookWindow.js. Switching modes never touches
  // selfBookWindowDays itself — in fixed mode it just means something
  // slightly different (days visible from the weekly anchor, not from
  // tomorrow).
  const windowModeOf = (t) => (t.selfBookWindowMode === "fixed" ? "fixed" : "rolling");
  const anchorWeekdayOf = (t) => (typeof t.selfBookCycleAnchorWeekday === "number" ? t.selfBookCycleAnchorWeekday : 0);
  const handleChangeWindowMode = (t, mode) => {
    if (windowModeOf(t) === mode) return;
    saveTemplate(t, { selfBookWindowMode: mode === "fixed" ? "fixed" : null });
  };
  const handleChangeAnchorWeekday = (t, weekday) => {
    if (anchorWeekdayOf(t) === weekday) return;
    saveTemplate(t, { selfBookCycleAnchorWeekday: weekday });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Lifecycle</h2>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="text-xs border border-gray-200 rounded-full pl-8 pr-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-700 w-56"
          />
        </div>
        <select
          value={programFilter}
          onChange={e => setProgramFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-600 cursor-pointer">
          <option value="">All programs</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-600 cursor-pointer">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-14 text-sm">No templates match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Template", "Program", "Status", "Attempt Limit", "No-Show Limit", "Cancel Limit", "Booking Window", "AI Report & Score", "Panelist Audit Rubric", "Final Score & Status", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => {
                const status = statusOf(t);
                return (
                  <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{t.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {t.program
                        ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{programName(t.program)}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative inline-flex items-center">
                        <span className={`w-1.5 h-1.5 rounded-full absolute left-2.5 pointer-events-none ${STATUS_BY_VALUE[status].dot}`} />
                        <select
                          value={status}
                          onChange={e => handleChangeStatus(t, e.target.value)}
                          title={STATUS_BY_VALUE[status].desc}
                          className={`text-xs font-semibold border rounded-full pl-6 pr-7 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-400 ${STATUS_BY_VALUE[status].bg} ${STATUS_BY_VALUE[status].text}`}>
                          {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top min-w-[18rem] space-y-1.5">
                      {/* Sky when an actual limit is set (this template now
                         restricts booking), plain gray when blank/unlimited —
                         a distinct accent from Status's emerald/amber/gray so
                         the two controls read as clearly different things,
                         not two gray inputs side by side. Not red/rose —
                         this is routine configuration, not a warning. */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={1}
                          value={maxAttemptsOf(t)}
                          onChange={e => setMaxAttemptsDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMaxAttempts(t)}
                          placeholder="Unlimited"
                          className={`w-24 text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 ${
                            maxAttemptsOf(t).trim() !== ""
                              ? "bg-sky-50 border-sky-200 text-sky-700 focus:ring-sky-400"
                              : "bg-white border-gray-200 text-gray-700 focus:ring-brand-400"
                          }`}
                        />
                        <span className="text-[11px] text-gray-400">completed attempt{maxAttemptsOf(t) === "1" ? "" : "s"} max</span>
                      </div>
                      {maxAttemptsOf(t).trim() !== "" && (
                        <textarea
                          rows={2}
                          value={messageOf(t)}
                          onChange={e => setMessageDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMessage(t)}
                          placeholder="Leave blank to use the default message shown to candidates."
                          className="w-full text-xs border border-sky-100 bg-sky-50/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-sky-400 text-gray-700 placeholder:text-gray-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-[14rem] space-y-1.5">
                      {/* Amber, not sky — distinct from Attempt Limit (this
                         one is on by default and actually blocks booking,
                         so it reads as more consequential), still not red
                         since typing a number here is still routine admin
                         config, not itself a danger action. */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={0}
                          value={maxNoShowsOf(t)}
                          onChange={e => setMaxNoShowsDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMaxNoShows(t)}
                          placeholder={`Default (${DEFAULT_NO_SHOW_LIMIT})`}
                          className={`w-24 text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 ${
                            t.maxNoShows === 0
                              ? "bg-white border-gray-200 text-gray-700 focus:ring-brand-400"
                              : "bg-amber-50 border-amber-200 text-amber-700 focus:ring-amber-400"
                          }`}
                        />
                        <span className="text-[11px] text-gray-400">no-show{maxNoShowsOf(t) === "1" ? "" : "s"} max</span>
                      </div>
                      <p className="text-[10px] text-gray-400">0 = no limit for this template. Blank uses the default.</p>
                      {t.maxNoShows !== 0 && (
                        <textarea
                          rows={2}
                          value={noShowMessageOf(t)}
                          onChange={e => setNoShowMessageDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitNoShowMessage(t)}
                          placeholder="Leave blank to use the default message shown to candidates."
                          className="w-full text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-700 placeholder:text-gray-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-[14rem] space-y-1.5">
                      {/* Rose — distinct from Attempt Limit's sky and
                         No-Show Limit's amber. Also on by default and
                         actually blocks booking, same reasoning as No-Show
                         Limit, but kept visually distinct from it since
                         they're two separate counters a candidate could hit
                         independently. */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={0}
                          value={maxCancelsOf(t)}
                          onChange={e => setMaxCancelsDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMaxCancels(t)}
                          placeholder={`Default (${DEFAULT_CANCEL_LIMIT})`}
                          className={`w-24 text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 ${
                            t.maxCancellations === 0
                              ? "bg-white border-gray-200 text-gray-700 focus:ring-brand-400"
                              : "bg-rose-50 border-rose-200 text-rose-700 focus:ring-rose-400"
                          }`}
                        />
                        <span className="text-[11px] text-gray-400">cancel{maxCancelsOf(t) === "1" ? "" : "s"} max</span>
                      </div>
                      <p className="text-[10px] text-gray-400">0 = no limit for this template. Blank uses the default. Only counts the candidate's own cancellations.</p>
                      {t.maxCancellations !== 0 && (
                        <textarea
                          rows={2}
                          value={cancelMessageOf(t)}
                          onChange={e => setCancelMessageDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitCancelMessage(t)}
                          placeholder="Leave blank to use the default message shown to candidates."
                          className="w-full text-xs border border-rose-100 bg-rose-50/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-rose-400 text-gray-700 placeholder:text-gray-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-[13rem] space-y-1.5">
                      {/* Teal — distinct from Attempt Limit's sky and
                         No-Show Limit's amber. Rolling (default) = today's
                         original behavior: N days of slots from the
                         earliest bookable date, sliding forward every day.
                         Fixed = a weekly cycle pinned to a chosen weekday
                         (e.g. "Sunday to Sunday", or "Wednesday to Sunday"
                         by setting the days count below 7) that never
                         slides — see computeFixedCycleWindow. */}
                      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                        <button type="button" onClick={() => handleChangeWindowMode(t, "rolling")}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                            windowModeOf(t) === "rolling" ? "bg-white text-teal-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          }`}>
                          Rolling
                        </button>
                        <button type="button" onClick={() => handleChangeWindowMode(t, "fixed")}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                            windowModeOf(t) === "fixed" ? "bg-white text-teal-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          }`}>
                          Fixed
                        </button>
                      </div>
                      {windowModeOf(t) === "fixed" && (
                        <select
                          value={anchorWeekdayOf(t)}
                          onChange={e => handleChangeAnchorWeekday(t, Number(e.target.value))}
                          className="w-full text-xs font-semibold rounded-lg px-2 py-1.5 border bg-teal-50 border-teal-200 text-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-400">
                          {WEEKDAY_NAMES.map((name, i) => <option key={i} value={i}>Opens {name}</option>)}
                        </select>
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={1}
                          value={windowDaysOf(t)}
                          onChange={e => setWindowDaysDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitWindowDays(t)}
                          placeholder={`Default (${DEFAULT_SELF_BOOK_WINDOW_DAYS})`}
                          className={`w-24 text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 ${
                            windowDaysOf(t).trim() !== ""
                              ? "bg-teal-50 border-teal-200 text-teal-700 focus:ring-teal-400"
                              : "bg-white border-gray-200 text-gray-700 focus:ring-brand-400"
                          }`}
                        />
                        <span className="text-[11px] text-gray-400">
                          day{windowDaysOf(t) === "1" ? "" : "s"} {windowModeOf(t) === "fixed" ? "visible each cycle" : "of slots"}
                        </span>
                      </div>
                      {windowModeOf(t) === "fixed" && (
                        <p className="text-[10px] text-gray-400 leading-snug">
                          e.g. {WEEKDAY_NAMES[anchorWeekdayOf(t)]} + 7 days = full weekly cycle, no gap.
                          A smaller number (e.g. 5 for Wed–Sun) leaves the rest of the week closed until the next {WEEKDAY_NAMES[anchorWeekdayOf(t)]}.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-[16rem] space-y-1.5">
                      {/* Violet — distinct from Status's emerald/amber/gray
                         and Attempt Limit's sky, so all three read as
                         separate controls at a glance. Independent toggles
                         — a template can show the score but keep the AI
                         report back, or vice versa. Never affects Integrity
                         Score, which always stays visible. */}
                      {[
                        { label: "AI Report",   on: showAiReportOf(t),   onChange: v => handleChangeShowAiReport(t, v) },
                        { label: "Final Score", on: showFinalScoreOf(t), onChange: v => handleChangeShowFinalScore(t, v) },
                      ].map(row => (
                        <div key={row.label} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-16 flex-shrink-0">{row.label}</span>
                          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                            <button type="button" onClick={() => row.onChange(true)}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                                row.on ? "bg-white text-violet-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                              }`}>
                              Visible
                            </button>
                            <button type="button" onClick={() => row.onChange(false)}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                                !row.on ? "bg-white text-violet-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                              }`}>
                              Hidden
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!showAiReportOf(t) || !showFinalScoreOf(t)) && (
                        <textarea
                          rows={2}
                          value={scoreMessageOf(t)}
                          onChange={e => setScoreMessageDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitScoreMessage(t)}
                          placeholder={`Leave blank for: "${DEFAULT_HIDDEN_SCORE_MESSAGE}"`}
                          className="w-full text-xs border border-violet-100 bg-violet-50/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 text-gray-700 placeholder:text-gray-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-[14rem]">
                      {/* Teal to match Booking Window's accent family —
                         visually a "config" control like the others, not a
                         warning. Changing it only affects audits generated
                         AFTER the change; anything already generated keeps
                         the rubric it was actually checked against. */}
                      <select
                        value={t.auditRubricKey || ""}
                        onChange={e => handleChangeAuditRubric(t, e.target.value)}
                        className={`w-full text-xs font-semibold rounded-lg px-2 py-1.5 border cursor-pointer focus:outline-none focus:ring-1 ${
                          t.auditRubricKey
                            ? "bg-teal-50 border-teal-200 text-teal-700 focus:ring-teal-400"
                            : "bg-white border-gray-200 text-gray-400 focus:ring-brand-400"
                        }`}>
                        <option value="">Not configured — no audit</option>
                        {RUBRIC_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 align-top min-w-[9rem]">
                      {/* Normalized Score / Final Status columns live on the
                         Interviews page only (per-interview, computed and
                         frozen once at completion time) — this button just
                         manages the per-template RULES those columns read,
                         same teal accent family as Booking Window/Panelist
                         Audit Rubric since it's the same kind of config. */}
                      <button type="button" onClick={() => setScoringModalTemplate(t)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 hover:bg-teal-100 transition-colors">
                        <BarChart3 className="w-3.5 h-3.5" /> Manage
                      </button>
                    </td>
                    <td className="px-4 py-3 w-10">
                      {savingId === t.id && <span className="text-[11px] text-gray-400">Saving…</span>}
                      {savedId === t.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ScoringRulesModal
        open={!!scoringModalTemplate}
        onClose={() => setScoringModalTemplate(null)}
        template={scoringModalTemplate}
      />
    </div>
  );
}
