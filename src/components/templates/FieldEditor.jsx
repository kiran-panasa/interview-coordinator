import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ChevronUp, ChevronDown, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { makeFieldId } from "../../utils/templateHelpers";

function ScoredOptionList({ options, onChange }) {
  const add = () => onChange([...options, { score: "", label: "" }]);
  const remove = (i) => onChange(options.filter((_, j) => j !== i));
  const update = (i, key, val) => onChange(options.map((o, j) => j === i ? { ...o, [key]: val } : o));
  const move = (i, dir) => {
    const arr = [...options];
    const ni = i + (dir === "up" ? -1 : 1);
    if (ni < 0 || ni >= arr.length) return;
    [arr[i], arr[ni]] = [arr[ni], arr[i]];
    onChange(arr);
  };

  return (
    <div className="space-y-1.5 mt-2">
      {options.length === 0 && (
        <p className="text-xs text-gray-400 italic">No options yet — click Add option below</p>
      )}
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            value={opt.score}
            onChange={e => update(i, "score", e.target.value)}
            placeholder="Score"
            className="w-16 px-2 py-1 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <input
            type="text"
            value={opt.label}
            onChange={e => update(i, "label", e.target.value)}
            placeholder="Option description…"
            className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <div className="flex gap-0.5 flex-shrink-0">
            <button type="button" disabled={i === 0} onClick={() => move(i, "up")}
              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button type="button" disabled={i === options.length - 1} onClick={() => move(i, "down")}
              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <button type="button" onClick={() => remove(i)}
            className="p-0.5 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
        <Plus className="w-3 h-3" /> Add option
      </button>
    </div>
  );
}

function PlainOptionList({ options, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || options.includes(t)) return;
    onChange([...options, t]);
    setDraft("");
  };

  return (
    <div className="space-y-2 mt-2">
      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {options.map((opt, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-md shadow-sm">
            {opt}
            <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-gray-300 hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {options.length === 0 && <span className="text-xs text-gray-400 italic">No options yet</span>}
      </div>
      <div className="flex gap-2">
        <input type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Type option and press Enter…"
          className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <button type="button" onClick={add}
          className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-600 rounded-md text-xs font-semibold hover:bg-brand-100 transition-colors">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
}

function FieldItem({ field, isFirst, isLast, onUpdate, onDelete, onMove, showWeight, weightMode = "percent" }) {
  const [showOptions, setShowOptions] = useState(false);
  const hasOptions = field.type === "scored_dropdown" || field.type === "dropdown";

  const handleTypeChange = (newType) => {
    const changes = { type: newType };
    if (newType === "scored_dropdown") {
      const existingScored = Array.isArray(field.options) && typeof field.options[0] === "object";
      changes.options = existingScored ? field.options : [];
    } else if (newType === "dropdown") {
      const existingPlain = Array.isArray(field.options) && typeof field.options[0] === "string";
      changes.options = existingPlain ? field.options : [];
    }
    onUpdate(changes);
    if (newType !== "text") setShowOptions(true);
    else setShowOptions(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-0 flex-shrink-0">
          <button type="button" disabled={isFirst} onClick={() => onMove("up")}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none rounded hover:bg-gray-100 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" disabled={isLast} onClick={() => onMove("down")}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none rounded hover:bg-gray-100 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <input
          type="text"
          value={field.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Field label…"
          className="flex-1 text-xs font-medium border-b border-transparent hover:border-gray-200 focus:border-brand-400 focus:outline-none py-0.5 bg-transparent min-w-0"
        />

        {showWeight && field.type === "scored_dropdown" && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="number" min={0} max={weightMode === "points" ? 20 : 100}
              value={field.weight ?? ""}
              onChange={e => onUpdate({ weight: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="w-12 px-1.5 py-1 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            {weightMode === "percent" && <span className="text-xs text-gray-400">%</span>}
          </div>
        )}

        <select
          value={field.type}
          onChange={e => handleTypeChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white text-gray-700 flex-shrink-0"
        >
          <option value="text">Text</option>
          <option value="scored_dropdown">Scored Dropdown</option>
          <option value="dropdown">Plain Dropdown</option>
        </select>

        {hasOptions && (
          <button type="button" onClick={() => setShowOptions(s => !s)}
            className={`flex items-center gap-1 text-xs font-semibold flex-shrink-0 px-2 py-1 rounded-md transition-colors ${showOptions ? "bg-brand-100 text-brand-700" : "text-brand-500 hover:text-brand-700 hover:bg-brand-50"}`}>
            Options {showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        <button type="button" onClick={onDelete}
          className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showOptions && hasOptions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/70 border-l-2 border-l-brand-200 ml-3">
              {field.type === "scored_dropdown" && (
                <ScoredOptionList
                  options={field.options || []}
                  onChange={opts => onUpdate({ options: opts })}
                />
              )}
              {field.type === "dropdown" && (
                <PlainOptionList
                  options={field.options || []}
                  onChange={opts => onUpdate({ options: opts })}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// weightMode "percent" (default, used by Card Fields): weights are a % of
// 100 and must sum to 100 across all scored fields in the list, with an
// Equalize shortcut. weightMode "points" (used for fixed-rubric domain-level
// checklists like Interview Integrity): weights are arbitrary relative point
// values with no required total — just an informational running total, no
// Equalize (equal-weighting would defeat the point of a deliberately uneven
// rubric).
export function FieldListEditor({ fields, onChange, addLabel, showWeight, weightMode = "percent" }) {
  const add = () => {
    onChange([...fields, { id: makeFieldId("field"), label: "", type: "text" }]);
  };
  const update = (i, changes) => onChange(fields.map((f, j) => j === i ? { ...f, ...changes } : f));
  const remove = (i) => onChange(fields.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const arr = [...fields];
    const ni = i + (dir === "up" ? -1 : 1);
    if (ni < 0 || ni >= arr.length) return;
    [arr[i], arr[ni]] = [arr[ni], arr[i]];
    onChange(arr);
  };

  const scoredFields = showWeight ? fields.filter(f => f.type === "scored_dropdown") : [];
  const totalWeight  = scoredFields.reduce((s, f) => s + (parseFloat(f.weight) || 0), 0);
  const isPercentMode = weightMode === "percent";
  const weightOk     = !isPercentMode || scoredFields.length <= 1 || Math.abs(totalWeight - 100) < 0.5;

  const equalizeWeights = () => {
    if (!scoredFields.length) return;
    const share = parseFloat((100 / scoredFields.length).toFixed(1));
    onChange(fields.map(f => f.type === "scored_dropdown" ? { ...f, weight: share } : f));
  };

  return (
    <div className="space-y-1.5">
      {fields.length === 0 && (
        <p className="text-xs text-gray-400 italic px-1">No fields yet</p>
      )}
      {fields.map((f, i) => (
        <FieldItem
          key={f.id || i}
          field={f}
          isFirst={i === 0}
          isLast={i === fields.length - 1}
          onUpdate={changes => update(i, changes)}
          onDelete={() => remove(i)}
          onMove={dir => move(i, dir)}
          showWeight={showWeight}
          weightMode={weightMode}
        />
      ))}

      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 px-3 py-1.5 border-2 border-dashed border-brand-200 rounded-lg w-full justify-center hover:border-brand-400 hover:bg-brand-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> {addLabel || "Add Field"}
      </button>

      {showWeight && scoredFields.length > 1 && isPercentMode && (
        <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${
          weightOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
        }`}>
          <span className={`flex items-center gap-1.5 font-medium ${weightOk ? "text-emerald-700" : "text-red-700"}`}>
            {weightOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            Scored field weights: {totalWeight.toFixed(1)}%
            {!weightOk && " — must equal 100%"}
          </span>
          <button type="button" onClick={equalizeWeights}
            className="text-brand-600 font-semibold hover:text-brand-700 transition-colors ml-3">
            Equalize
          </button>
        </div>
      )}

      {showWeight && scoredFields.length > 1 && !isPercentMode && (
        <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500 leading-relaxed">
          <span className="font-semibold text-gray-600">Total weight: {totalWeight}</span> — not required to total
          anything specific, it's just each item's relative importance. How the final rating (out of 5) is
          calculated: each item's selected option is normalized to 0–1 using that item's own lowest/highest
          possible option score, then combined using the weights above (higher weight = counts for more) and
          scaled to a 0–5 rating. An item left unanswered counts as 0, not as skipped — so the rating starts
          low and only reaches 5 once every item has been marked fully compliant.
        </div>
      )}
    </div>
  );
}
