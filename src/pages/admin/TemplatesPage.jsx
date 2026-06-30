import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  subscribeToPrograms, createProgram, updateProgram, deleteProgram,
  subscribeToInterviews, subscribeToSkills, subscribeToQuestions,
} from "../../api/firestore";
import SkillsSelect from "../../components/SkillsSelect";
import { DOMAIN_PRESETS, DOMAIN_TYPE_ORDER } from "../../utils/templateEngine";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import DynamicFeedbackForm from "../../components/DynamicFeedbackForm";
import KebabMenu from "../../components/KebabMenu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function makeFieldId(label) {
  const slug = (label || "field").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return slug + "_" + Math.random().toString(36).slice(2, 7);
}

function slugify(label) {
  return (label || "")
    .toLowerCase()
    .replace(/[–—]/g, "_")
    .replace(/[^a-z0-9\s_]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "domain";
}

const makeEmptyForm = () => ({
  name: "",
  domains: DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i })),
  questionBank: { theory: [], coding: [], project: [], resume: [] },
});

// ── Template CSV import/export ────────────────────────────────────────────────

function splitCSVRow(line) {
  const cols = [];
  let curr = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(curr.trim()); curr = ""; }
    else { curr += ch; }
  }
  cols.push(curr.trim());
  return cols;
}

function parseTemplateCSV(text) {
  const errors = [];
  const rows = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(splitCSVRow);

  const template = { name: "", domains: [], questionBank: {}, schemaVersion: 2 };
  let currentDomain = null;
  let currentField  = null;
  let domainOrder   = 0;

  for (const [i, row] of rows.entries()) {
    const type = row[0]?.toLowerCase();
    if (!type || type === "type") continue; // skip header row

    if (type === "template") {
      template.name = row[1] || "";

    } else if (type === "domain") {
      currentField = null;
      const domainSlug = row[1]?.trim() || slugify(row[2] || "domain");
      currentDomain = {
        id:             domainSlug,
        type:           domainSlug,
        label:          row[2] || "Domain",
        order:          domainOrder++,
        enabled:        true,
        weightInVerdict: parseFloat(row[3]) || 0,
        defaultCardCount: parseInt(row[4]) || 1,
        cardFields:     [],
        domainFields:   [],
      };
      template.domains.push(currentDomain);

    } else if (type === "card_field" || type === "domain_field") {
      if (!currentDomain) { errors.push(`Row ${i + 1}: "${type}" appears before any domain row`); continue; }
      const fType = row[3] || "text";
      currentField = {
        id:    row[1] || makeFieldId(row[2] || "field"),
        label: row[2] || "",
        type:  fType,
      };
      if (fType === "scored_dropdown") {
        currentField.weight  = parseFloat(row[4]) || 0;
        currentField.options = [];
      } else if (fType === "dropdown") {
        currentField.options = [];
      }
      if (type === "card_field") currentDomain.cardFields.push(currentField);
      else                       currentDomain.domainFields.push(currentField);

    } else if (type === "option") {
      if (!currentField) { errors.push(`Row ${i + 1}: "option" appears before any field row`); continue; }
      if (currentField.type === "scored_dropdown") {
        currentField.options.push({ score: parseFloat(row[1]) || 0, label: row[2] || "" });
      } else if (currentField.type === "dropdown") {
        currentField.options.push(row[1] || "");
      }

    } else {
      errors.push(`Row ${i + 1}: unknown row type "${row[0]}"`);
    }
  }

  if (!template.name) errors.push('Missing template name — add a row: template,Your Template Name');
  if (!template.domains.length) errors.push("No domains found — add at least one domain row");

  return { template, errors };
}

function downloadSampleExcel() {
  // ── Sheet 1: Instructions ──────────────────────────────────────────────────
  const instructionRows = [
    ["Row Type", "Column B", "Column C", "Column D", "Column E"],
    ["template", "Template name", "", "", ""],
    ["domain", "id (no spaces)", "Label shown to interviewer", "Weight % in final verdict", "Default card count (0 for no cards)"],
    ["card_field", "id (no spaces)", "Label", "Type: text / scored_dropdown / dropdown", "Weight % for this field (scored_dropdown only)"],
    ["domain_field", "id (no spaces)", "Label", "Type: text / scored_dropdown / dropdown", "Weight % (scored_dropdown only)"],
    ["option (scored_dropdown)", "Score (number, e.g. 5)", "Label text displayed to interviewer", "", ""],
    ["option (dropdown)", "Value text", "", "", ""],
    ["", "", "", "", ""],
    ["Notes", "", "", "", ""],
    ["• Options belong to the most recently declared field above them", "", "", "", ""],
    ["• Scored dropdown options: higher score = better", "", "", "", ""],
    ["• Weight % for domains should add up to 100 across all domains", "", "", "", ""],
    ["• Leave blank rows between domains for readability (they are ignored)", "", "", "", ""],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows);
  wsInstructions["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 48 }, { wch: 42 }, { wch: 36 }];

  // ── Sheet 2: Sample Template ───────────────────────────────────────────────
  const templateRows = [
    ["type", "id / score", "label / value", "field type", "weight %"],
    ["template", "Systems Mastery - Novice || V1", "", "", ""],
    ["", "", "", "", ""],
    ["domain", "coding", "Coding", "25", "1"],
    ["card_field", "question", "Question", "text", ""],
    ["card_field", "ps_rating", "Problem Solving", "scored_dropdown", "50"],
    ["option", "5", "Solved independently with the most efficient solution, explained clearly", "", ""],
    ["option", "4", "Solved with 1 minor nudge, reached optimal approach with good reasoning", "", ""],
    ["option", "3", "Solved with a working but non-optimal approach, understood the logic", "", ""],
    ["option", "2", "Partial basic solution only, needed multiple hints to get there", "", ""],
    ["option", "1", "Minimal progress, could not reach even a basic working approach", "", ""],
    ["card_field", "ps_remarks", "Remarks on Problem Solving", "text", ""],
    ["card_field", "ci_rating", "Code Implementation", "scored_dropdown", "50"],
    ["option", "5", "Clean, optimal, well-structured implementation with clear explanation", "", ""],
    ["option", "4", "Clean code with minor issues, good structure and readability", "", ""],
    ["option", "3", "Working but non-optimal code, understood the structure", "", ""],
    ["option", "2", "Wrote some code but with significant errors and gaps", "", ""],
    ["option", "1", "Could not write any meaningful code", "", ""],
    ["domain_field", "domain_remarks", "Domain Remarks", "text", ""],
    ["", "", "", "", ""],
    ["domain", "theory", "Theory", "25", "1"],
    ["card_field", "subject", "Subject", "dropdown", ""],
    ["option", "Data Structures", "", "", ""],
    ["option", "Algorithms", "", "", ""],
    ["option", "Operating Systems", "", "", ""],
    ["card_field", "question", "Question", "text", ""],
    ["card_field", "question_rating", "Question Rating", "scored_dropdown", "100"],
    ["option", "5", "Excellent depth, handled all follow-ups confidently", "", ""],
    ["option", "4", "Good understanding with solid follow-up answers", "", ""],
    ["option", "3", "Correct but textbook answer, struggled when follow-ups pushed deeper", "", ""],
    ["option", "2", "Partial answer, follow-ups frequently exposed gaps in understanding", "", ""],
    ["option", "1", "Incorrect or could not answer", "", ""],
    ["domain_field", "domain_remarks", "Domain Remarks", "text", ""],
    ["", "", "", "", ""],
    ["domain", "project", "Project", "25", "1"],
    ["card_field", "project_type", "Project Type", "dropdown", ""],
    ["option", "Individual", "", "", ""],
    ["option", "Team", "", "", ""],
    ["option", "Open Source Contribution", "", "", ""],
    ["option", "Capstone / Guided project", "", "", ""],
    ["card_field", "project_link", "Project Link", "text", ""],
    ["card_field", "build_approach", "Build Approach", "dropdown", ""],
    ["option", "Built from scratch", "", "", ""],
    ["option", "Tutorial-based (modified)", "", "", ""],
    ["option", "Fork/Clone (customized)", "", "", ""],
    ["option", "Template-based", "", "", ""],
    ["card_field", "explanation", "Project Explanation", "text", ""],
    ["card_field", "project_rating", "Project Rating", "scored_dropdown", "100"],
    ["option", "5", "Deep understanding, articulated all decisions and trade-offs clearly", "", ""],
    ["option", "4", "Good understanding, can explain most decisions and challenges", "", ""],
    ["option", "3", "Understands broadly, vague on specific decisions", "", ""],
    ["option", "2", "Thin understanding, likely limited hands-on involvement", "", ""],
    ["option", "1", "No meaningful understanding of the project", "", ""],
    ["domain_field", "domain_remarks", "Domain Remarks", "text", ""],
    ["", "", "", "", ""],
    ["domain", "resume", "Resume", "25", "0"],
    ["domain_field", "domain_rating", "Resume Rating", "scored_dropdown", ""],
    ["option", "5", "Strong, well-rounded profile with clear evidence of depth", "", ""],
    ["option", "4", "Solid skills demonstrated with good examples", "", ""],
    ["option", "3", "Knows the surface, basic understanding demonstrated", "", ""],
    ["option", "2", "Familiar - surface-level knowledge only", "", ""],
    ["option", "1", "No relevant skills or experience demonstrated", "", ""],
    ["domain_field", "domain_remarks", "Resume Remarks", "text", ""],
    ["", "", "", "", ""],
    ["domain", "overall_feedback", "Overall Feedback", "0", "0"],
    ["domain_field", "domain_remarks", "Overall Remarks", "text", ""],
  ];
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
  wsTemplate["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 64 }, { wch: 20 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
  XLSX.utils.book_append_sheet(wb, wsTemplate, "Sample Template");
  XLSX.writeFile(wb, "interview_template_sample.xlsx");
}

function exportTemplateToExcel(template) {
  const rows = [
    ["type", "id / score", "label / value", "field type", "weight %"],
    ["template", template.name, "", "", ""],
  ];
  const domains = (template.domains || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const domain of domains) {
    rows.push(["", "", "", "", ""]);
    rows.push(["domain", domain.type, domain.label, domain.weightInVerdict ?? 0, domain.defaultCardCount ?? 0]);
    for (const field of (domain.cardFields || [])) {
      if (field.type === "computed") continue;
      rows.push(["card_field", field.id, field.label, field.type, field.type === "scored_dropdown" ? (field.weight ?? "") : ""]);
      if (field.type === "scored_dropdown" && Array.isArray(field.options)) {
        for (const opt of field.options) rows.push(["option", opt.score, opt.label, "", ""]);
      } else if (field.type === "dropdown" && Array.isArray(field.options)) {
        for (const opt of field.options) rows.push(["option", opt, "", "", ""]);
      }
    }
    for (const field of (domain.domainFields || [])) {
      if (field.type === "computed_domain") continue;
      rows.push(["domain_field", field.id, field.label, field.type, field.type === "scored_dropdown" ? (field.weight ?? "") : ""]);
      if (field.type === "scored_dropdown" && Array.isArray(field.options)) {
        for (const opt of field.options) rows.push(["option", opt.score, opt.label, "", ""]);
      } else if (field.type === "dropdown" && Array.isArray(field.options)) {
        for (const opt of field.options) rows.push(["option", opt, "", "", ""]);
      }
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 64 }, { wch: 20 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `${template.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_")}.xlsx`);
}

function parseCSV(text) {
  return text.split(/\r?\n/).map(l => {
    const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const knownTypes = ["coding", "theory", "project", "resume", "section", "type", "question type"];
    if (cols.length > 1 && knownTypes.includes(cols[0].toLowerCase())) return cols.slice(1).join(",").trim();
    return cols[0].trim();
  }).filter(Boolean);
}

// ── ScoredOptionList ──────────────────────────────────────────────────────────

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

// ── PlainOptionList (tag-based) ───────────────────────────────────────────────

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

// ── FieldItem ─────────────────────────────────────────────────────────────────

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

        {/* Weight input — only for scored_dropdown card fields */}
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

// ── FieldListEditor ───────────────────────────────────────────────────────────

function FieldListEditor({ fields, onChange, addLabel, showWeight }) {
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

      {/* Weight total indicator — only when multiple scored dropdowns exist */}
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

// ── DomainRow ─────────────────────────────────────────────────────────────────

function DomainRow({ domain, isFirst, isLast, onChange, onRemove, onMove }) {
  const [showFields, setShowFields] = useState(false);

  const hasCardFields = (domain.cardFields || []).length > 0;
  const cardHasScoredDropdown = (domain.cardFields || []).some(f => f.type === "scored_dropdown");

  return (
    <div className={`rounded-xl border transition-colors ${domain.enabled ? "border-gray-200 bg-white shadow-sm" : "border-gray-200 bg-gray-50"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => onChange({ ...domain, enabled: !domain.enabled })}
          className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative p-0 leading-none self-center ${domain.enabled ? "bg-indigo-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ${domain.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>

        <input type="text" value={domain.label}
          onChange={e => {
            const label = e.target.value;
            const slug = slugify(label);
            onChange({ ...domain, label, id: slug, type: slug });
          }}
          disabled={!domain.enabled}
          className={`flex-1 text-sm font-semibold bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none py-0.5 transition-colors min-w-0 ${domain.enabled ? "text-gray-800" : "text-gray-400"}`}
        />

        <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{slugify(domain.label)}</span>

        <div className="flex gap-0.5 flex-shrink-0">
          <button type="button" disabled={isFirst} onClick={() => onMove("up")}
            className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button type="button" disabled={isLast} onClick={() => onMove("down")}
            className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <button type="button" onClick={onRemove}
          className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors flex-shrink-0"
          title="Remove domain">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Settings */}
      {domain.enabled && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-1.5 pb-3 border-t border-gray-100">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Weight
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={5}
                value={domain.weightInVerdict ?? 0}
                onChange={e => onChange({ ...domain, weightInVerdict: parseFloat(e.target.value) || 0 })}
                className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
                className="w-12 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
          )}

          <button type="button" onClick={() => setShowFields(s => !s)}
            className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors">
            {showFields ? "Hide Fields ▲" : "Edit Fields ▼"}
          </button>
        </div>
      )}

      {/* Field editor */}
      {domain.enabled && showFields && (
        <div className="border-t border-gray-100 bg-slate-50 p-4 space-y-5 rounded-b-xl">

          {/* Card Fields */}
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
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1z" />
                </svg>
                <span className="text-xs text-amber-700 font-medium">Domain Rating — auto-computed (avg of card ratings)</span>
              </div>
            )}
            {!hasCardFields && (domain.domainFields || []).some(f => f.type === "scored_dropdown") && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-xs text-blue-700 font-medium">No-card domain — first Scored Dropdown in Domain Fields = Domain Rating</span>
              </div>
            )}
          </div>

          {/* Domain Level Fields */}
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
      )}
    </div>
  );
}

// ── Add Domain panel ──────────────────────────────────────────────────────────

function AddDomainPanel({ onAdd }) {
  const [open, setOpen] = useState(false);
  const presets = DOMAIN_TYPE_ORDER.map(t => ({ type: t, label: DOMAIN_PRESETS[t].label }));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 text-sm font-medium hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Domain
      </button>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Add Domain</span>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">Pick a preset to add with default fields, or create a blank custom domain.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map(p => (
          <button key={p.type} type="button" onClick={() => { onAdd(p.type); setOpen(false); }}
            className="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-white text-gray-700 hover:text-indigo-700 transition-colors shadow-sm">
            {p.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => { onAdd("custom"); setOpen(false); }}
        className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
        + Blank Custom Domain
      </button>
    </div>
  );
}

// ── Question bank section ─────────────────────────────────────────────────────

function QuestionBankSection({ bankKey, label, placeholder, note, value, onChange }) {
  const fileRef = useRef(null);
  const count = value.split("\n").filter(l => l.trim()).length;

  const handleCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const incoming = parseCSV(ev.target.result);
      const existing = value.split("\n").map(q => q.trim()).filter(Boolean);
      onChange([...new Set([...existing, ...incoming])].join("\n"));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{label}</span>
          {count > 0 && (
            <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{count}</span>
          )}
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSV} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload CSV
          </button>
        </div>
      </div>
      {note && <p className="px-4 pt-2 text-xs text-indigo-600">{note}</p>}
      <textarea rows={4} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates,     setTemplates]     = useState([]);
  const [programs,      setPrograms]      = useState([]);
  const [interviews,    setInterviews]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [form,          setForm]          = useState(makeEmptyForm);
  const [qbTexts,       setQbTexts]       = useState({ theory: "", coding: "", project: "", resume: "" });
  const [activeTab,     setActiveTab]     = useState("domains");
  const [bankQuestions, setBankQuestions] = useState([]);
  const [assignedQIds,  setAssignedQIds]  = useState([]);
  const [qbSearch,      setQbSearch]      = useState("");
  const [qbDomainFilter,setQbDomainFilter]= useState("");
  const [saving,        setSaving]        = useState(false);
  const [migrating,     setMigrating]     = useState(false);
  const [toast,         setToast]         = useState(null);
  const [csvErrors,     setCsvErrors]     = useState([]);
  const csvFileRef = useRef(null);

  // Program tabs state
  const [skills,         setSkills]         = useState([]);

  const [activeProgram,  setActiveProgram]  = useState("all"); // "all" | programId | "unassigned"
  const [addingProgram,  setAddingProgram]  = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [editingProgram, setEditingProgram] = useState(null); // { id, name }
  const newProgramRef = useRef(null);

  const load = () => getTemplates().then(t => { setTemplates(t); setLoading(false); });
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const unsub1 = subscribeToPrograms(setPrograms);
    const unsub2 = subscribeToInterviews(setInterviews);
    const unsub3 = subscribeToSkills(setSkills);
    const unsub4 = subscribeToQuestions(qs => setBankQuestions(qs.filter(q => q.status !== "archived")));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  useEffect(() => {
    if (addingProgram) newProgramRef.current?.focus();
  }, [addingProgram]);

  // Stats per templateId: { [id]: { scheduled, completed, cancelled } }
  const templateStats = interviews.reduce((acc, iv) => {
    const tid = iv.templateId;
    if (!tid) return acc;
    if (!acc[tid]) acc[tid] = { scheduled: 0, completed: 0, cancelled: 0 };
    if (iv.status === "completed")                                      acc[tid].completed++;
    else if (iv.status === "cancelled" || iv.status === "no_show")      acc[tid].cancelled++;
    else if (iv.status !== "declined")                                  acc[tid].scheduled++;
    return acc;
  }, {});

  const toTexts = (qb = {}) => ({
    theory:  (qb.theory  || []).join("\n"),
    coding:  (qb.coding  || []).join("\n"),
    project: (qb.project || []).join("\n"),
    resume:  (qb.resume  || []).join("\n"),
  });

  const toArrays = (texts = {}) => ({
    theory:  texts.theory?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
    coding:  texts.coding?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
    project: texts.project?.split("\n").map(q => q.trim()).filter(Boolean) || [],
    resume:  texts.resume?.split("\n").map(q => q.trim()).filter(Boolean)  || [],
  });

  const openNew = () => {
    if (templates.length === 0) {
      openBlank();
    } else {
      setShowNewPicker(true);
    }
  };

  const openBlank = () => {
    setEditTarget(null);
    const defaultProgram = (activeProgram !== "all" && activeProgram !== "unassigned") ? activeProgram : "";
    setForm({ name: "", program: defaultProgram, skills: [], domains: [], questionBank: {} });
    setQbTexts({ theory: "", coding: "", project: "", resume: "" });
    setAssignedQIds([]);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowNewPicker(false);
    setShowModal(true);
  };

  const migrateDomainsForEdit = (rawDomains) =>
    rawDomains.map(domain => {
      const cardFields = (domain.cardFields || [])
        .filter(f => f.type !== "computed")
        .map(f => {
          if (f.type === "dropdown" && f.options?.length > 0 && f.optionsSource) {
            const { optionsSource, ...rest } = f;
            return rest;
          }
          return f;
        });
      const existing = (domain.domainFields || []).filter(f => f.type !== "computed_domain");
      // If no domain-level fields exist (old schema), seed from preset so the user sees defaults
      const domainFields = existing.length > 0
        ? existing
        : deepClone(DOMAIN_PRESETS[domain.type]?.domainFields || []);
      const scored = cardFields.filter(f => f.type === "scored_dropdown");
      const hasWeights = scored.some(f => f.weight != null);
      const migratedCardFields = (scored.length > 0 && !hasWeights)
        ? cardFields.map(f => f.type === "scored_dropdown"
            ? { ...f, weight: parseFloat((100 / scored.length).toFixed(1)) }
            : f)
        : cardFields;
      return { ...domain, cardFields: migratedCardFields, domainFields };
    });

  const openClone = (source) => {
    setEditTarget(null);
    const rawDomains = (source.domains || []).length > 0
      ? source.domains
      : DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i }));
    const resluggedDomains = deepClone(migrateDomainsForEdit(rawDomains)).map(d => {
      const slug = slugify(d.label) || d.id;
      return { ...d, id: slug, type: slug };
    });
    setForm({ name: `Copy of ${source.name}`, program: source.program || "", skills: source.skills || [], domains: resluggedDomains });
    setQbTexts(toTexts(source.questionBank || source.questions));
    setAssignedQIds(source.questionIds || []);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowNewPicker(false);
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditTarget(t);
    const rawDomains = (t.domains || []).length > 0
      ? t.domains
      : DOMAIN_TYPE_ORDER.map((type, i) => ({ ...deepClone(DOMAIN_PRESETS[type]), order: i }));
    setForm({ name: t.name, program: t.program || "", skills: t.skills || [], domains: deepClone(migrateDomainsForEdit(rawDomains)) });
    setQbTexts(toTexts(t.questionBank || t.questions));
    setAssignedQIds(t.questionIds || []);
    setQbSearch(""); setQbDomainFilter("");
    setActiveTab("domains");
    setShowModal(true);
  };

  // Program CRUD
  const handleAddProgram = async () => {
    const name = newProgramName.trim();
    if (!name) return;
    await createProgram(name, programs.length);
    setNewProgramName("");
    setAddingProgram(false);
  };

  const handleRenameProgram = async () => {
    if (!editingProgram || !editingProgram.name.trim()) return;
    await updateProgram(editingProgram.id, { name: editingProgram.name.trim() });
    setEditingProgram(null);
  };

  const handleDeleteProgram = async (p) => {
    const count = templates.filter(t => t.program === p.id).length;
    const msg = count > 0
      ? `Delete "${p.name}"? ${count} template(s) will become Unassigned.`
      : `Delete program "${p.name}"?`;
    if (!confirm(msg)) return;
    if (count > 0) {
      await Promise.all(templates.filter(t => t.program === p.id).map(t => updateTemplate(t.id, { program: "" })));
    }
    await deleteProgram(p.id);
    if (activeProgram === p.id) setActiveProgram("all");
    setToast({ message: `"${p.name}" deleted.` });
    load();
  };

  // ── CSV import ─────────────────────────────────────────────────────────────

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { template, errors } = parseTemplateCSV(ev.target.result);
      if (errors.length) { setCsvErrors(errors); return; }
      setCsvErrors([]);
      setEditTarget(null);
      setForm({ name: template.name, domains: template.domains, questionBank: template.questionBank || {} });
      setQbTexts({ theory: "", coding: "", project: "", resume: "" });
      setActiveTab("domains");
      setShowNewPicker(false);
      setShowModal(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };


  // ── Domain mutations ────────────────────────────────────────────────────────

  const updateDomain = (domainId, newDomain) =>
    setForm(prev => ({
      ...prev,
      domains: prev.domains.map(d => d.id === domainId ? newDomain : d),
    }));

  const moveDomain = (domainId, direction) => {
    setForm(prev => {
      const sorted = [...prev.domains].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(d => d.id === domainId);
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === sorted.length - 1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      const next = [...sorted];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, domains: next.map((d, i) => ({ ...d, order: i })) };
    });
  };

  const addDomain = (type) => {
    if (type === "custom") {
      setForm(prev => {
        const customCount = prev.domains.filter(d => d.type === "custom").length;
        const newId = `custom_${customCount + 1}`;
        return {
          ...prev,
          domains: [...prev.domains, {
            id: newId, type: "custom", label: "New Domain",
            order: prev.domains.length, enabled: true, weightInVerdict: 0,
            defaultCardCount: 0, cardFields: [],
            domainFields: [{ id: makeFieldId("domain_remarks"), label: "Domain Remarks", type: "text", placeholder: "" }],
          }],
        };
      });
    } else {
      const preset = DOMAIN_PRESETS[type];
      if (!preset) return;
      setForm(prev => {
        const existing = prev.domains.filter(d => d.type === type);
        const newId = existing.length > 0 ? `${type}_${existing.length + 1}` : type;
        return {
          ...prev,
          domains: [...prev.domains, { ...deepClone(preset), id: newId, order: prev.domains.length }],
        };
      });
    }
  };

  const removeDomain = (domainId) => {
    setForm(prev => ({
      ...prev,
      domains: prev.domains.filter(d => d.id !== domainId).map((d, i) => ({ ...d, order: i })),
    }));
  };

  const equalize = () => {
    const scored = sortedDomains.filter(d => d.enabled && (d.weightInVerdict ?? 0) > 0);
    if (!scored.length) return;
    const share = parseFloat((100 / scored.length).toFixed(1));
    setForm(prev => ({
      ...prev,
      domains: prev.domains.map(d =>
        d.enabled && (d.weightInVerdict ?? 0) > 0 ? { ...d, weightInVerdict: share } : d
      ),
    }));
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) return setToast({ message: "Template name is required.", type: "error" });
    const scored = sortedDomains.filter(d => d.enabled && (d.weightInVerdict ?? 0) > 0);
    const total = scored.reduce((s, d) => s + (d.weightInVerdict ?? 0), 0);
    if (scored.length > 0 && Math.abs(total - 100) > 0.5) {
      return setToast({ message: `Domain weights must total 100% (currently ${total}%). Use Equalize to fix.`, type: "error" });
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        program: form.program || "",
        skills: form.skills || [],
        domains: [...form.domains].sort((a, b) => a.order - b.order),
        questionBank: toArrays(qbTexts),
        questionIds: assignedQIds,
        schemaVersion: 2,
      };
      if (editTarget) {
        await updateTemplate(editTarget.id, data);
        setToast({ message: "Template updated." });
      } else {
        await createTemplate(data);
        setToast({ message: "Template created." });
      }
      setShowModal(false);
      const fresh = await getTemplates();
      setTemplates(fresh);
      if (previewTarget && editTarget && previewTarget.id === editTarget.id) {
        const updated = fresh.find(t => t.id === editTarget.id);
        if (updated) setPreviewTarget(updated);
      }
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete "${t.name}"? This won't affect existing interviews.`)) return;
    await deleteTemplate(t.id);
    setToast({ message: "Template deleted." });
    load();
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const sortedDomains  = [...form.domains].sort((a, b) => a.order - b.order);
  const enabledDomains = sortedDomains.filter(d => d.enabled);
  const scoredDomains  = enabledDomains.filter(d => (d.weightInVerdict ?? 0) > 0);
  const totalWeight    = scoredDomains.reduce((s, d) => s + (d.weightInVerdict ?? 0), 0);
  const weightOk       = scoredDomains.length === 0 || Math.abs(totalWeight - 100) < 0.5;

  const QB_META = {
    theory:  { label: "Theory — Subject list",   placeholder: "One subject per line…\ne.g. Data Structures\nAlgorithms", note: "These become options in the Theory → Subject dropdown" },
    coding:  { label: "Coding — Problem bank",   placeholder: "One problem per line…" },
    project: { label: "Project — Question bank", placeholder: "One question per line…" },
    resume:  { label: "Resume — Question bank",  placeholder: "One question per line…" },
  };
  const qbSections = enabledDomains
    .filter(d => d.type !== "overall_feedback")
    .map(d => ({
      key:         d.type,
      label:       QB_META[d.type]?.label       ?? `${d.label} — Question bank`,
      placeholder: QB_META[d.type]?.placeholder ?? "One question per line…",
      note:        QB_META[d.type]?.note,
    }));

  const previewTemplate = previewTarget && {
    ...previewTarget,
    questionBank: previewTarget.questionBank || previewTarget.questions || {},
  };

  // Filtered templates for the active program tab
  const visibleTemplates = templates.filter(t => {
    if (activeProgram === "all")        return true;
    if (activeProgram === "unassigned") return !t.program;
    return t.program === activeProgram;
  });

  const handleMigrateDomainIds = async () => {
    if (!confirm(
      `This will re-generate domain IDs from their labels for all ${templates.length} template(s).\n\nExample: "Drill Down on Web Coding Questions" → drill_down_on_web_coding_questions\n\nContinue?`
    )) return;
    setMigrating(true);
    try {
      for (const t of templates) {
        const newDomains = (t.domains || []).map(d => {
          const slug = slugify(d.label) || d.id;
          return { ...d, id: slug, type: slug };
        });
        await updateTemplate(t.id, { domains: newDomains });
      }
      setToast({ message: `${templates.length} template(s) migrated — domain IDs now match labels.` });
      load();
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setMigrating(false);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define domains, evaluation fields, and question banks</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleMigrateDomainIds} disabled={migrating || templates.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-40 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {migrating ? "Migrating…" : "Sync Domain IDs"}
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Template
          </button>
        </div>
      </div>

      {/* ── Program Tabs ── */}
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {/* All tab */}
        {[
          { id: "all",        label: "All",        count: templates.length },
          ...programs.map(p => ({ id: p.id, label: p.name, count: templates.filter(t => t.program === p.id).length, prog: p })),
          { id: "unassigned", label: "Unassigned",  count: templates.filter(t => !t.program).length },
        ].map(tab => (
          <div key={tab.id} className="relative group flex items-center">
            {editingProgram?.id === tab.id ? (
              <input
                autoFocus
                value={editingProgram.name}
                onChange={e => setEditingProgram(s => ({ ...s, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleRenameProgram(); if (e.key === "Escape") setEditingProgram(null); }}
                onBlur={handleRenameProgram}
                className="px-3 py-1.5 rounded-lg border border-indigo-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36"
              />
            ) : (
              <button
                onClick={() => setActiveProgram(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeProgram === tab.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {tab.label}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeProgram === tab.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>{tab.count}</span>
              </button>
            )}
            {/* Rename / delete on program tabs (not All or Unassigned) */}
            {tab.prog && editingProgram?.id !== tab.id && (
              <div className="hidden group-hover:flex items-center gap-0.5 absolute -top-2 right-0 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-10">
                <button
                  onClick={() => setEditingProgram({ id: tab.id, name: tab.label })}
                  className="p-0.5 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Rename">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteProgram(tab.prog)}
                  className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete program">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* + Add Program */}
        {addingProgram ? (
          <input
            ref={newProgramRef}
            value={newProgramName}
            onChange={e => setNewProgramName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddProgram(); if (e.key === "Escape") { setAddingProgram(false); setNewProgramName(""); } }}
            onBlur={() => { if (!newProgramName.trim()) { setAddingProgram(false); setNewProgramName(""); } }}
            placeholder="Program name…"
            className="px-3 py-1.5 rounded-lg border border-indigo-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
          />
        ) : (
          <button
            onClick={() => setAddingProgram(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 border border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Program
          </button>
        )}
      </div>

      {/* ── Template list ── */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visibleTemplates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          {templates.length === 0 ? (
            <>
              <p className="text-gray-400 text-sm mb-4">No templates yet.</p>
              <button onClick={openNew} className="text-indigo-600 text-sm font-semibold hover:underline">
                Create your first template →
              </button>
            </>
          ) : (
            <p className="text-gray-400 text-sm">No templates in this program yet.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleTemplates.map(t => {
            const domains = (t.domains || []).filter(d => d.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const isV2 = t.schemaVersion === 2;
            const stats = templateStats[t.id];
            const programName = programs.find(p => p.id === t.program)?.name;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h2 className="text-base font-bold text-gray-900 leading-tight">{t.name}</h2>
                  </div>
                  <KebabMenu actions={[
                    { label: "Preview",  onClick: () => setPreviewTarget(t) },
                    { label: "Export",   onClick: () => exportTemplateToExcel(t), highlight: true },
                    { label: "Edit",     onClick: () => openEdit(t) },
                    { label: "Delete",   onClick: () => handleDelete(t), danger: true },
                  ]} />
                </div>

                {/* Program badge (only visible on "All" tab) */}
                {activeProgram === "all" && programName && (
                  <span className="self-start text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                    {programName}
                  </span>
                )}

                {/* Domain chips */}
                {isV2 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {domains.map(d => (
                      <span key={d.id} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                        {d.label}{(d.weightInVerdict ?? 0) > 0 ? ` ${d.weightInVerdict}%` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {["Coding", t.hasTheory && "Theory", t.hasProject && "Project", t.hasResume && "Resume"].filter(Boolean).map(l => (
                      <span key={l} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{l}</span>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400">Created {new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Interview Stats Table ── */}
      {!loading && visibleTemplates.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Interview Stats</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Template", "Program", "Scheduled", "Completed", "Cancelled", "Total"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleTemplates.map(t => {
                  const s = templateStats[t.id];
                  const programName = programs.find(p => p.id === t.program)?.name;
                  const scheduled  = s?.scheduled  ?? 0;
                  const completed  = s?.completed  ?? 0;
                  const cancelled  = s?.cancelled  ?? 0;
                  const total      = scheduled + completed + cancelled;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                      <td className="px-4 py-3">
                        {programName
                          ? <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">{programName}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-indigo-700">{scheduled}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-emerald-700">{completed}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-red-500">{cancelled}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-gray-700">{total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── New Template Picker Modal ── */}
      <Modal open={showNewPicker} onClose={() => setShowNewPicker(false)} title="New Interview Template">
        <div className="space-y-4">
          {/* From scratch */}
          <button
            type="button"
            onClick={openBlank}
            className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 group-hover:bg-indigo-200 rounded-xl flex items-center justify-center transition-colors">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Start from scratch</p>
              <p className="text-xs text-gray-500 mt-0.5">Build a new template with the default domain structure</p>
            </div>
          </button>

          {/* Import from CSV */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Import from CSV</p>
            <button
              type="button"
              onClick={() => { setCsvErrors([]); csvFileRef.current?.click(); }}
              className="w-full flex items-start gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left group"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Upload CSV file</p>
                <p className="text-xs text-gray-500 mt-0.5">Build the full template — domains, fields, weights, options — from a spreadsheet</p>
              </div>
            </button>
            <input ref={csvFileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />

            <button type="button" onClick={downloadSampleExcel}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-1.5 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download sample Excel template
            </button>

            {csvErrors.length > 0 && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <p className="text-xs font-bold text-red-700 mb-1">CSV parse errors — fix these and re-upload:</p>
                {csvErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">• {err}</p>
                ))}
              </div>
            )}
          </div>

          {/* Clone existing */}
          {templates.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Clone an existing template</p>
              <div className="space-y-2">
                {templates.map(t => {
                  const domains = (t.domains || []).filter(d => d.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openClone(t)}
                      className="w-full flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left group"
                    >
                      <div className="flex-shrink-0 w-10 h-10 bg-gray-100 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-gray-500 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{t.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {domains.map(d => (
                            <span key={d.id} className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                              {d.label}{(d.weightInVerdict ?? 0) > 0 ? ` ${d.weightInVerdict}%` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Edit Template" : "New Interview Template"} wide>
        <div className="space-y-5">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Template Name *
              </label>
              <input type="text" placeholder="e.g. Systems Mastery - Novice || V1"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Program
              </label>
              <select
                value={form.program || ""}
                onChange={e => setForm(f => ({ ...f, program: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">— Unassigned —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Required Skills</label>
            <SkillsSelect
              skills={skills}
              value={form.skills || []}
              onChange={v => setForm(f => ({ ...f, skills: v }))}
              placeholder="Tag required skills for this template…"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[["domains", "Domains"], ["questionbank", "Question Banks"]].map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>{label}</button>
            ))}
          </div>

          {/* ── Domains tab ── */}
          {activeTab === "domains" && (
            <div className="space-y-2">
              {sortedDomains.map((domain, i) => (
                <DomainRow
                  key={domain.id}
                  domain={domain}
                  isFirst={i === 0}
                  isLast={i === sortedDomains.length - 1}
                  onChange={newDomain => updateDomain(domain.id, newDomain)}
                  onRemove={() => removeDomain(domain.id)}
                  onMove={dir => moveDomain(domain.id, dir)}
                />
              ))}

              <AddDomainPanel onAdd={addDomain} />

              {/* Weight total indicator */}
              <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${
                weightOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2">
                  {weightOk ? (
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                  <span className={`text-sm font-semibold ${weightOk ? "text-emerald-700" : "text-red-700"}`}>
                    Total verdict weight: {totalWeight.toFixed(1)}%
                  </span>
                  {!weightOk && <span className="text-xs text-red-500">Must equal 100%</span>}
                </div>
                <button type="button" onClick={equalize}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  Equalize
                </button>
              </div>
            </div>
          )}

          {/* ── Question Banks tab ── */}
          {activeTab === "questionbank" && (() => {
            const enabledTypes = new Set(enabledDomains.filter(d => d.type !== "overall_feedback").map(d => d.type));
            const assigned   = bankQuestions.filter(q => assignedQIds.includes(q.id));
            const available  = bankQuestions.filter(q => !assignedQIds.includes(q.id) && (enabledTypes.size === 0 || enabledTypes.has(q.domainType)));
            const filteredAvail = available.filter(q => {
              if (qbDomainFilter && q.domainType !== qbDomainFilter) return false;
              if (qbSearch) {
                const sq = qbSearch.toLowerCase();
                return q.text?.toLowerCase().includes(sq) || q.topic?.toLowerCase().includes(sq);
              }
              return true;
            });
            const availDomainTypes = [...new Set(available.map(q => q.domainType).filter(Boolean))].sort();
            const DIFF_COLORS = { easy: "text-emerald-600", medium: "text-amber-600", hard: "text-red-600" };

            return (
              <div className="space-y-4">
                {/* Assigned questions */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Assigned to this template ({assigned.length})
                  </p>
                  {assigned.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center">
                      <p className="text-sm text-gray-400">No questions assigned yet. Search below to add from the bank.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto">
                      {assigned.map(q => (
                        <div key={q.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{q.text}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-indigo-500">{q.domainType}</span>
                              {q.topic && <span className="text-[10px] text-gray-400">· {q.topic}</span>}
                              {q.difficulty && <span className={`text-[10px] font-semibold ${DIFF_COLORS[q.difficulty] || ""}`}>· {q.difficulty}</span>}
                            </div>
                          </div>
                          <button type="button"
                            onClick={() => setAssignedQIds(ids => ids.filter(id => id !== q.id))}
                            className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors mt-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search from bank */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Add from Question Bank
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Search questions…"
                      value={qbSearch}
                      onChange={e => setQbSearch(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <select value={qbDomainFilter} onChange={e => setQbDomainFilter(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">All Domains</option>
                      {availDomainTypes.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {bankQuestions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No questions in the bank yet. Go to <span className="font-semibold">Question Bank</span> to add some.
                    </p>
                  ) : filteredAvail.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {available.length === 0 ? "All matching questions are already assigned." : "No questions match your search."}
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {filteredAvail.map(q => (
                        <button key={q.id} type="button"
                          onClick={() => setAssignedQIds(ids => [...ids, q.id])}
                          className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors">
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{q.text}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-indigo-500">{q.domainType}</span>
                              {q.topic && <span className="text-[10px] text-gray-400">· {q.topic}</span>}
                              {q.difficulty && <span className={`text-[10px] font-semibold ${DIFF_COLORS[q.difficulty] || ""}`}>· {q.difficulty}</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving…" : editTarget ? "Update Template" : "Create Template"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Preview Modal ── */}
      {previewTarget && (
        <Modal open onClose={() => setPreviewTarget(null)} title={`Preview — ${previewTarget.name}`} wide>
          <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="text-xs text-amber-700 font-medium">
              Preview mode — exactly what the interviewer will see. Interactive but nothing is saved.
            </p>
          </div>
          {previewTemplate?.domains ? (
            <DynamicFeedbackForm
              template={previewTemplate}
              interview={null}
              onSubmit={() => {}}
              saving={false}
              previewMode
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              Legacy template format. Edit and re-save to upgrade.
            </p>
          )}
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
