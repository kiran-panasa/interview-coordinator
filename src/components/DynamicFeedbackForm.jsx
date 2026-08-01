import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, Plus, Check, Trash2, Award, Sparkles, ShieldCheck,
} from "lucide-react";
import {
  initFeedbackState,
  computeCardRating,
  computeDomainRating,
  computeFinalVerdict,
  computeIntegrityScore,
  materializeFeedback,
  withIntegrityDomain,
} from "../utils/templateEngine";
import { saveFeedbackAutoDraft, subscribeToInterviewIntegrity } from "../api/firestore";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import AutosaveIndicator from "./AutosaveIndicator";
import Button from "./Button";

// Interview Integrity is a single global checklist (settings/interviewIntegrity)
// merged live into whatever template is passed in — not stored per-template.
// Both DynamicFeedbackForm and DynamicFeedbackDisplay need it, so it's a
// small shared hook rather than duplicated subscribe logic in each.
function useIntegrityDomainFields() {
  const [fields, setFields] = useState(null); // null while loading
  useEffect(() => subscribeToInterviewIntegrity(s => setFields(s.domainFields)), []);
  return fields;
}

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Every scored_dropdown field (card-level or domain-level) is a mandatory rating.
// Returns a human-readable error for the first one missing a value, or null if complete.
function validateRatingsComplete(template, feedbackData) {
  const domains = (template?.domains || []).filter(d => d.enabled !== false);
  for (const domain of domains) {
    const domainData = feedbackData.domains?.[domain.id] || { cards: [] };
    const cardScoredFields = (domain.cardFields || []).filter(f => f.type === "scored_dropdown");
    const cards = domainData.cards || [];
    for (let i = 0; i < cards.length; i++) {
      for (const field of cardScoredFields) {
        const val = cards[i]?.[field.id];
        if (val === null || val === undefined || val === "") {
          return `${domain.label} — Card ${i + 1}: "${field.label}" rating is required.`;
        }
      }
    }
    const domainScoredFields = (domain.domainFields || []).filter(f => f.type === "scored_dropdown");
    for (const field of domainScoredFields) {
      const val = domainData[field.id];
      if (val === null || val === undefined || val === "") {
        return `${domain.label}: "${field.label}" rating is required.`;
      }
    }
  }
  return null;
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
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-none disabled:bg-gray-50 disabled:text-gray-600"
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
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors bg-white"
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
        {field.label} {!disabled && <span className="text-red-500">*</span>}
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
                "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center gap-3",
                isSelected
                  ? "bg-brand-600 border-brand-600 text-white shadow-soft"
                  : disabled
                    ? "bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-white border-gray-200 text-gray-700 hover:border-brand-400 hover:bg-brand-50 cursor-pointer"
              )}
            >
              <span className={cls(
                "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                isSelected ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700"
              )}>
                {opt.score}
              </span>
              <span className={cls("flex-1", isSelected ? "text-white" : "text-gray-700")}>
                {opt.label}
              </span>
              {isSelected && <Check className="w-4 h-4 text-white flex-shrink-0" />}
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
      <span className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        {label}
      </span>
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
          "flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors",
          complete ? "bg-emerald-50" : "bg-gray-50"
        )}
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={cls("w-4 h-4 text-gray-400 transition-transform flex-shrink-0", open ? "rotate-180" : "")} />
          <span className={cls("text-sm font-semibold", complete ? "text-emerald-800" : "text-gray-700")}>
            {cardLabel}
          </span>
          {complete && (
            <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md font-medium flex items-center gap-1">
              <Check className="w-3 h-3" /> Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {cardRating != null && (
            <span className="text-sm font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg">
              {cardRating}
            </span>
          )}
          {!disabled && canDelete && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete(index); }}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100 animate-fade-in">
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

const DomainSection = memo(function DomainSection({ domain, domainData, onChange, disabled, questionBank, defaultOpen }) {
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-brand-50 to-white border-b border-gray-100 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={cls("w-4 h-4 text-brand-400 transition-transform flex-shrink-0", open ? "rotate-180" : "")} />
          <span className="text-sm font-bold text-gray-900">{domain.label}</span>
          {hasCards && (
            <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium">
              {cards.length} {cardNoun.toLowerCase()}{cards.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {domainRating != null && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400 hidden sm:inline">Domain Rating</span>
            <span className="text-lg font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-lg min-w-[3rem] text-center">
              {domainRating}
            </span>
          </div>
        )}
      </div>

      {open && (
        <div className="p-5 space-y-4 animate-fade-in">
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-brand-200 rounded-xl text-brand-600 text-sm font-medium hover:border-brand-400 hover:bg-brand-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
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
});

// ── Final Verdict / Candidate Integrity Rating banners ─────────────────────────

function ScoreBanner({ icon: Icon, label, subtitle, value, gradient }) {
  if (value == null) return null;
  return (
    <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-5 text-white shadow-popover`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold opacity-90">{label}</div>
            <div className="text-xs opacity-60 mt-0.5">{subtitle}</div>
          </div>
        </div>
        <div className="text-5xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function VerdictBanner({ value }) {
  return (
    <ScoreBanner
      icon={Award} label="Final Interview Verdict" subtitle="Weighted average of all domain ratings"
      value={value} gradient="from-brand-600 to-violet-600"
    />
  );
}

function IntegrityBanner({ value }) {
  return (
    <ScoreBanner
      icon={ShieldCheck} label="Candidate Integrity Rating" subtitle="Weighted checklist rating, out of 5"
      value={value} gradient="from-amber-600 to-orange-600"
    />
  );
}

// ── Section reveal wrapper (subtle stagger as domains render) ─────────────────

const domainVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.04, 0.3), duration: 0.25, ease: "easeOut" } }),
};

// ── Main form (interviewer fills this) ────────────────────────────────────────

export default function DynamicFeedbackForm({ template, interview, onSubmit, saving, previewMode = false }) {
  const integrityFields = useIntegrityDomainFields();
  const effectiveTemplate = useMemo(
    () => withIntegrityDomain(template, integrityFields),
    [template, integrityFields]
  );

  const [feedbackData, setFeedbackData] = useState(
    () => initFeedbackState(effectiveTemplate, interview?.feedbackDraft || interview?.feedback)
  );

  const autosaveEnabled = !previewMode && !!interview?.id && !interview?.feedback?.submittedAt;
  const { status: draftStatus, lastSavedAt: draftSavedAt } = useAutosaveDraft(
    feedbackData,
    (data) => saveFeedbackAutoDraft(interview.id, data),
    { enabled: autosaveEnabled }
  );

  const updateDomain = useCallback((domainId, data) => {
    setFeedbackData(prev => ({
      ...prev,
      domains: { ...prev.domains, [domainId]: data },
    }));
  }, []);

  const enabledDomains = useMemo(() =>
    (effectiveTemplate?.domains || [])
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  [effectiveTemplate?.domains]);

  const finalVerdict = useMemo(
    () => computeFinalVerdict(effectiveTemplate, feedbackData),
    [effectiveTemplate, feedbackData]
  );

  const integrityScore = useMemo(
    () => computeIntegrityScore(effectiveTemplate, feedbackData),
    [effectiveTemplate, feedbackData]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (previewMode) return;
    const ratingError = validateRatingsComplete(effectiveTemplate, feedbackData);
    if (ratingError) return onSubmit(null, ratingError);
    onSubmit(materializeFeedback(effectiveTemplate, feedbackData));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {autosaveEnabled && (
        <div className="flex justify-end -mb-1">
          <AutosaveIndicator status={draftStatus} lastSavedAt={draftSavedAt} />
        </div>
      )}

      {enabledDomains.map((domain, i) => (
        <motion.div
          key={domain.id}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={domainVariants}
        >
          <DomainSection
            domain={domain}
            domainData={feedbackData.domains?.[domain.id] || { cards: [] }}
            onChange={data => updateDomain(domain.id, data)}
            disabled={false}
            questionBank={template?.questionBank}
            defaultOpen={!previewMode}
          />
        </motion.div>
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <VerdictBanner value={finalVerdict} />
        <IntegrityBanner value={integrityScore} />
      </div>

      {!previewMode && (
        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" size="lg" disabled={saving} icon={saving ? undefined : Check}>
            {saving ? "Saving…" : "Submit Evaluation"}
          </Button>
        </div>
      )}
    </form>
  );
}

// ── Read-only display of a submitted evaluation ───────────────────────────────

const NOOP = () => {};

export function DynamicFeedbackDisplay({ template, feedbackData }) {
  const integrityFields = useIntegrityDomainFields();
  const effectiveTemplate = useMemo(
    () => withIntegrityDomain(template, integrityFields),
    [template, integrityFields]
  );

  const enabledDomains = useMemo(() =>
    (effectiveTemplate?.domains || [])
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  [effectiveTemplate?.domains]);

  const finalVerdict = useMemo(
    () => feedbackData?.finalVerdict ?? computeFinalVerdict(effectiveTemplate, feedbackData),
    [effectiveTemplate, feedbackData]
  );

  const integrityScore = useMemo(
    () => feedbackData?.integrityScore ?? computeIntegrityScore(effectiveTemplate, feedbackData),
    [effectiveTemplate, feedbackData]
  );

  if (!template || !feedbackData) return null;

  return (
    <div className="space-y-4">
      {enabledDomains.map(domain => (
        <DomainSection
          key={domain.id}
          domain={domain}
          domainData={feedbackData.domains?.[domain.id] || { cards: [] }}
          onChange={NOOP}
          disabled
          questionBank={template?.questionBank}
          defaultOpen
        />
      ))}
      {feedbackData.comments && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overall Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{feedbackData.comments}</p>
        </div>
      )}
      {feedbackData.overallRecommendation && (
        <div className="bg-brand-50 rounded-2xl border border-brand-100 px-5 py-4 flex items-center gap-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall Recommendation</p>
          <span className="text-sm font-bold text-brand-700">{feedbackData.overallRecommendation}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <VerdictBanner value={finalVerdict} />
        <IntegrityBanner value={integrityScore} />
      </div>
    </div>
  );
}
