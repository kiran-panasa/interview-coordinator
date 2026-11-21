import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, RotateCcw, Info } from "lucide-react";
import { getPanelistAuditRubrics, savePanelistAuditRubric } from "../../api/firestore";
import { DEFAULT_RUBRICS, RUBRIC_OPTIONS } from "../../constants/panelistAuditRubricDefaults";
import { Skeleton } from "../Skeleton";

// Shows exactly what each rubric sends to Claude when auditing a panelist's
// conduct on a template assigned that rubric (Templates → Lifecycle →
// "Panelist Audit Rubric") — the textarea IS the live preview, not a
// separate read-only view, so there's one place to both see and change it.
// A rubric with no Firestore override yet shows the built-in default
// (src/constants/panelistAuditRubricDefaults.js); saving writes a custom
// version for just that key, nothing else. The shared Universal checklist/
// severity rules (api/_lib/panelistAuditRubrics.js) apply to every rubric
// alongside whichever one is shown here, and aren't edited per-rubric.
export default function PanelistAuditRubricsTab() {
  const [overrides, setOverrides] = useState(null); // null = still loading
  const [openKey, setOpenKey] = useState(null);
  const [drafts, setDrafts] = useState({}); // { [key]: { label, text } }
  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);

  useEffect(() => {
    getPanelistAuditRubrics().then(setOverrides).catch(() => setOverrides({}));
  }, []);

  const currentOf = (key) => {
    if (drafts[key]) return drafts[key];
    const override = overrides?.[key];
    const fallback = DEFAULT_RUBRICS[key];
    return { label: override?.label || fallback.label, text: override?.text || fallback.text };
  };
  const isCustomized = (key) => !!overrides?.[key];

  const setDraftField = (key, field, value) => {
    setDrafts(d => ({ ...d, [key]: { ...currentOf(key), [field]: value } }));
  };

  const save = async (key) => {
    const draft = currentOf(key);
    setSavingKey(key);
    setSavedKey(null);
    try {
      await savePanelistAuditRubric(key, draft);
      setOverrides(o => ({ ...o, [key]: draft }));
      setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
      setSavedKey(key);
      setTimeout(() => setSavedKey(k => (k === key ? null : k)), 1500);
    } finally {
      setSavingKey(null);
    }
  };

  const resetToDefault = async (key) => {
    const fallback = DEFAULT_RUBRICS[key];
    setSavingKey(key);
    try {
      await savePanelistAuditRubric(key, fallback);
      setOverrides(o => ({ ...o, [key]: fallback }));
      setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Audit Rubrics</h2>
        <p className="text-xs text-gray-400 mt-1">
          What the Panelist Audit (Templates → Lifecycle → "Panelist Audit Rubric") actually checks for each track/duration — the exact criteria Claude is given. Edit freely; a template keeps using whichever rubric it's assigned to, by name, so changes here apply the moment they're saved.
        </p>
      </div>

      <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-3">
        <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-800">
          Every rubric below is also checked against a shared Universal checklist (punctuality, proctoring, intro/close scripts, hint-ladder discipline, etc.) and the same severity/verdict rules — those are fixed platform-wide and aren't edited per-rubric here.
        </p>
      </div>

      {overrides === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {RUBRIC_OPTIONS.map(({ key, label: defaultLabel }) => {
            const open = openKey === key;
            const current = currentOf(key);
            const customized = isCustomized(key);
            return (
              <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : key)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    <span className="font-semibold text-gray-900 truncate">{current.label || defaultLabel}</span>
                    {customized && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Customized</span>
                    )}
                  </div>
                  {savedKey === key && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                </button>
                {open && (
                  <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={current.label}
                        onChange={e => setDraftField(key, "label", e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">
                        Rubric text — exactly what's sent to Claude for this track/duration
                      </label>
                      <textarea
                        rows={14}
                        value={current.text}
                        onChange={e => setDraftField(key, "text", e.target.value)}
                        className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2.5 leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {customized ? (
                        <button
                          type="button"
                          onClick={() => resetToDefault(key)}
                          disabled={savingKey === key}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
                        </button>
                      ) : <span />}
                      <button
                        type="button"
                        onClick={() => save(key)}
                        disabled={savingKey === key}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-brand-600 text-white shadow-soft hover:bg-brand-700 disabled:opacity-50 transition-colors"
                      >
                        {savingKey === key ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
