import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, CheckCircle2 } from "lucide-react";
import { useTemplates, useSkills, usePrograms, QK } from "../../hooks/queries";
import { updateTemplate } from "../../api/firestore";
import SkillsSelect from "../../components/SkillsSelect";
import { Skeleton } from "../../components/Skeleton";

// A faster way to skim/update Required Skills across every template at once
// — the Templates page still has its own Skills field for editing one
// template in depth, this is purely a bulk overview next to it, writing to
// the exact same template.skills field (see findSkillMatchedInterviewerIds
// in api/sso-handler.js, which is what actually uses it to restrict which
// interviewers a candidate's Self Book slots come from).
export default function SkillMappingTab() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: skills    = [] } = useSkills();
  const { data: programs  = [] } = usePrograms();

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [savedId,  setSavedId]  = useState(null);
  // Picking "Specific Skills" with nothing chosen yet should still show the
  // picker open, not immediately look like "All Interviewers" again just
  // because skills.length is still 0 — this UI-only set tracks that explicit
  // choice until either a skill gets picked (then t.skills itself carries
  // it) or the row is switched back to All Interviewers.
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const isAllMode = (t) => !(t.skills && t.skills.length) && !expandedIds.has(t.id);

  const programName = (id) => programs.find(p => p.id === id)?.name || "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter(t => !programFilter || t.program === programFilter)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search, programFilter]);

  const handleChangeSkills = async (template, nextSkillIds) => {
    setSavingId(template.id);
    setSavedId(null);
    try {
      await updateTemplate(template.id, { skills: nextSkillIds });
      queryClient.invalidateQueries({ queryKey: QK.templates });
      setSavedId(template.id);
      setTimeout(() => setSavedId(id => (id === template.id ? null : id)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const handleUseAllInterviewers = (template) => {
    setExpandedIds(ids => { const next = new Set(ids); next.delete(template.id); return next; });
    if (template.skills && template.skills.length) handleChangeSkills(template, []);
  };

  const handlePickSpecificSkills = (template) => {
    setExpandedIds(ids => new Set(ids).add(template.id));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Skill Mapping</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Which skills a template requires — only interviewers tagged with ALL of them are offered when a candidate
          self-books it. Switch a row to "All Interviewers" to use every interviewer assigned to that template instead,
          no skill restriction.
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
                {["Template", "Program", "Required Skills", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 align-top whitespace-nowrap">{t.name}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {t.program
                      ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{programName(t.program)}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top min-w-[20rem] space-y-2">
                    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                      <button type="button" onClick={() => handleUseAllInterviewers(t)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                          isAllMode(t) ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                        }`}>
                        All Interviewers
                      </button>
                      <button type="button" onClick={() => handlePickSpecificSkills(t)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                          !isAllMode(t) ? "bg-white text-brand-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
                        }`}>
                        Specific Skills
                      </button>
                    </div>
                    {!isAllMode(t) && (
                      <SkillsSelect
                        skills={skills}
                        value={t.skills || []}
                        onChange={v => handleChangeSkills(t, v)}
                        placeholder="Pick required skills…"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 align-top w-10">
                    {savingId === t.id && <span className="text-[11px] text-gray-400">Saving…</span>}
                    {savedId === t.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
