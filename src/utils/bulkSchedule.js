import * as XLSX from "xlsx";
import { splitCSVLines, parseLine } from "./csv";

// Separate, from-scratch path for creating a batch of brand-new interviews
// (possibly across several different templates/panelists in one sheet) —
// deliberately NOT sharing code with utils/interviewImport.js, which is the
// existing "Import from Sheet" flow for bringing in ALREADY-COMPLETED
// interviews (feedback/verdicts/links), including its upsert-onto-existing
// behavior. That flow stays exactly as it was; this one always CREATES new
// scheduled interviews and never silently updates an existing record.

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

export function parseBulkScheduleCSV(text, candidates, interviewers, templates, existing) {
  const lines = splitCSVLines(text);
  if (lines.length < 2) return { globalError: "Need at least a header row and one data row." };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const REQ = ["intervieweremail", "templatename", "date", "time"];
  const missing = REQ.filter(h => !headers.includes(h));
  if (missing.length) return { globalError: `Missing columns: ${missing.join(", ")}` };
  if (!headers.includes("candidateemail") && !headers.includes("candidateuid")) {
    return { globalError: "Missing columns: candidateEmail or candidateUid (need at least one)" };
  }

  const idx = name => headers.indexOf(name.toLowerCase().replace(/\s+/g, ""));

  return {
    rows: lines.slice(1).map((line, i) => {
      const f = parseLine(line);
      const g = name => (f[idx(name)] || "").trim();

      const raw = {
        candidateEmail:   g("candidateEmail"),
        candidateUid:     g("candidateUid"),
        interviewerEmail: g("interviewerEmail"),
        templateName:     g("templateName"),
        date:             g("date"),
        time:             g("time"),
        duration:         g("duration"),
        round:            g("round") || "Round 1",
        notes:            g("notes"),
      };

      const errors = [], warnings = [];

      let candidate = raw.candidateEmail
        ? candidates.find(c => c.email?.toLowerCase() === raw.candidateEmail.toLowerCase())
        : null;
      if (!candidate && raw.candidateUid) {
        candidate = candidates.find(c => c.uid && c.uid === raw.candidateUid);
      }
      if (!raw.candidateEmail && !raw.candidateUid) errors.push("candidateEmail or candidateUid required");
      else if (!candidate) errors.push(`Candidate not found: ${raw.candidateEmail || raw.candidateUid}`);

      const interviewer = interviewers.find(u => u.email?.toLowerCase() === raw.interviewerEmail.toLowerCase());
      if (!raw.interviewerEmail) errors.push("interviewerEmail required");
      else if (!interviewer) errors.push(`Interviewer not found (or not active): ${raw.interviewerEmail}`);

      const template = templates.find(t => t.name.toLowerCase() === raw.templateName.toLowerCase());
      if (!raw.templateName) errors.push("templateName required");
      else if (!template) errors.push(`Template not found: "${raw.templateName}"`);

      const scheduledDate = normalizeDate(raw.date);
      if (!raw.date) errors.push("date required");
      else if (!scheduledDate) errors.push(`Bad date format: "${raw.date}" — use DD/MM/YYYY`);
      else if (scheduledDate < new Date().toISOString().slice(0, 10)) errors.push("Date is in the past — pick a future date");

      const scheduledTime = normalizeTime(raw.time);
      if (!raw.time) errors.push("time required");
      else if (!scheduledTime) errors.push(`Bad time format: "${raw.time}" — use "10:00 AM" or "14:00"`);

      let duration = null;
      if (raw.duration) {
        const n = parseInt(raw.duration, 10);
        if (isNaN(n) || n <= 0) warnings.push(`Invalid duration "${raw.duration}" — will use the template's default duration instead.`);
        else duration = n;
      }
      if (duration == null && template?.durationMinutes) duration = template.durationMinutes;
      if (duration == null) warnings.push("No duration given and the template has no default — will default to 60 minutes.");

      // Warn only — this path always CREATES a new interview, never updates
      // an existing one (unlike Import from Sheet's upsert), so a genuine
      // repeat run of the same sheet would otherwise silently double-book.
      if (candidate && template && scheduledDate) {
        const dup = existing.find(iv =>
          iv.candidateId === candidate.id && iv.templateId === template.id &&
          iv.scheduledDate === scheduledDate && iv.status !== "cancelled"
        );
        if (dup) warnings.push(`This candidate already has a ${dup.status} interview for this template on this date — this will create a SEPARATE interview, not update it.`);
      }

      return {
        rowNum: i + 2, raw,
        resolved: { candidate, interviewer, template, scheduledDate, scheduledTime, duration },
        errors, warnings,
      };
    }),
  };
}

// Excel-only (no plain-CSV variant) — a single, richer download that covers
// everything needed to fill in many rows across different templates/
// panelists without leaving the sheet: the data columns on one tab, and a
// live "Help" tab (panelists, templates, rounds, format notes) pulled from
// whatever's actually configured right now.
export function downloadBulkScheduleTemplate(interviewers = [], templates = [], rounds = [], DURATIONS = []) {
  const headers = ["candidateEmail", "candidateUid", "interviewerEmail", "templateName", "date", "time", "duration", "round", "notes"];
  const example = [
    "john.doe@example.com", "",
    interviewers[0]?.email || "interviewer@nxtwave.tech",
    templates[0]?.name || "Product Mastery - Novice",
    "15/06/2026", "10:00 AM", String(templates[0]?.durationMinutes || 60), "Round 1", "",
  ];

  const wb = XLSX.utils.book_new();

  const dataWs = XLSX.utils.aoa_to_sheet([headers, example]);
  dataWs["!cols"] = headers.map(h => ({ wch: Math.max(14, Math.min(32, h.length + 6)) }));
  XLSX.utils.book_append_sheet(wb, dataWs, "Bulk Schedule");

  const helpRows = [
    ["Panelists — copy the exact email into the interviewerEmail column"],
    ["Name", "Email"],
    ...interviewers.map(u => [u.displayName || "", u.email || ""]),
    [],
    ["Evaluation Templates — copy the exact name into the templateName column"],
    ["Template Name", "Default Duration (min)"],
    ...templates.map(t => [t.name, t.durationMinutes || ""]),
    [],
    ["Round Names — copy the exact name into the round column, or type a new one"],
    ["Round Name"],
    ...rounds.map(r => [r.name]),
    [],
    ["Typical Durations (minutes) — the duration column accepts any number, these are just common values"],
    ["Minutes", "Label"],
    ...DURATIONS.map(d => [d.value, d.label]),
    [],
    ["Format Notes"],
    ["Column", "Expected format"],
    ["date", "DD/MM/YYYY (e.g. 15/06/2026) or YYYY-MM-DD — must be today or later"],
    ["time", "10:00 AM / 2:30 PM, or 24-hour like 14:30"],
    ["duration", "A number of minutes (e.g. 60) — optional, defaults to the template's own duration if left blank"],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(helpRows);
  helpWs["!cols"] = [{ wch: 40 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, helpWs, "Help");

  XLSX.writeFile(wb, "bulk_schedule_template.xlsx");
}
