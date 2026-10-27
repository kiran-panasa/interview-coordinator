import { useState, useEffect } from "react";
import { Info, CheckCircle2 } from "lucide-react";
import Modal from "../../components/Modal";
import { updateCandidate } from "../../api/firestore";
import { getInterviewsForCandidateTemplate } from "../../api/interviews";
import { DEFAULT_NO_SHOW_LIMIT } from "../../constants/templateAttempts";

// Per-candidate exception to a template's own attempt cap (Templates →
// Lifecycle) — for the rare case where one specific candidate genuinely
// needs a different limit than everyone else on that template, without
// touching the template's own setting for anyone else. See
// effectiveMaxAttempts in api/sso-handler.js, which is what actually
// enforces this (both here and the template default are just the two
// inputs to that one function).
export default function AttemptOverridesModal({ candidate, templates, onClose }) {
  const [completedByTemplateId, setCompletedByTemplateId] = useState({});
  const [noShowByTemplateId, setNoShowByTemplateId] = useState({});
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState(() => candidate?.attemptOverrides || {});
  const [noShowOverrides, setNoShowOverrides] = useState(() => candidate?.noShowOverrides || {});
  const [draft, setDraft] = useState({});
  const [noShowDraft, setNoShowDraft] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId,  setSavedId]  = useState(null);

  const assignedTemplates = (candidate?.templateIds || [])
    .map(tid => templates.find(t => t.id === tid))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!candidate) return;
    setOverrides(candidate.attemptOverrides || {});
    setNoShowOverrides(candidate.noShowOverrides || {});
    setDraft({});
    setNoShowDraft({});
    setLoading(true);
    Promise.all(assignedTemplates.map(t =>
      getInterviewsForCandidateTemplate(candidate.id, t.id).catch(() => [])
    )).then(results => {
      const completedMap = {};
      const noShowMap = {};
      assignedTemplates.forEach((t, i) => {
        completedMap[t.id] = (results[i] || []).filter(iv => iv.status === "completed").length;
        noShowMap[t.id] = (results[i] || []).filter(iv => iv.status === "no_show").length;
      });
      setCompletedByTemplateId(completedMap);
      setNoShowByTemplateId(noShowMap);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  const valueFor = (t) => draft[t.id] ?? (overrides[t.id] != null ? String(overrides[t.id]) : "");
  const noShowValueFor = (t) => noShowDraft[t.id] ?? (noShowOverrides[t.id] != null ? String(noShowOverrides[t.id]) : "");

  const commit = async (t) => {
    const raw = valueFor(t).trim();
    const next = { ...overrides };
    if (raw === "") delete next[t.id];
    else next[t.id] = Math.max(0, Math.round(Number(raw)) || 0);
    setDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (JSON.stringify(next[t.id]) === JSON.stringify(overrides[t.id])) return;
    setSavingId(t.id);
    setSavedId(null);
    try {
      await updateCandidate(candidate.id, { attemptOverrides: next });
      setOverrides(next);
      setSavedId(t.id);
      setTimeout(() => setSavedId(id => (id === t.id ? null : id)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  // 0 here means "unlimited no-shows for this candidate on this template" —
  // this is the actual "unblock them, give him an attempt" action an admin
  // reaches for once a candidate's hit the template's no-show limit.
  const commitNoShow = async (t) => {
    const raw = noShowValueFor(t).trim();
    const next = { ...noShowOverrides };
    if (raw === "") delete next[t.id];
    else next[t.id] = Math.max(0, Math.round(Number(raw)) || 0);
    setNoShowDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    if (JSON.stringify(next[t.id]) === JSON.stringify(noShowOverrides[t.id])) return;
    setSavingId(`noshow-${t.id}`);
    setSavedId(null);
    try {
      await updateCandidate(candidate.id, { noShowOverrides: next });
      setNoShowOverrides(next);
      setSavedId(`noshow-${t.id}`);
      setTimeout(() => setSavedId(id => (id === `noshow-${t.id}` ? null : id)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal open={!!candidate} onClose={onClose} title={`Manage Attempts & No-Shows — ${candidate?.name || ""}`} wide>
      {candidate && (
        <div className="space-y-6">
          {assignedTemplates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">This candidate has no templates assigned.</p>
          ) : (
            <>
              <div>
                <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-3 mb-3">
                  <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">
                    Overrides a template's own attempt limit (Templates → Lifecycle) for this candidate only — everyone
                    else on that template keeps using its normal limit. Leave blank to use the template's default.
                    Enter <span className="font-bold">0</span> to give this candidate unlimited attempts on that
                    template regardless of its limit.
                  </p>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Template", "Default Limit", "Completed", "Override for this candidate", ""].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assignedTemplates.map(t => (
                        <tr key={t.id}>
                          <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{t.name}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                            {t.maxAttempts != null ? t.maxAttempts : "Unlimited"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                            {loading ? "…" : (completedByTemplateId[t.id] ?? 0)}
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number" min={0}
                              value={valueFor(t)}
                              onChange={e => setDraft(d => ({ ...d, [t.id]: e.target.value }))}
                              onBlur={() => commit(t)}
                              placeholder="Use default"
                              className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                            />
                          </td>
                          <td className="px-3 py-2.5 w-8">
                            {savingId === t.id && <span className="text-[11px] text-gray-400">Saving…</span>}
                            {savedId === t.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 mb-3">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Overrides a template's own no-show block (Templates → Lifecycle) for this candidate only. Leave
                    blank to use the template's default. Enter <span className="font-bold">0</span> to unblock this
                    candidate — gives them unlimited no-shows (i.e. another attempt) on that template regardless of
                    its limit.
                  </p>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Template", "Default Limit", "No-Shows", "Override for this candidate", ""].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assignedTemplates.map(t => {
                        const blocked = t.maxNoShows !== 0
                          && (noShowByTemplateId[t.id] ?? 0) >= (t.maxNoShows || DEFAULT_NO_SHOW_LIMIT);
                        return (
                          <tr key={t.id}>
                            <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{t.name}</td>
                            <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                              {t.maxNoShows === 0 ? "No limit" : t.maxNoShows != null ? t.maxNoShows : `Default (${DEFAULT_NO_SHOW_LIMIT})`}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={blocked ? "font-bold text-red-600" : "text-gray-700"}>
                                {loading ? "…" : (noShowByTemplateId[t.id] ?? 0)}
                              </span>
                              {blocked && !loading && (
                                <span className="ml-1.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Blocked</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number" min={0}
                                value={noShowValueFor(t)}
                                onChange={e => setNoShowDraft(d => ({ ...d, [t.id]: e.target.value }))}
                                onBlur={() => commitNoShow(t)}
                                placeholder="Use default"
                                className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                              />
                            </td>
                            <td className="px-3 py-2.5 w-8">
                              {savingId === `noshow-${t.id}` && <span className="text-[11px] text-gray-400">Saving…</span>}
                              {savedId === `noshow-${t.id}` && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
