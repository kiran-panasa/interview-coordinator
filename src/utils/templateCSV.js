import * as XLSX from "xlsx";
import { makeFieldId, slugify } from "./templateHelpers";
import { splitCSVRow } from "./csv";

export function parseTemplateCSV(text) {
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
    if (!type || type === "type") continue;

    if (type === "template") {
      template.name = row[1] || "";

    } else if (type === "domain") {
      currentField = null;
      const domainSlug = row[1]?.trim() || slugify(row[2] || "domain");
      currentDomain = {
        id:               domainSlug,
        type:             domainSlug,
        label:            row[2] || "Domain",
        order:            domainOrder++,
        enabled:          true,
        weightInVerdict:  parseFloat(row[3]) || 0,
        defaultCardCount: parseInt(row[4]) || 1,
        cardFields:       [],
        domainFields:     [],
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

export function downloadSampleExcel() {
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

export function exportTemplateToExcel(template) {
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

export function parseCSV(text) {
  return text.split(/\r?\n/).map(l => {
    const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const knownTypes = ["coding", "theory", "project", "resume", "section", "type", "question type"];
    if (cols.length > 1 && knownTypes.includes(cols[0].toLowerCase())) return cols.slice(1).join(",").trim();
    return cols[0].trim();
  }).filter(Boolean);
}
