export default function QuestionForm({ form, setForm, skills, allDomainTypes, templates, toggleDomain, toggleSkill, toggleTemplate, onSave, onCancel, saving, submitLabel }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
          Question <span className="text-red-400">*</span>
        </label>
        <textarea rows={3} value={form.text}
          onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
          placeholder="e.g. Explain the difference between useMemo and useCallback in React."
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Suggested Answer</label>
        <textarea rows={4} value={form.suggestedAnswer || ""}
          onChange={e => setForm(f => ({ ...f, suggestedAnswer: e.target.value }))}
          placeholder="Key points, expected depth, or a model answer for interviewers to reference…"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Domain Type <span className="text-red-400">*</span>
        </label>
        {allDomainTypes.length === 0 ? (
          <p className="text-xs text-gray-400">No domain types defined yet — create a template with domains first.</p>
        ) : (
          <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
            {allDomainTypes.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => toggleDomain(value)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  (form.domainTypes || []).includes(value)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {(form.domainTypes || []).length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            {(form.domainTypes || []).length} domain{(form.domainTypes || []).length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Difficulty</label>
        <div className="flex gap-2">
          {["easy", "medium", "hard"].map(d => (
            <button key={d} type="button" onClick={() => setForm(f => ({ ...f, difficulty: d }))}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                form.difficulty === d
                  ? { easy: "bg-emerald-50 text-emerald-700 border-emerald-300", medium: "bg-amber-50 text-amber-700 border-amber-300", hard: "bg-red-50 text-red-700 border-red-300" }[d]
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Topic</label>
        <input value={form.topic}
          onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
          placeholder="e.g. React Hooks, Async JS, System Design…"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Skills</label>
        {skills.length === 0 ? (
          <p className="text-xs text-gray-400">No skills defined yet — add them in Admin Panel.</p>
        ) : (
          <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
            {skills.map(s => (
              <button key={s.id} type="button" onClick={() => toggleSkill(s.id)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  form.skills.includes(s.id)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                }`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Assign to Templates</label>
        {templates.length === 0 ? (
          <p className="text-xs text-gray-400">No templates defined yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 border border-gray-200 rounded-xl p-3 max-h-28 overflow-y-auto">
            {templates.map(t => (
              <button key={t.id} type="button" onClick={() => toggleTemplate(t.id)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  (form.templateIds || []).includes(t.id)
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                }`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {(form.templateIds || []).length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            Assigned to {(form.templateIds || []).length} template{(form.templateIds || []).length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onSave} disabled={saving}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "Saving…" : submitLabel}
        </button>
        <button onClick={onCancel}
          className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  );
}
