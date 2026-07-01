import { useState } from "react";
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
            className="w-16 px-2 py-1 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="text"
            value={opt.label}
            onChange={e => update(i, "label", e.target.value)}
            placeholder="Option description…"
            className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="flex gap-0.5">
            <button type="button" disabled={i === 0} onClick={() => move(i, "up")}
              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">↑</button>
            <button type="button" disabled={i === options.length - 1} onClick={() => move(i, "down")}
              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">↓</button>
          </div>
          <button type="button" onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600 font-bold text-sm leading-none px-1">×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
        + Add option
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
              className="text-gray-300 hover:text-red-500 font-bold leading-none">×</button>
          </span>
        ))}
        {options.length === 0 && <span className="text-xs text-gray-400 italic">No options yet</span>}
      </div>
      <div className="flex gap-2">
        <input type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Type option and press Enter…"
          className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button type="button" onClick={add}
          className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-md text-xs font-semibold hover:bg-indigo-100 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

function FieldItem({ field, isFirst, isLast, onUpdate, onDelete, onMove, showWeight }) {
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
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex flex-col gap-0 flex-shrink-0">
          <button type="button" disabled={isFirst} onClick={() => onMove("up")}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-[10px]">▲</button>
          <button type="button" disabled={isLast} onClick={() => onMove("down")}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-[10px]">▼</button>
        </div>

        <input
          type="text"
          value={field.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Field label…"
          className="flex-1 text-xs font-medium border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none py-0.5 bg-transparent min-w-0"
        />

        {showWeight && field.type === "scored_dropdown" && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="number" min={0} max={100}
              value={field.weight ?? ""}
              onChange={e => onUpdate({ weight: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="w-12 px-1.5 py-1 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
        )}

        <select
          value={field.type}
          onChange={e => handleTypeChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 flex-shrink-0"
        >
          <option value="text">Text</option>
          <option value="scored_dropdown">Scored Dropdown</option>
          <option value="dropdown">Plain Dropdown</option>
        </select>

        {hasOptions && (
          <button type="button" onClick={() => setShowOptions(s => !s)}
            className={`text-xs font-semibold flex-shrink-0 px-2 py-1 rounded-md transition-colors ${showOptions ? "bg-indigo-100 text-indigo-700" : "text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"}`}>
            {showOptions ? "▲" : "Options"}
          </button>
        )}

        <button type="button" onClick={onDelete}
          className="text-red-400 hover:text-red-600 text-xs font-bold px-1 flex-shrink-0 leading-none">×</button>
      </div>

      {showOptions && hasOptions && (
        <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50">
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
      )}
    </div>
  );
}

export function FieldListEditor({ fields, onChange, addLabel, showWeight }) {
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
  const weightOk     = scoredFields.length <= 1 || Math.abs(totalWeight - 100) < 0.5;

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
        />
      ))}

      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border-2 border-dashed border-indigo-200 rounded-lg w-full justify-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
        + {addLabel || "Add Field"}
      </button>

      {showWeight && scoredFields.length > 1 && (
        <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${
          weightOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
        }`}>
          <span className={weightOk ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
            Scored field weights: {totalWeight.toFixed(1)}%
            {!weightOk && " — must equal 100%"}
          </span>
          <button type="button" onClick={equalizeWeights}
            className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors ml-3">
            Equalize
          </button>
        </div>
      )}
    </div>
  );
}
