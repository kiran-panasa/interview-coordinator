import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2 } from "lucide-react";
import { useTemplates, useSkills, usePrograms, useVendors, useUsers, QK } from "../../hooks/queries";
import { updateTemplate } from "../../api/firestore";
import SkillsSelect from "../../components/SkillsSelect";
import { Skeleton } from "../../components/Skeleton";

// A faster way to skim/update a template's eligible-interviewer rules all
// at once — the Templates page still has its own Skills field for editing
// one template in depth, this is purely a bulk overview next to it.
// Writes to template.skills / template.interviewerIds, the exact two
// fields findSkillMatchedInterviewerIds / the explicit-pick check in
// resolveSelfBookTarget (api/sso-handler.js) read to decide which
// interviewers a candidate's Self Book slots come from. Mutually
// exclusive by design — a template is either open to everyone assigned,
// gated by required skills, or pinned to a hand-picked interviewer list;
// mixing two at once on the same template would make it ambiguous which
// one actually won.
export default function SkillMappingTab() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: skills    = [] } = useSkills();
  const { data: programs  = [] } = usePrograms();
  const { data: vendors   = [] } = useVendors();
  const { data: users     = [] } = useUsers();

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [savedId,  setSavedId]  = useState(null);
  // Switching to "Specific Skills"/"Specific Interviewers" with nothing
  // picked yet should still show that picker open, not snap back to "All
  // Interviewers" just because the underlying array is still empty — this
  // UI-only map tracks that explicit choice per template until either
  // something gets picked (then the template's own field carries it) or
  // the row is switched back to All Interviewers.
  const [pendingMode, setPendingMode] = useState(() => new Map());

  const vendorNameById = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v.name])), [vendors]);
  const activeInterviewers = useMemo(
    () => users.filter(u => ["interviewer", "interviewer_content"].includes(u.role) && u.status === "active"),
    [users]
  );
  const interviewerOptions = useMemo(() => activeInterviewers
    .map(u => ({ id: u.id, name: u.displayName || u.email, group: u.vendorId ? (vendorNameById[u.vendorId] || "Vendor") : "No Vendor" }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    [activeInterviewers, vendorNameById]
  );

  const modeOf = (t) => {
    if (t.interviewerIds && t.interviewerIds.length) return "interviewers";
    if (t.skills && t.skills.length) return "skills";
    return pendingMode.get(t.id) || "all";
  };

  const programName = (id) => programs.find(p => p.id === id)?.name || "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter(t => !programFilter || t.program === programFilter)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search, programFilter]);

  const saveTemplate = async (template, data) => {
    setSavingId(template.id);
    setSavedId(null);
    try {
      await updateTemplate(template.id, data);
      queryClient.invalidateQueries({ queryKey: QK.templates });
      setSavedId(template.id);
      setTimeout(() => setSavedId(id => (id === template.id ? null : id)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const setMode = (template, mode) => {
    setPendingMode(m => new Map(m).set(template.id, mode));
    if (mode === "all") saveTemplate(template, { skills: [], interviewerIds: [] });
  };

  const handleChangeSkills = (template, nextSkillIds) =>
    saveTemplate(template, { skills: nextSkillIds, interviewerIds: [] });

  const handleChangeInterviewers = (template, nextInterviewerIds) =>
    saveTemplate(template, { interviewerIds: nextInterviewerIds, skills: [] });

  const MODES = [
    { value: "all",          label: "All Interviewers" },
    { value: "skills",       label: "Specific Skills" },
    { value: "interviewers", label: "Specific Interviewers" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Skill Mapping</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Who's eligible to take a template's interviews when a candidate self-books — every interviewer assigned to
          it, only those tagged with ALL required skills, or a hand-picked list (grouped by vendor below).
        </p>
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
                {["Template", "Program", "Eligible Interviewers", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => {
                const mode = modeOf(t);
                return (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 align-top whitespace-nowrap">{t.name}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {t.program
                      ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{programName(t.program)}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top min-w-[20rem] space-y-2">
                    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                      {MODES.map(m => (
                        <button key={m.value} type="button" onClick={() => setMode(t, m.value)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                            mode === m.value ? "bg-white text-brand-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          }`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {mode === "skills" && (
                      <SkillsSelect
                        skills={skills}
                        value={t.skills || []}
                        onChange={v => handleChangeSkills(t, v)}
                        placeholder="Pick required skills…"
                      />
                    )}
                    {mode === "interviewers" && (
                      <SkillsSelect
                        skills={interviewerOptions}
                        value={t.interviewerIds || []}
                        onChange={v => handleChangeInterviewers(t, v)}
                        placeholder="Pick interviewers…"
                        searchPlaceholder="Search interviewers…"
                        ungroupedLabel="No Vendor"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 align-top w-10">
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
