import { motion } from "framer-motion";
import { HelpCircle, Archive, X } from "lucide-react";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { SkeletonRows } from "../../components/Skeleton";

const DIFFICULTIES = ["easy", "medium", "hard"];
const DIFF_BADGE = {
  easy:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  hard:   "bg-red-50 text-red-700 border-red-200",
};

export default function QuestionBankTab({
  questions, loading,
  templates, skills, allDomainTypes, allTopics, qToTemplatesMap,
  domainFilterOptions, skillFilterOptions,
  search, setSearch,
  filterDomain, setFilterDomain,
  filterDifficulty, setFilterDifficulty,
  filterSkill, setFilterSkill,
  filterTopic, setFilterTopic,
  filterTemplate, setFilterTemplate,
  showArchived, setShowArchived,
  hasActiveFilters, onClearFilters,
  selected, toggleSelect, toggleSelectAll, filtered,
  paged, page, setPage, totalPages, total, pageSize,
  openCreate, openEdit, handleArchive, handleUnarchive,
  setShowBulkEdit, setShowBulkModal,
}) {
  return (
    <>
      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex flex-wrap gap-3 mb-5"
      >
        <input type="text" placeholder="Search questions…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-56 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Templates</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Domains</option>
          {domainFilterOptions.map(({ label }) => <option key={label} value={label}>{label}</option>)}
        </select>
        <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={filterSkill} onChange={e => setFilterSkill(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Skills</option>
          {skillFilterOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Topics</option>
          {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setShowArchived(a => !a)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showArchived ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
          <Archive className="w-3.5 h-3.5" />
          {showArchived ? "Viewing Archived" : "Show Archived"}
        </button>
        {hasActiveFilters && (
          <button onClick={onClearFilters}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden"
      >
        {loading ? (
          <div className="p-4"><SkeletonRows count={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <HelpCircle className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm text-gray-400">
              {questions.length === 0 ? "No questions yet. Click 'Add Question' to get started." : "No questions match your filters."}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  {["Question", "Domain", "Topic", "Skills", "Difficulty", "Templates", "Used", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map(q => {
                  const qTemplates = qToTemplatesMap.get(q.id) || [];
                  return (
                    <tr key={q.id} className={`hover:bg-gray-50/70 transition-colors ${selected.has(q.id) ? "bg-brand-50/60" : ""} ${q.status === "archived" ? "opacity-50" : ""}`}>
                      <td className="pl-4 pr-2 py-3 w-8">
                        <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="text-gray-900 text-sm leading-snug line-clamp-2">{q.text}</p>
                        <p className="text-[10px] font-mono text-gray-300 mt-0.5">#{q.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        {(() => {
                          const qd = Array.isArray(q.domainTypes) ? q.domainTypes : (q.domainType ? [q.domainType] : []);
                          if (!qd.length) return <span className="text-xs text-gray-300">—</span>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {qd.slice(0, 2).map(val => {
                                const label = allDomainTypes.find(d => d.value === val)?.label || val;
                                return (
                                  <span key={val} title={label}
                                    className="text-[10px] text-brand-600 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full truncate max-w-[130px] inline-block">
                                    {label}
                                  </span>
                                );
                              })}
                              {qd.length > 2 && <span className="text-[10px] text-gray-400">+{qd.length - 2}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[100px]">{q.topic || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(q.skills || []).length === 0
                            ? <span className="text-xs text-gray-300">—</span>
                            : (q.skills || []).map(sid => {
                                const sk = skills.find(s => s.id === sid);
                                return sk ? (
                                  <span key={sid} className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                    {sk.name}
                                  </span>
                                ) : null;
                              })
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {q.difficulty ? (
                          <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${DIFF_BADGE[q.difficulty] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {q.difficulty}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        {qTemplates.length === 0
                          ? <span className="text-xs text-gray-300">—</span>
                          : (
                            <div className="flex flex-wrap gap-1">
                              {qTemplates.slice(0, 2).map(t => (
                                <span key={t.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                  {t.name}
                                </span>
                              ))}
                              {qTemplates.length > 2 && (
                                <span className="text-[10px] text-gray-400">+{qTemplates.length - 2}</span>
                              )}
                            </div>
                          )
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-700">{q.usageCount || 0}</span>
                        <span className="text-xs text-gray-400 ml-0.5">×</span>
                      </td>
                      <td className="px-4 py-3 w-12">
                        <KebabMenu actions={[
                          { label: "Edit",    onClick: () => openEdit(q) },
                          q.status === "archived"
                            ? { label: "Restore", onClick: () => handleUnarchive(q) }
                            : { label: "Archive", onClick: () => handleArchive(q), danger: true },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </motion.div>
    </>
  );
}
