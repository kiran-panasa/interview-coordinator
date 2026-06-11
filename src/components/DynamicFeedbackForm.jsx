import { useState, useCallback } from "react";
import {
  initFeedbackState,
  computeCardRating,
  computeDomainRating,
  computeFinalVerdict,
  materializeFeedback,
} from "../utils/templateEngine";

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ── Primitive field components ────────────────────────────────────────────────

function TextField({ field, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {field.label}
      </label>
      <textarea
        disabled={disabled}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={disabled ? "" : (field.placeholder || "")}
        rows={2}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
      />
    </div>
  );
}

function DropdownField({ field, value, onChange, disabled, questionBank }) {
  // Prefer direct field.options if populated; fall back to questionBank source
  const options = (field.options?.length > 0)
    ? field.options
    : field.optionsSource
      ? (questionBank?.[field.optionsSource.replace("questionBank.", "")] || [])
      : [];

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {field.label}
      </label>
      {disabled ? (
        <div className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-gray-50 min-h-[38px]">
          {value || <span className="text-gray-400">—</span>}
        </div>
      ) : (
        <select
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          <option value="">Select {field.label}…</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// Scored dropdown: options are {label, score} objects
function ScoredDropdownField({ field, value, onChange, disabled }) {
  const options = [...(field.options || [])].sort((a, b) => b.score - a.score);
  const selected = options.find(o => String(o.score) === String(value));

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {field.label}
      </label>
      <div className="space-y-2">
        {options.map(opt => {
          const isSelected = String(opt.score) === String(value);
          return (
            <button
              key={opt.score}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(isSelected ? null : String(opt.score))}
              className={cls(
                "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-start gap-3",
                isSelected
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                  : disabled
                    ? "bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer"
              )}
            >
              <span className={cls(
                "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                isSelected ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"
              )}>
                {opt.score}
              </span>
              <span className={cls("flex-1", isSelected ? "text-indigo-100" : "text-gray-700")}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      {disabled && selected && (
        <div className="mt-1 text-xs text-gray-400">Selected: {selected.label} (score: {selected.score})</div>
      )}
    </div>
  );
}

function ComputedValue({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
      <span className="text-sm font-semibold text-amber-800">{label}</span>
      <span className={cls("text-2xl font-bold", value != null ? "text-amber-700" : "text-gray-300")}>
        {value != null ? value : "—"}
      </span>
    </div>
  );
}

// ── Card block (repeatable within a domain) ───────────────────────────────────

function CardBlock({ domain, index, cardData, onChange, onDelete, disabled, questionBank, canDelete }) {
  const [open, setOpen] = useState(true);

  const update = useCallback((fieldId, val) => {
    onChange(index, { ...cardData, [fieldId]: val });
  }, [index, cardData, onChange]);

  const typeLabels = { coding: "Problem", theory: "Question", project: "Project" };
  const cardLabel = `${typeLabels[domain.type] || "Card"} ${index + 1}`;

  const inputFields = (domain.cardFields || []);
  const filledCount = inputFields.filter(f => cardData[f.id] != null && cardData[f.id] !== "").length;
  const complete = filledCount === inputFields.length && inputFields.length > 0;

  const cardRating = computeCardRating(domain.cardFields, cardData);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <div
        className={cls(
          "flex items-center justify-between px-4 py-3 cursor-pointer select-none",
          complete ? "bg-emerald-50" : "bg-gray-50"
        )}
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <svg className={cls("w-4 h-4 text-gray-400 transition-transform flex-shrink-0", open ? "rotate-180" : "")}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className={cls("text-sm font-semibold", complete ? "text-emerald-800" : "text-gray-700")}>
            {cardLabel}
          </span>
          {complete && (
            <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md font-medium">Complete</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {cardRating != null && (
            <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
              {cardRating}
            </span>
          )}
          {!disabled && canDelete && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete(index); }}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          {(domain.cardFields || []).map(field => {
            if (field.type === "text") {
              return <TextField key={field.id} field={field} value={cardData[field.id]} onChange={v => update(field.id, v)} disabled={disabled} />;
            }
            if (field.type === "dropdown") {
              return <DropdownField key={field.id} field={field} value={cardData[field.id]} onChange={v => update(field.id, v)} disabled={disabled} questionBank={questionBank} />;
            }
            if (field.type === "scored_dropdown") {
              return <ScoredDropdownField key={field.id} field={field} value={cardData[field.id]} onChange={v => update(field.id, v)} disabled={disabled} />;
            }
            return null;
          })}

          {cardRating != null && (
            <ComputedValue label="Card Rating" value={cardRating} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Domain section ─────────────────────────────────────────────────────────────

function DomainSection({ domain, domainData, onChange, disabled, questionBank, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  const updateCard = useCallback((i, newCard) => {
    const cards = [...(domainData.cards || [])];
    cards[i] = newCard;
    onChange({ ...domainData, cards });
  }, [domainData, onChange]);

  const addCard = useCallback(() => {
    const emptyCard = {};
    for (const f of domain.cardFields || []) emptyCard[f.id] = f.type === "text" ? "" : null;
    onChange({ ...domainData, cards: [...(domainData.cards || []), emptyCard] });
  }, [domain, domainData, onChange]);

  const deleteCard = useCallback((i) => {
    onChange({ ...domainData, cards: (domainData.cards || []).filter((_, idx) => idx !== i) });
  }, [domainData, onChange]);

  const updateField = useCallback((fieldId, val) => {
    onChange({ ...domainData, [fieldId]: val });
  }, [domainData, onChange]);

  const hasCards = (domain.cardFields || []).length > 0;
  const domainRating = computeDomainRating(domain, domainData);

  const cardNoun = domain.type === "coding" ? "Problem" : domain.type === "project" ? "Project" : "Question";
  const cards = domainData?.cards || [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <svg className={cls("w-4 h-4 text-indigo-400 transition-transform flex-shrink-0", open ? "rotate-180" : "")}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-base font-bold text-gray-900">{domain.label}</span>
          {hasCards && (
            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
              {cards.length} {cardNoun.toLowerCase()}{cards.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {domainRating != null && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400 hidden sm:inline">Domain Rating</span>
            <span className="text-lg font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg min-w-[3rem] text-center">
              {domainRating}
            </span>
          </div>
        )}
      </div>

      {open && (
        <div className="p-5 space-y-4">
          {hasCards && (
            <>
              <div className="space-y-3">
                {cards.map((cardData, i) => (
                  <CardBlock
                    key={i}
                    domain={domain}
                    index={i}
                    cardData={cardData}
                    onChange={updateCard}
                    onDelete={deleteCard}
                    disabled={disabled}
                    questionBank={questionBank}
                    canDelete={cards.length > 1}
                  />
                ))}
              </div>

              {!disabled && (
                <button
                  type="button"
                  onClick={addCard}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 text-sm font-medium hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add {cardNoun}
                </button>
              )}

              {domainRating != null && (
                <ComputedValue label="Domain Rating" value={domainRating} />
              )}
            </>
          )}

          {/* Domain-level fields (scored_dropdown for no-card domains, text remarks for all) */}
          {(domain.domainFields || []).map(field => {
            if (field.type === "text") {
              return <TextField key={field.id} field={field} value={domainData[field.id]} onChange={v => updateField(field.id, v)} disabled={disabled} />;
            }
            if (field.type === "scored_dropdown") {
              return <ScoredDropdownField key={field.id} field={field} value={domainData[field.id]} onChange={v => updateField(field.id, v)} disabled={disabled} />;
            }
            if (field.type === "dropdown") {
              return <DropdownField key={field.id} field={field} value={domainData[field.id]} onChange={v => updateField(field.id, v)} disabled={disabled} questionBank={questionBank} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

// ── Final Verdict banner ──────────────────────────────────────────────────────

function VerdictBanner({ value }) {
  if (value == null) return null;
  return (
    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold opacity-90">Final Interview Verdict</div>
          <div className="text-xs opacity-60 mt-0.5">Weighted average of all domain ratings</div>
        </div>
        <div className="text-5xl font-bold">{value}</div>
      </div>
    </div>
  );
}

// ── Main form (interviewer fills this) ────────────────────────────────────────

export default function DynamicFeedbackForm({ template, interview, onSubmit, saving, previewMode = false }) {
  const [feedbackData, setFeedbackData] = useState(
    () => initFeedbackState(template, interview?.feedback)
  );

  const updateDomain = useCallback((domainId, data) => {
    setFeedbackData(prev => ({
      ...prev,
      domains: { ...prev.domains, [domainId]: data },
    }));
  }, []);

  const finalVerdict = computeFinalVerdict(template, feedbackData);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (previewMode) return;
    onSubmit(materializeFeedback(template, feedbackData));
  };

  const enabledDomains = (template?.domains || [])
    .filter(d => d.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {enabledDomains.map(domain => (
        <DomainSection
          key={domain.id}
          domain={domain}
          domainData={feedbackData.domains?.[domain.id] || { cards: [] }}
          onChange={data => updateDomain(domain.id, data)}
          disabled={false}
          questionBank={template?.questionBank}
          defaultOpen={!previewMode}
        />
      ))}

      <VerdictBanner value={finalVerdict} />

      {!previewMode && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Submit Evaluation"}
          </button>
        </div>
      )}
    </form>
  );
}

// ── Read-only display of a submitted evaluation ───────────────────────────────

export function DynamicFeedbackDisplay({ template, feedbackData }) {
  if (!template || !feedbackData) return null;

  const enabledDomains = (template?.domains || [])
    .filter(d => d.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const finalVerdict = feedbackData.finalVerdict ?? computeFinalVerdict(template, feedbackData);

  return (
    <div className="space-y-4">
      {enabledDomains.map(domain => (
        <DomainSection
          key={domain.id}
          domain={domain}
          domainData={feedbackData.domains?.[domain.id] || { cards: [] }}
          onChange={() => {}}
          disabled
          questionBank={template?.questionBank}
          defaultOpen
        />
      ))}
      <VerdictBanner value={finalVerdict} />
    </div>
  );
}
