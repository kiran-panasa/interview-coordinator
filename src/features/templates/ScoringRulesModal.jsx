import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { getScoringRuleVersions, addScoringRuleVersion } from "../../api/scoringRules";
import { formatDate } from "../../utils/dates";
import { useAuth } from "../../AuthContext";

const inputCls = "text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-700";

function emptyBand() { return { min: "", max: "", label: "" }; }

// Per-template Final Score & Status rules — see the ScoringRuleVersion
// comment in types.ts for why "Save" here always creates a brand-new
// version (effective from a chosen date) instead of editing the current
// one in place. That's what lets an interview scored months ago keep
// showing whatever its own rule said at the time, even after this gets
// changed again later.
export default function ScoringRulesModal({ open, onClose, template }) {
  const { currentUser } = useAuth();
  const [versions, setVersions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [normalizeTo, setNormalizeTo] = useState(""); // "" = default (out of 5)
  const [bands, setBands] = useState([emptyBand()]);

  useEffect(() => {
    if (!open || !template) return;
    setLoading(true);
    setError("");
    getScoringRuleVersions(template.id)
      .then(list => {
        setVersions(list);
        const current = list[0]; // already ordered newest-first
        setEffectiveFrom(new Date().toISOString().slice(0, 10));
        setNormalizeTo(current?.normalizeTo ? String(current.normalizeTo) : "");
        setBands(
          current?.finalStatusBands?.length
            ? current.finalStatusBands.map(b => ({ min: String(b.min), max: String(b.max), label: b.label }))
            : [emptyBand()]
        );
      })
      .catch(() => setError("Couldn't load scoring rules."))
      .finally(() => setLoading(false));
  }, [open, template]);

  const updateBand = (i, patch) => setBands(bs => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBand = () => setBands(bs => [...bs, emptyBand()]);
  const removeBand = (i) => setBands(bs => bs.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setError("");
    const cleanBands = bands
      .filter(b => b.label.trim() !== "" && b.min !== "" && b.max !== "")
      .map(b => ({ min: Number(b.min), max: Number(b.max), label: b.label.trim() }));
    if (!cleanBands.length) {
      setError("Add at least one Final Status band (or leave normalization/status unconfigured for this template).");
      return;
    }
    setSaving(true);
    try {
      await addScoringRuleVersion(template.id, {
        effectiveFrom,
        normalizeTo: normalizeTo ? Number(normalizeTo) : null,
        finalStatusBands: cleanBands,
      }, currentUser?.uid || "");
      const list = await getScoringRuleVersions(template.id);
      setVersions(list);
    } catch {
      setError("Couldn't save — try again.");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Scoring Rules — ${template?.name || ""}`} wide>
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">New version</h3>
            <p className="text-xs text-gray-400 mb-3">
              Saving never changes a past version — it adds a new one, effective from the date below. Interviews already scored keep whatever rule was active when they were scored.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Effective from</label>
                <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Normalize score to</label>
                <select value={normalizeTo} onChange={e => setNormalizeTo(e.target.value)} className={`${inputCls} w-full cursor-pointer`}>
                  <option value="">Default — out of 5</option>
                  <option value="100">Out of 100</option>
                </select>
              </div>
            </div>

            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
              Final Status bands <span className="font-normal text-gray-400">— based on the panelist's score as a % of 5</span>
            </label>
            <div className="space-y-2">
              {bands.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="number" min="0" max="100" placeholder="Min %" value={b.min}
                    onChange={e => updateBand(i, { min: e.target.value })} className={`${inputCls} w-20`} />
                  <span className="text-gray-300 text-xs">–</span>
                  <input type="number" min="0" max="100" placeholder="Max %" value={b.max}
                    onChange={e => updateBand(i, { max: e.target.value })} className={`${inputCls} w-20`} />
                  <input type="text" placeholder="Label — e.g. Strong Hire" value={b.label}
                    onChange={e => updateBand(i, { label: e.target.value })} className={`${inputCls} flex-1`} />
                  <button onClick={() => removeBand(i)} disabled={bands.length === 1}
                    className="text-gray-300 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addBand} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 mt-2">
              <Plus className="w-3.5 h-3.5" /> Add band
            </button>

            {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}

            <div className="flex justify-end mt-4">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save as new version"}
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">History</h3>
            {!versions?.length ? (
              <p className="text-xs text-gray-400">No versions yet — nothing is normalized or status-classified for this template until you save one above.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div key={v.id} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-700">
                        {i === 0 ? "Current — " : ""}effective from {formatDate(v.effectiveFrom)}
                        {versions[i - 1] && ` until ${formatDate(versions[i - 1].effectiveFrom)}`}
                      </span>
                      <span className="text-gray-400">{v.normalizeTo ? `Out of ${v.normalizeTo}` : "Out of 5"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(v.finalStatusBands || []).map((b, bi) => (
                        <span key={bi} className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[11px] text-gray-600">
                          {b.label} ({b.min}–{b.max}%)
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
