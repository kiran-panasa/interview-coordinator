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
// Writes to template.skills / template.interviewerIds, both read by
// resolveSelfBookTarget (api/sso-handler.js) to decide which interviewers
// a candidate's Self Book slots come from. The two are independently
// combinable, not exclusive — when both are set, an interviewer must have
// the required skills AND be on the picked list (AND, not OR): the picked
// list narrows an already skill-qualified pool down further, rather than
// adding unqualified exceptions on top of it.
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
  // Toggling a picker open with nothing chosen in it yet shouldn't look
  // like it snapped back off just because the underlying array is still
  // empty — these UI-only sets track "this picker is explicitly open" per
  // template until either something gets picked (the template's own field
  // then carries it) or it's explicitly closed again.
  const [skillsOpenIds,       setSkillsOpenIds]       = useState(() => new Set());
  const [interviewersOpenIds, setInterviewersOpenIds] = useState(() => new Set());

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

  const skillsOn       = (t) => !!(t.skills && t.skills.length) || skillsOpenIds.has(t.id);
  const interviewersOn = (t) => !!(t.interviewerIds && t.interviewerIds.length) || interviewersOpenIds.has(t.id);
  const isAllInterviewers = (t) => !skillsOn(t) && !interviewersOn(t);

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

  const resetToAll = (template) => {
    setSkillsOpenIds(s => { const n = new Set(s); n.delete(template.id); return n; });
    setInterviewersOpenIds(s => { const n = new Set(s); n.delete(template.id); return n; });
    if ((template.skills && template.skills.length) || (template.interviewerIds && template.interviewerIds.length)) {
      saveTemplate(template, { skills: [], interviewerIds: [] });
    }
  };

  const toggleSkills = (template) => {
    if (skillsOn(template)) {
      setSkillsOpenIds(s => { const n = new Set(s); n.delete(template.id); return n; });
      if (template.skills && template.skills.length) saveTemplate(template, { skills: [] });
    } else {
      setSkillsOpenIds(s => new Set(s).add(template.id));
    }
  };

  const toggleInterviewers = (template) => {
    if (interviewersOn(template)) {
      setInterviewersOpenIds(s => { const n = new Set(s); n.delete(template.id); return n; });
      if (template.interviewerIds && template.interviewerIds.length) saveTemplate(template, { interviewerIds: [] });
    } else {
      setInterviewersOpenIds(s => new Set(s).add(template.id));
    }
  };

  const handleChangeSkills       = (template, next) => saveTemplate(template, { skills: next });
  const handleChangeInterviewers = (template, next) => saveTemplate(template, { interviewerIds: next });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Interviewer Eligibility</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Controls which interviewers' slots a candidate actually sees when self-booking a template. Required Skills
          and Specific Interviewers can both be set at once — an interviewer then needs to match BOTH (the picked
          list narrows an already skill-qualified pool, not adds exceptions to it). Leave both off to show every
          interviewer assigned to the template.
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
                const bothOn = skillsOn(t) && interviewersOn(t);
                return (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 align-top whitespace-nowrap">{t.name}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {t.program
                      ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{programName(t.program)}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top min-w-[20rem] space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button type="button" onClick={() => resetToAll(t)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                          isAllInterviewers(t)
                            ? "bg-gray-800 text-white border-gray-800"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}>
                        All Interviewers
                      </button>
                      <button type="button" onClick={() => toggleSkills(t)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                          skillsOn(t)
                            ? "bg-brand-50 text-brand-700 border-brand-300"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}>
                        Specific Skills
                      </button>
                      <button type="button" onClick={() => toggleInterviewers(t)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                          interviewersOn(t)
                            ? "bg-violet-50 text-violet-700 border-violet-300"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}>
                        Specific Interviewers
                      </button>
                    </div>
                    {bothOn && (
                      <p className="text-[11px] text-gray-400">Must match the skills below AND be on the interviewer list below.</p>
                    )}
                    {skillsOn(t) && (
                      <SkillsSelect
                        skills={skills}
                        value={t.skills || []}
                        onChange={v => handleChangeSkills(t, v)}
                        placeholder="Pick required skills…"
                      />
                    )}
                    {interviewersOn(t) && (
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
