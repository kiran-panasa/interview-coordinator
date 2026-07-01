import { materializeFeedback } from "./templateEngine";

export const VERDICT_MAP = { proceed: "Proceed", hold: "Hold", reject: "Reject" };

function parseLine(line) {
  const fields = [];
  let field = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { fields.push(field.trim()); field = ""; }
    else field += c;
  }
  fields.push(field.trim());
  return fields;
}

function normalizeDate(s) {
  if (!s) return null;
  s = s.trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function slugify(label) {
  return (label || "")
    .toLowerCase()
    .replace(/[–—]/g, "_")
    .replace(/[^a-z0-9\s_]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "field";
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
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
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
      else if (!interviewer) errors.push(`Interviewer not found: ${raw.interviewerEmail}`);

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

export function buildFeedbackFromCSV(template, domainData, verdict, overallNotes) {
  const hasDomainData = Object.values(domainData).some(Boolean);

  if (!template?.domains || !hasDomainData) {
    return {
      overallRecommendation: verdict,
      comments: overallNotes,
      importedFromSheet: true,
      submittedAt: new Date().toISOString(),
    };
  }

  const feedbackDomains = {};

  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const notes    = domainData[`${domain.id}_notes`] || "";
    const hasCards = (domain.cardFields || []).length > 0;
    const domainState = { cards: [] };

    if (hasCards) {
      const card = {};
      for (const f of domain.cardFields) {
        if (f.type === "scored_dropdown") {
          const raw = domainData[`${domain.id}_${slugify(f.label)}_rating`]
                   ?? domainData[`${domain.id}_${f.id}_rating`];
          card[f.id] = raw !== "" && raw != null ? parseFloat(raw) : null;
        } else {
          card[f.id] = f.type === "text" ? "" : null;
        }
      }
      domainState.cards = [card];
      for (const f of domain.domainFields || []) {
        domainState[f.id] = f.type === "text" ? notes : null;
      }
    } else {
      const raw    = domainData[`${domain.id}_rating`];
      const rating = raw !== "" && raw != null ? parseFloat(raw) : null;
      for (const f of domain.domainFields || []) {
        if (f.type === "scored_dropdown") domainState[f.id] = rating;
        else if (f.type === "text") domainState[f.id] = domain.id === "overall_feedback" ? (overallNotes || notes) : notes;
        else domainState[f.id] = null;
      }
    }

    feedbackDomains[domain.id] = domainState;
  }

  const materialized = materializeFeedback(template, { domains: feedbackDomains });
  return {
    ...materialized,
    overallRecommendation: verdict,
    importedFromSheet: true,
    submittedAt: new Date().toISOString(),
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
        for (const f of d.cardFields) {
          if (f.type === "scored_dropdown") {
            domainHeaders.push(`${d.id}_${slugify(f.label)}_rating`);
            domainExample.push("3");
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

export async function callAppsScript(url, secret, payload) {
  if (!url) throw new Error("VITE_APPS_SCRIPT_URL is not set in .env");
  const res = await fetch(url, {
    method:   "POST",
    redirect: "follow",
    body:     JSON.stringify({ ...payload, secret }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Apps Script call failed");
  return json;
}
