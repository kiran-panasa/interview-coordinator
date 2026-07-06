import { splitCSVLines, parseLine } from "./csv";
import { slugify } from "./strings";
export { buildFeedbackFromCSV } from "../services/import.service";

export const VERDICT_MAP = { proceed: "Proceed", hold: "Hold", reject: "Reject" };

function normalizeDate(s) {
  if (!s) return null;
  s = s.trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function normalizeTime(s) {
  if (!s) return null;
  s = s.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) return `${ampm[1]}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  const h24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    let h = parseInt(h24[1]);
    const m = h24[2];
    const suf = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${suf}`;
  }
  return null;
}

export function parseImportCSV(text, candidates, interviewers, templates, existing) {
  const lines = splitCSVLines(text);
  if (lines.length < 2) return { globalError: "Need at least a header row and one data row." };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const REQ = ["candidateemail", "intervieweremail", "templatename", "date", "time"];
  const missing = REQ.filter(h => !headers.includes(h));
  if (missing.length) return { globalError: `Missing columns: ${missing.join(", ")}` };

  const idx = name => headers.indexOf(name.toLowerCase().replace(/\s+/g, ""));

  return {
    rows: lines.slice(1).map((line, i) => {
      const f = parseLine(line);
      const g = name => (f[idx(name)] || "").trim();

      const raw = {
        candidateEmail:   g("candidateEmail"),
        interviewerEmail: g("interviewerEmail"),
        templateName:     g("templateName"),
        date:             g("date"),
        time:             g("time"),
        round:            g("round") || "Round 1",
        verdict:          g("verdict"),
        notes:            g("notes"),
      };

      const errors = [], warnings = [];

      const candidate = candidates.find(c => c.email?.toLowerCase() === raw.candidateEmail.toLowerCase());
      if (!raw.candidateEmail) errors.push("candidateEmail required");
      else if (!candidate) errors.push(`Candidate not found: ${raw.candidateEmail}`);

      const interviewer = interviewers.find(u => u.email?.toLowerCase() === raw.interviewerEmail.toLowerCase());
      if (!raw.interviewerEmail) errors.push("interviewerEmail required");
      else if (!interviewer) warnings.push(`Interviewer not yet onboarded (${raw.interviewerEmail}) — interview will appear on their dashboard when they sign up`);

      const template = templates.find(t => t.name.toLowerCase() === raw.templateName.toLowerCase());
      if (!raw.templateName) errors.push("templateName required");
      else if (!template) errors.push(`Template not found: "${raw.templateName}"`);

      const scheduledDate = normalizeDate(raw.date);
      if (!raw.date) errors.push("date required");
      else if (!scheduledDate) errors.push(`Bad date format: "${raw.date}" — use DD/MM/YYYY`);

      const scheduledTime = normalizeTime(raw.time);
      if (!raw.time) errors.push("time required");
      else if (!scheduledTime) errors.push(`Bad time format: "${raw.time}" — use "10:00 AM" or "14:00"`);

      const verdict = raw.verdict ? (VERDICT_MAP[raw.verdict.toLowerCase()] || raw.verdict) : "";

      const domainData = {};
      headers.forEach((h, j) => {
        if (h.endsWith("_rating") || h.endsWith("_notes")) domainData[h] = (f[j] || "").trim();
      });

      Object.entries(domainData).forEach(([k, v]) => {
        if (k.endsWith("_rating") && v) {
          const n = parseFloat(v);
          if (isNaN(n) || n < 0 || n > 5) warnings.push(`${k}: "${v}" is not a valid score (expected 0–5)`);
        }
      });

      const hasDomainFeedback = Object.values(domainData).some(Boolean);

      if (candidate && scheduledDate) {
        const dup = existing.some(iv => iv.candidateId === candidate.id && iv.scheduledDate === scheduledDate);
        if (dup) warnings.push("Duplicate: interview for this candidate on this date already exists");
      }

      return { rowNum: i + 2, raw, resolved: { candidate, interviewer, template, scheduledDate, scheduledTime, verdict, domainData, hasDomainFeedback }, errors, warnings };
    }),
  };
}

export function downloadImportTemplate(template) {
  const baseHeaders = ["candidateEmail", "interviewerEmail", "templateName", "date", "time", "round", "verdict", "notes"];
  const baseExample = [
    "john.doe@example.com", "interviewer@nxtwave.tech",
    template?.name || "Product Mastery - Novice",
    "15/06/2026", "10:00 AM", "Round 1", "Proceed", "Overall interview notes",
  ];

  const domainHeaders = [];
  const domainExample = [];

  if (template?.domains) {
    const sorted = [...template.domains]
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const d of sorted) {
      if (d.id === "overall_feedback") {
        domainHeaders.push(`${d.id}_notes`);
        domainExample.push("");
        continue;
      }

      const hasCardFields = (d.cardFields || []).length > 0;

      if (hasCardFields) {
        const cardCount = Math.max(d.defaultCardCount || 1, 1);
        for (let ci = 1; ci <= cardCount; ci++) {
          const pfx = cardCount > 1 ? `${d.id}_${ci}` : d.id;
          for (const f of d.cardFields) {
            if (f.type === "scored_dropdown") {
              domainHeaders.push(`${pfx}_${slugify(f.label)}_rating`);
              domainExample.push("3");
            }
          }
        }
      } else {
        domainHeaders.push(`${d.id}_rating`);
        domainExample.push("3");
      }

      domainHeaders.push(`${d.id}_notes`);
      domainExample.push(`Remarks for ${d.label}`);
    }
  }

  const rows = [
    [...baseHeaders, ...domainHeaders].join(","),
    [...baseExample, ...domainExample].map(v => (v.includes(",") || v.includes(" ")) ? `"${v}"` : v).join(","),
  ];

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = template ? `import_${template.name.replace(/\s+/g, "_")}.csv` : "interview_import_template.csv";
  a.click();
}

export { callAppsScript } from "../lib/appsScript";
