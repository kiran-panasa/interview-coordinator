import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2 } from "lucide-react";
import { useTemplates, usePrograms, QK } from "../../hooks/queries";
import { updateTemplate } from "../../api/firestore";
import { Skeleton } from "../Skeleton";
import { DEFAULT_HIDDEN_SCORE_MESSAGE } from "../../constants/templateAttempts";

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

  const programName = (id) => programs.find(p => p.id === id)?.name || "";
  const statusOf = (t) => t.status || "active";
  const maxAttemptsOf = (t) => maxAttemptsDraft[t.id] ?? (t.maxAttempts != null ? String(t.maxAttempts) : "");
  const messageOf     = (t) => messageDraft[t.id] ?? (t.attemptLimitMessage || "");
  const showAiReportOf   = (t) => t.showAiReportToStudent !== false;
  const showFinalScoreOf = (t) => t.showFinalScoreToStudent !== false;
  const scoreMessageOf   = (t) => scoreMessageDraft[t.id] ?? (t.hiddenScoreMessage || "");

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
            className="text-xs border border-gray-200 rounded-lg pl-8 pr-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-700 w-56"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Template", "Program", "Status", "Attempt Limit", "AI Report & Score", ""].map(h => (
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
                    <td className="px-4 py-3 w-10">
                      {savingId === t.id && <span className="text-[11px] text-gray-400">Saving…</span>}
                      {savedId === t.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
