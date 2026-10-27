import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2, Info } from "lucide-react";
import { useTemplates, usePrograms, QK } from "../../hooks/queries";
import { updateTemplate } from "../../api/firestore";
import { Skeleton } from "../Skeleton";
import { DEFAULT_ATTEMPT_LIMIT_MESSAGE } from "../../constants/templateAttempts";

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
    dot: "bg-emerald-500",
    desc: "Normal, bookable state. Shows in a candidate's Eligible Interviews and Self Book list.",
    when: "The default — use this for anything currently running.",
  },
  {
    value: "draft",
    label: "Draft",
    text: "text-amber-700",
    dot: "bg-amber-500",
    desc: "Hidden from students, same as Archived. Purely organizational — a marker for your own tracking.",
    when: "Use while still building/configuring a template that isn't ready to assign to anyone yet.",
  },
  {
    value: "archived",
    label: "Archived",
    text: "text-gray-600",
    dot: "bg-gray-400",
    desc: "Hidden from students, same as Draft. Purely organizational — a marker for your own tracking.",
    when: "Use to retire/pause a template that WAS running — e.g. a round you're temporarily stopping or retiring for good.",
  },
];

export default function TemplateLifecycleTab() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: programs  = [] } = usePrograms();

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [savedId,  setSavedId]  = useState(null);
  // Local drafts for the two free-typed fields — only committed on blur,
  // so an in-progress keystroke (especially in the number input, where an
  // empty/partial value mid-edit is normal) never gets written to
  // Firestore as a half-finished value.
  const [maxAttemptsDraft, setMaxAttemptsDraft] = useState({});
  const [messageDraft,     setMessageDraft]     = useState({});

  const programName = (id) => programs.find(p => p.id === id)?.name || "";
  const statusOf = (t) => t.status || "active";
  const maxAttemptsOf = (t) => maxAttemptsDraft[t.id] ?? (t.maxAttempts != null ? String(t.maxAttempts) : "");
  const messageOf     = (t) => messageDraft[t.id] ?? (t.attemptLimitMessage || "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter(t => !programFilter || t.program === programFilter)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search, programFilter]);

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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Lifecycle</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Pause or retire a template without deleting it — switching it off Active hides it from students (Eligible
          Interviews / Self Book) immediately, but never touches an interview already scheduled or completed on it,
          or anything on the admin side. Switch it back to Active and it's bookable again, exactly as before. The
          Attempt Limit column separately caps how many times a candidate can book this round at all — leave it
          blank for unlimited.
        </p>
      </div>

      <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-3">
        <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-800 space-y-1">
          {STATUS_OPTIONS.map(o => (
            <p key={o.value}>
              <span className="font-bold">{o.label}</span> — {o.desc} <span className="text-indigo-600">{o.when}</span>
            </p>
          ))}
          <p className="text-indigo-600">Draft and Archived behave identically to students — the difference between them is only which label makes sense to you when you look back at it later.</p>
        </div>
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
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
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
                {["Template", "Program", "Status", "Attempt Limit", ""].map(h => (
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
                      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                        {STATUS_OPTIONS.map(o => (
                          <button key={o.value} type="button" onClick={() => handleChangeStatus(t, o.value)}
                            title={o.desc}
                            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                              status === o.value ? `bg-white shadow-sm ${o.text}` : "text-gray-400 hover:text-gray-600"
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === o.value ? o.dot : "bg-gray-300"}`} />
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top min-w-[18rem] space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={1}
                          value={maxAttemptsOf(t)}
                          onChange={e => setMaxAttemptsDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMaxAttempts(t)}
                          placeholder="Unlimited"
                          className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                        <span className="text-[11px] text-gray-400">completed attempt{maxAttemptsOf(t) === "1" ? "" : "s"} max</span>
                      </div>
                      {maxAttemptsOf(t).trim() !== "" && (
                        <textarea
                          rows={2}
                          value={messageOf(t)}
                          onChange={e => setMessageDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onBlur={() => commitMessage(t)}
                          placeholder={DEFAULT_ATTEMPT_LIMIT_MESSAGE}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400 text-gray-700 placeholder:text-gray-300"
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
