import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ChevronUp, ChevronDown, Trash2, AlertTriangle, Info } from "lucide-react";
import { slugify } from "../../utils/templateHelpers";
import { FieldListEditor } from "./FieldEditor";
import { DOMAIN_PRESETS, DOMAIN_TYPE_ORDER } from "../../utils/templateEngine";
import Button from "../Button";

export function DomainRow({ domain, isFirst, isLast, onChange, onRemove, onMove }) {
  const [showFields, setShowFields] = useState(false);

  const hasCardFields = (domain.cardFields || []).length > 0;
  const cardHasScoredDropdown = (domain.cardFields || []).some(f => f.type === "scored_dropdown");

  return (
    <div className={`rounded-xl border transition-colors ${domain.enabled ? "border-gray-200 bg-white shadow-soft" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => onChange({ ...domain, enabled: !domain.enabled })}
          className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative p-0 leading-none self-center ${domain.enabled ? "bg-brand-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ${domain.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>

        <input type="text" value={domain.label}
          onChange={e => {
            const label = e.target.value;
            const slug = slugify(label);
            onChange({ ...domain, label, id: slug, type: slug });
          }}
          disabled={!domain.enabled}
          className={`flex-1 text-sm font-semibold bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-400 focus:outline-none py-0.5 transition-colors min-w-0 ${domain.enabled ? "text-gray-800" : "text-gray-400"}`}
        />

        <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{slugify(domain.label)}</span>

        <div className="flex gap-0.5 flex-shrink-0">
          <button type="button" disabled={isFirst} onClick={() => onMove("up")}
            className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" disabled={isLast} onClick={() => onMove("down")}
            className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <button type="button" onClick={onRemove}
          className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors flex-shrink-0"
          title="Remove domain">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {domain.enabled && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-1.5 pb-3 border-t border-gray-100">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Weight
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={5}
                value={domain.weightInVerdict ?? 0}
                onChange={e => onChange({ ...domain, weightInVerdict: parseFloat(e.target.value) || 0 })}
                className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <span className="text-gray-400 text-xs">%</span>
            </div>
            {(domain.weightInVerdict ?? 0) === 0 && (
              <span className="text-gray-400 text-xs italic">(not scored)</span>
            )}
          </label>

          {hasCardFields && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Default cards
              <input type="number" min={1} max={10}
                value={domain.defaultCardCount ?? 1}
                onChange={e => onChange({ ...domain, defaultCardCount: parseInt(e.target.value) || 1 })}
                className="w-12 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
          )}

          <button type="button" onClick={() => setShowFields(s => !s)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
            {showFields ? "Hide Fields" : "Edit Fields"}
            {showFields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {domain.enabled && showFields && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 bg-gray-50/70 p-4 space-y-5 rounded-b-xl border-l-2 border-l-brand-200 ml-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Card Fields</span>
                  <span className="text-xs text-gray-400">Repeat per card — text, scored or plain dropdown</span>
                </div>
                <FieldListEditor
                  fields={domain.cardFields || []}
                  onChange={fields => onChange({ ...domain, cardFields: fields })}
                  addLabel="Add Card Field"
                  showWeight
                />
                {cardHasScoredDropdown && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs text-amber-700 font-medium">Domain Rating — auto-computed (avg of card ratings)</span>
                  </div>
                )}
                {!hasCardFields && (domain.domainFields || []).some(f => f.type === "scored_dropdown") && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-xs text-blue-700 font-medium">No-card domain — first Scored Dropdown in Domain Fields = Domain Rating</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Domain Level Fields</span>
                  <span className="text-xs text-gray-400">Not repeated per card</span>
                </div>
                <FieldListEditor
                  fields={domain.domainFields || []}
                  onChange={fields => onChange({ ...domain, domainFields: fields })}
                  addLabel="Add Domain Field"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AddDomainPanel({ onAdd }) {
  const [open, setOpen] = useState(false);
  const presets = DOMAIN_TYPE_ORDER.map(t => ({ type: t, label: DOMAIN_PRESETS[t].label }));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 text-sm font-medium hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors">
        <Plus className="w-4 h-4" />
        Add Domain
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="border border-brand-200 rounded-xl p-4 bg-brand-50"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-brand-700 uppercase tracking-wide">Add Domain</span>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-white/60 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">Pick a preset to add with default fields, or create a blank custom domain.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map(p => (
          <button key={p.type} type="button" onClick={() => { onAdd(p.type); setOpen(false); }}
            className="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:bg-white text-gray-700 hover:text-brand-700 transition-colors shadow-sm">
            {p.label}
          </button>
        ))}
      </div>
      <Button type="button" variant="primary" size="sm" icon={Plus} onClick={() => { onAdd("custom"); setOpen(false); }}>
        Blank Custom Domain
      </Button>
    </motion.div>
  );
}
