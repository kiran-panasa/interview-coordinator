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
        candidateEmail:       g("candidateEmail"),
        candidateUid:         g("candidateUid"),
        interviewerEmail:     g("interviewerEmail"),
        templateName:         g("templateName"),
        date:                 g("date"),
        time:                 g("time"),
        round:                g("round") || "Round 1",
        verdict:              g("verdict"),
        notes:                g("notes"),
        meetingLink:          g("meetingLink"),
        meetingRecordingLink: g("meetingRecordingLink"),
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

      const BASE_COLS = new Set([
        "candidateemail","candidateuid","intervieweremail","templatename","date","time","round","verdict","notes",
        "meetinglink","meetingrecordinglink",
      ]);
      const domainData = {};
      headers.forEach((h, j) => {
        if (!BASE_COLS.has(h)) domainData[h] = (f[j] || "").trim();
      });

      Object.entries(domainData).forEach(([k, v]) => {
        if (k.endsWith("_rating") && v) {
          const n = parseFloat(v);
          if (isNaN(n) || n < 0 || n > 5) warnings.push(`${k}: "${v}" is not a valid score (expected 0–5)`);
        }
      });

      const hasDomainFeedback = Object.values(domainData).some(Boolean);

      // Upsert match — an existing interview for this candidate + template,
      // preferring an exact date match; only falls back to the sole existing
      // interview for that pairing when the row supplied NO date at all (a
      // links-only upload where the date column was left blank). Rows that
      // hit this get UPDATED (links + optional feedback) instead of creating
      // a duplicate — this is what lets meeting/recording links be uploaded
      // for interviews that already exist (completed or still scheduled).
      //
      // Deliberately does NOT fall back to the sole match when a date WAS
      // given but didn't match anything — a candidate re-attempting the same
      // template on a new date must create a new interview, not silently
      // overwrite their first attempt just because it's the only existing
      // record for that candidate+template pairing.
      let existingInterview = null;
      if (candidate && template) {
        const candidateTemplateIvs = existing.filter(iv => iv.candidateId === candidate.id && iv.templateId === template.id);
        existingInterview = (scheduledDate && candidateTemplateIvs.find(iv => iv.scheduledDate === scheduledDate))
          || (!scheduledDate && candidateTemplateIvs.length === 1 ? candidateTemplateIvs[0] : null);
      }
      if (existingInterview) {
        const willAddFeedback = !!(verdict || hasDomainFeedback);
        warnings.push(`Matches an existing ${existingInterview.status} interview — will update it${willAddFeedback ? " (links + feedback)" : " (links only)"} instead of creating a new one.`);
      }

      return {
        rowNum: i + 2, raw,
        resolved: {
          candidate, interviewer, template, scheduledDate, scheduledTime, verdict, domainData, hasDomainFeedback,
          existingInterview,
          meetingLink:          raw.meetingLink,
          meetingRecordingLink: raw.meetingRecordingLink,
        },
        errors, warnings,
      };
    }),
  };
}

// Lightweight companion to parseImportCSV — for attaching meeting/recording
// links onto interviews that already exist, without needing to re-supply
// interviewer/date/time. Never creates a new interview: a row that can't be
// matched to an existing one is an error, not a fallback-create.
export function parseLinksCSV(text, candidates, templates, existing) {
  const lines = splitCSVLines(text);
  if (lines.length < 2) return { globalError: "Need at least a header row and one data row." };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  if (!headers.includes("templatename")) return { globalError: "Missing column: templateName" };
  if (!headers.includes("candidateemail") && !headers.includes("candidateuid")) {
    return { globalError: "Missing columns: candidateEmail or candidateUid (need at least one)" };
  }
  if (!headers.includes("meetinglink") && !headers.includes("meetingrecordinglink") && !headers.includes("transcriptlink")) {
    return { globalError: "Missing columns: meetingLink, meetingRecordingLink, and/or transcriptLink (need at least one)" };
  }

  const idx = name => headers.indexOf(name.toLowerCase().replace(/\s+/g, ""));

  return {
    rows: lines.slice(1).map((line, i) => {
      const f = parseLine(line);
      const g = name => (f[idx(name)] || "").trim();

      const raw = {
        candidateEmail:       g("candidateEmail"),
        candidateUid:         g("candidateUid"),
        templateName:         g("templateName"),
        date:                 g("date"),
        meetingLink:          g("meetingLink"),
        meetingRecordingLink: g("meetingRecordingLink"),
        transcriptLink:       g("transcriptLink"),
      };

      const errors = [];

      let candidate = raw.candidateEmail
        ? candidates.find(c => c.email?.toLowerCase() === raw.candidateEmail.toLowerCase())
        : null;
      if (!candidate && raw.candidateUid) {
        candidate = candidates.find(c => c.uid && c.uid === raw.candidateUid);
      }
      if (!raw.candidateEmail && !raw.candidateUid) errors.push("candidateEmail or candidateUid required");
      else if (!candidate) errors.push(`Candidate not found: ${raw.candidateEmail || raw.candidateUid}`);

      const template = templates.find(t => t.name.toLowerCase() === raw.templateName.toLowerCase());
      if (!raw.templateName) errors.push("templateName required");
      else if (!template) errors.push(`Template not found: "${raw.templateName}"`);

      if (!raw.meetingLink && !raw.meetingRecordingLink && !raw.transcriptLink) {
        errors.push("Provide meetingLink, meetingRecordingLink, and/or transcriptLink");
      }

      const scheduledDate = raw.date ? normalizeDate(raw.date) : null;
      if (raw.date && !scheduledDate) errors.push(`Bad date format: "${raw.date}" — use DD/MM/YYYY`);

      let existingInterview = null;
      if (candidate && template) {
        const matches = existing.filter(iv => iv.candidateId === candidate.id && iv.templateId === template.id);
        // Same rule as parseImportCSV above — only fall back to the sole
        // match when no date was given at all; a date that was given but
        // didn't match anything is a real mismatch, not "assume they meant
        // the only one," so a candidate's other attempts on other dates are
        // never silently overwritten.
        existingInterview = (scheduledDate && matches.find(iv => iv.scheduledDate === scheduledDate))
          || (!scheduledDate && matches.length === 1 ? matches[0] : null);
        if (!existingInterview) {
          errors.push(
            scheduledDate
              ? "No existing interview found for this candidate + template on that date."
              : matches.length === 0
                ? "No existing interview found for this candidate + template."
                : `${matches.length} interviews found for this candidate + template — add a date column to disambiguate.`
          );
        }
      }

      return {
        rowNum: i + 2, raw,
        resolved: {
          candidate, template, existingInterview,
          meetingLink:          raw.meetingLink,
          meetingRecordingLink: raw.meetingRecordingLink,
          transcriptLink:       raw.transcriptLink,
        },
        errors,
      };
    }),
  };
}

export function downloadLinksTemplate() {
  const headers = ["candidateEmail", "candidateUid", "templateName", "date", "meetingLink", "meetingRecordingLink", "transcriptLink"];
  const example = [
    "john.doe@example.com", "", "AI SYSTEMS MASTERY", "15/06/2026",
    "https://meet.google.com/abc-defg-hij", "https://drive.google.com/file/d/xxxx/view",
    "https://docs.google.com/document/d/xxxx/edit",
  ];
  const rows = [headers.join(","), example.map(v => (v.includes(",") || v.includes(" ")) ? `"${v}"` : v).join(",")];

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = "meeting_links_upload_template.csv";
  a.click();
}

export function downloadImportTemplate(template) {
  const baseHeaders = [
    "candidateEmail", "candidateUid", "interviewerEmail", "templateName", "date", "time", "round", "verdict", "notes",
    "meetingLink", "meetingRecordingLink",
  ];
  const baseExample = [
    "john.doe@example.com", "",
    "interviewer@nxtwave.tech",
    template?.name || "Product Mastery - Novice",
    "15/06/2026", "10:00 AM", "Round 1", "Proceed", "Overall interview notes",
    "https://meet.google.com/abc-defg-hij", "https://drive.google.com/file/d/xxxx/view",
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
            } else if (f.type === "dropdown") {
              domainHeaders.push(`${pfx}_${slugify(f.label)}`);
              const firstOpt = Array.isArray(f.options) && f.options[0];
              domainExample.push(firstOpt ? (typeof firstOpt === "string" ? firstOpt : (firstOpt.label ?? firstOpt.value ?? "")) : "");
            } else if (f.type === "text") {
              domainHeaders.push(`${pfx}_${slugify(f.label)}`);
              domainExample.push("");
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
