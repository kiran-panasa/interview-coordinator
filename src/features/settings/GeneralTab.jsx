import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Tag, Layers, Plus, Pencil, Trash2, X, FolderKanban } from "lucide-react";

function SectionTitle({ icon: Icon, label, count }) {
  return (
    <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-gray-400" />
      {label}
      {count != null && count > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">{count}</span>
      )}
    </h2>
  );
}

export default function GeneralTab({
  skills, programs,
  addingSkill, setAddingSkill, newSkillName, setNewSkillName,
  editingSkill, setEditingSkill,
  handleAddSkill, handleRenameSkill, handleDeleteSkill,
  addingProgram, setAddingProgram, newProgramName, setNewProgramName,
  editingProgram, setEditingProgram,
  handleAddProgram, handleRenameProgram, handleDeleteProgram, deletingProgram,
}) {
  const newProgramRef = useRef(null);
  useEffect(() => { if (addingProgram) newProgramRef.current?.focus(); }, [addingProgram]);

  return (
    <div>
      {/* Skills */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <SectionTitle icon={Tag} label="Skills" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <p className="text-xs text-gray-400 mb-4">These skills are shared across templates and interviewer profiles for matching.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {skills.map(s => (
              <div key={s.id} className="group flex items-center gap-1 bg-brand-50 border border-brand-200 rounded-full pl-3 pr-1 py-0.5">
                {editingSkill?.id === s.id ? (
                  <input
                    autoFocus
                    value={editingSkill.name}
                    onChange={e => setEditingSkill(x => ({ ...x, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameSkill(); if (e.key === "Escape") setEditingSkill(null); }}
                    onBlur={handleRenameSkill}
                    className="text-xs font-semibold text-brand-700 bg-transparent border-b border-brand-400 focus:outline-none w-24"
                  />
                ) : (
                  <span className="text-xs font-semibold text-brand-700">{s.name}</span>
                )}
                <div className="flex items-center gap-0.5 ml-1">
                  <button onClick={() => setEditingSkill({ id: s.id, name: s.name })}
                    className="p-0.5 text-brand-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={() => handleDeleteSkill(s)}
                    className="p-0.5 text-brand-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
            {addingSkill ? (
              <input
                autoFocus
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddSkill(); if (e.key === "Escape") { setAddingSkill(false); setNewSkillName(""); } }}
                onBlur={() => { if (!newSkillName.trim()) { setAddingSkill(false); setNewSkillName(""); } }}
                placeholder="Skill name…"
                className="text-xs border border-brand-400 rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400 w-36"
              />
            ) : (
              <button onClick={() => setAddingSkill(true)}
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 border border-dashed border-brand-300 rounded-full px-3 py-1 hover:bg-brand-50 transition-colors">
                <Plus className="w-3 h-3" />
                Add Skill
              </button>
            )}
          </div>
          {skills.length === 0 && !addingSkill && (
            <p className="text-xs text-gray-400">No skills defined yet. Click "Add Skill" to create the first one.</p>
          )}
        </div>
      </motion.div>

      {/* Programs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-6"
      >
        <SectionTitle icon={Layers} label="Programs" />
        <p className="text-xs text-gray-400 mb-4">Programs group templates and candidates. They are used as filter tabs across the app.</p>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          {programs.length === 0 && !addingProgram ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <FolderKanban className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
              <p className="text-sm text-gray-400">No programs yet.</p>
              <button onClick={() => setAddingProgram(true)}
                className="text-sm font-semibold text-brand-600 hover:underline">
                Create the first program →
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {programs.map(p => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors group">
                  <span className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0" />
                  {editingProgram?.id === p.id ? (
                    <input
                      autoFocus
                      value={editingProgram.name}
                      onChange={e => setEditingProgram(s => ({ ...s, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") handleRenameProgram(); if (e.key === "Escape") setEditingProgram(null); }}
                      onBlur={handleRenameProgram}
                      className="flex-1 text-sm border-b border-brand-400 focus:outline-none bg-transparent text-gray-900 font-medium"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                  )}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingProgram({ id: p.id, name: p.name })}
                      className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
                      title="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProgram(p)}
                      disabled={deletingProgram}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Delete program">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add program row */}
          <div className="px-5 py-3 border-t border-gray-100">
            {addingProgram ? (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-brand-300 flex-shrink-0" />
                <input
                  ref={newProgramRef}
                  value={newProgramName}
                  onChange={e => setNewProgramName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddProgram(); if (e.key === "Escape") { setAddingProgram(false); setNewProgramName(""); } }}
                  onBlur={() => { if (!newProgramName.trim()) { setAddingProgram(false); setNewProgramName(""); } }}
                  placeholder="Program name…"
                  className="flex-1 text-sm border-b border-brand-400 focus:outline-none bg-transparent text-gray-900"
                />
                <button onClick={handleAddProgram}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-2 py-1">
                  Add
                </button>
                <button onClick={() => { setAddingProgram(false); setNewProgramName(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setAddingProgram(true)}
                className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                <Plus className="w-4 h-4" />
                Add Program
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
