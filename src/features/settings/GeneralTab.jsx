import { useRef, useEffect } from "react";

function SectionTitle({ dot, label, count }) {
  return (
    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full inline-block ${dot}`} />
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
      <div className="mb-8">
        <SectionTitle dot="bg-violet-400" label="Skills" />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-4">These skills are shared across templates and interviewer profiles for matching.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {skills.map(s => (
              <div key={s.id} className="group flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full pl-3 pr-1 py-0.5">
                {editingSkill?.id === s.id ? (
                  <input
                    autoFocus
                    value={editingSkill.name}
                    onChange={e => setEditingSkill(x => ({ ...x, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameSkill(); if (e.key === "Escape") setEditingSkill(null); }}
                    onBlur={handleRenameSkill}
                    className="text-xs font-semibold text-indigo-700 bg-transparent border-b border-indigo-400 focus:outline-none w-24"
                  />
                ) : (
                  <span className="text-xs font-semibold text-indigo-700">{s.name}</span>
                )}
                <div className="flex items-center gap-0.5 ml-1">
                  <button onClick={() => setEditingSkill({ id: s.id, name: s.name })}
                    className="p-0.5 text-indigo-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                  </button>
                  <button onClick={() => handleDeleteSkill(s)}
                    className="p-0.5 text-indigo-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 font-bold text-sm leading-none">×</button>
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
                className="text-xs border border-indigo-400 rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-36"
              />
            ) : (
              <button onClick={() => setAddingSkill(true)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-dashed border-indigo-300 rounded-full px-3 py-1 hover:bg-indigo-50 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Add Skill
              </button>
            )}
          </div>
          {skills.length === 0 && !addingSkill && (
            <p className="text-xs text-gray-400">No skills defined yet. Click "Add Skill" to create the first one.</p>
          )}
        </div>
      </div>

      {/* Programs */}
      <div className="mb-6">
        <SectionTitle dot="bg-indigo-400" label="Programs" />
        <p className="text-xs text-gray-400 mb-4">Programs group templates and candidates. They are used as filter tabs across the app.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {programs.length === 0 && !addingProgram ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm text-gray-400">No programs yet.</p>
            <button onClick={() => setAddingProgram(true)}
              className="text-sm font-semibold text-indigo-600 hover:underline">
              Create the first program →
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {programs.map(p => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 group">
                <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                {editingProgram?.id === p.id ? (
                  <input
                    autoFocus
                    value={editingProgram.name}
                    onChange={e => setEditingProgram(s => ({ ...s, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleRenameProgram(); if (e.key === "Escape") setEditingProgram(null); }}
                    onBlur={handleRenameProgram}
                    className="flex-1 text-sm border-b border-indigo-400 focus:outline-none bg-transparent text-gray-900 font-medium"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                )}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingProgram({ id: p.id, name: p.name })}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                    title="Rename">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteProgram(p)}
                    disabled={deletingProgram}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Delete program">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
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
              <span className="w-2 h-2 rounded-full bg-indigo-300 flex-shrink-0" />
              <input
                ref={newProgramRef}
                value={newProgramName}
                onChange={e => setNewProgramName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddProgram(); if (e.key === "Escape") { setAddingProgram(false); setNewProgramName(""); } }}
                onBlur={() => { if (!newProgramName.trim()) { setAddingProgram(false); setNewProgramName(""); } }}
                placeholder="Program name…"
                className="flex-1 text-sm border-b border-indigo-400 focus:outline-none bg-transparent text-gray-900"
              />
              <button onClick={handleAddProgram}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1">
                Add
              </button>
              <button onClick={() => { setAddingProgram(false); setNewProgramName(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-1">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingProgram(true)}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add Program
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
