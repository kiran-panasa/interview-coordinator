import { generateCandidateReport } from "./claudeReport.js";
import { generatePanelistAudit } from "./panelistAuditReport.js";
import { resolveRubricText } from "./panelistAuditRubrics.js";

// Up to this many of a panelist's own past audits, most recent first, used
// so Claude can catch a REPEATED issue and escalate it a severity level
// (see SEVERITY_AND_VERDICT in panelistAuditRubrics.js). Summarized down to
// short strings, not the full report, to keep the prompt lean.
const PRIOR_FINDINGS_LOOKBACK = 2;
async function getPriorFindingsForPanelist(db, interviewerEmail, excludeInterviewId) {
  if (!interviewerEmail) return [];
  const snap = await db.collection("interviews")
    .where("interviewerEmail", "==", interviewerEmail)
    .where("status", "==", "completed")
    .get();
  const past = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(iv => iv.id !== excludeInterviewId && iv.panelistAudit)
    .sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""))
    .slice(0, PRIOR_FINDINGS_LOOKBACK);
  return past.flatMap(iv => {
    const audit = iv.panelistAudit;
    const critical = (audit.criticalFindings || []).map(f => `[Critical, ${iv.scheduledDate}] ${f.issue}`);
    const fixRemarks = (audit.remarks || []).filter(r => r.severity === "fix").map(r => `[Fix, ${iv.scheduledDate}] ${r.area}: ${r.remark}`);
    return [...critical, ...fixRemarks];
  });
}

// Shared by the nightly cron (cron/generate-ai-reports.js) and the manual
// "Generate Missing AI Reports" button (generate-ai-reports-bulk.js) — both
// scan the SAME server-side window of completed interviews regardless of
// whatever date range an admin happens to have selected in the Interviews
// page's filters, so the button actually catches older missing reports too,
// not just whatever's currently in view.
//
// ALSO generates the panelist conduct audit (interviews/{id}.panelistAudit)
// in the same pass, for any interview whose template has an auditRubricKey
// assigned — reusing the SAME transcript text already fetched here for the
// candidate report, so this adds one more Claude call per interview, not a
// second round trip to Apps Script. This is the PRIMARY (automatic) path
// for panelist audits; generate-panelist-audit.js's manual single-interview
// endpoint exists only as a safety-net retry, not something an admin needs
// to click routinely.
export async function runAiReportSweep(db, { appsScriptUrl, appsScriptSecret, lookbackDays = 14, maxPerRun = 15, sinceDate, untilDate, panelistOnly = false }) {
  if (!appsScriptUrl) throw new Error("APPS_SCRIPT_URL is not set (server-side env var, no VITE_ prefix).");

  const templatesSnap = await db.collection("templates").get();
  const templatesById = new Map(templatesSnap.docs.map(d => [d.id, d.data()]));

  async function callAppsScriptServer(payload, attempt = 1) {
    const res = await fetch(appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ ...payload, secret: appsScriptSecret }),
    });
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      // Apps Script web apps occasionally return a plain-text/HTML "An
      // error occurred while processing your request" page instead of
      // JSON -- a known, undocumented transient Google-side glitch, not
      // something caused by the script itself (its own Executions log
      // shows these calls completing normally). A short retry clears it
      // almost every time; if it still fails, surface a snippet of what
      // Google actually sent back instead of an opaque "Unexpected token".
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        return callAppsScriptServer(payload, attempt + 1);
      }
      throw new Error(`Apps Script returned a non-JSON response: ${raw.slice(0, 200)}`);
    }
    if (!json.success) throw new Error(json.error || "Apps Script call failed");
    return json;
  }

  // sinceDate/untilDate let a caller (the admin "Generate Missing Panelist
  // Audits" button, scoped to whatever date range is currently filtered on
  // InterviewsPage.jsx) target an explicit window instead of the rolling
  // lookbackDays the nightly cron and the general bulk button both use.
  const since = sinceDate || new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let query = db.collection("interviews")
    .where("status", "==", "completed")
    .where("scheduledDate", ">=", since);
  if (untilDate) query = query.where("scheduledDate", "<=", untilDate);
  const snap = await query.get();

  const needsPanelistAudit = (iv) => {
    const rubricKey = templatesById.get(iv.templateId)?.auditRubricKey;
    return !!rubricKey && !iv.panelistAudit;
  };

  const targets = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(iv => (panelistOnly ? needsPanelistAudit(iv) : (!iv.aiReport || needsPanelistAudit(iv))) && (iv.transcriptUrl || iv.eventId || iv.meetLink))
    .slice(0, maxPerRun);

  let succeeded = 0, noTranscript = 0, failed = 0;
  let panelistAuditsSucceeded = 0, panelistAuditsFailed = 0;
  // Keeps the actual failure reason per interview — a bare "X failed" count
  // was impossible to debug from the UI alone (see the "Unknown action"
  // Apps Script gap this surfaced originally).
  const errors = [];
  for (const iv of targets) {
    const update = {};
    try {
      let transcriptUrl = iv.transcriptUrl;
      if (!transcriptUrl) {
        const r = await callAppsScriptServer({
          action: "getTranscript",
          eventId: iv.eventId || "", meetLink: iv.meetLink || "",
          recallBotId: iv.recallBotId || "", candidateName: iv.candidateName,
        });
        if (r?.status === "ready" && r.transcriptUrl) {
          transcriptUrl = r.transcriptUrl;
          update.transcriptUrl = transcriptUrl;
        }
      }
      if (!transcriptUrl) { noTranscript++; continue; }

      const textResult = await callAppsScriptServer({ action: "getTranscriptText", transcriptUrl });
      if (textResult?.status !== "ready" || !textResult.text) { noTranscript++; continue; }

      if (!panelistOnly && !iv.aiReport) {
        const report = await generateCandidateReport(textResult.text, {
          candidateName: iv.candidateName, round: iv.round || iv.templateName || "Interview", templateName: iv.templateName || "",
        });
        update.aiReport = { ...report, generatedAt: new Date().toISOString() };
        succeeded++;
      }

      // Best-effort, separate from the candidate report above — a failure
      // here shouldn't discard an aiReport that DID succeed in this same
      // pass, so it's its own try/catch rather than sharing the outer one.
      if (needsPanelistAudit(iv)) {
        try {
          const rubricKey = templatesById.get(iv.templateId).auditRubricKey;
          const priorFindings = await getPriorFindingsForPanelist(db, iv.interviewerEmail, iv.id);
          const { label: rubricLabel, text: rubricText } = await resolveRubricText(db, rubricKey);
          const audit = await generatePanelistAudit(textResult.text, {
            rubricKey, rubricLabel, rubricText, panelistName: iv.interviewerName, panelistEmail: iv.interviewerEmail,
            round: iv.round || iv.templateName || "Interview", templateName: iv.templateName || "", priorFindings,
          });
          update.panelistAudit = { ...audit, generatedAt: new Date().toISOString() };
          panelistAuditsSucceeded++;
        } catch (e) {
          panelistAuditsFailed++;
          errors.push({ id: iv.id, candidateName: iv.candidateName, message: `panelist audit: ${e?.message || String(e)}` });
        }
      }

      if (Object.keys(update).length) {
        await db.collection("interviews").doc(iv.id).update(update);
      }
    } catch (e) {
      failed++;
      errors.push({ id: iv.id, candidateName: iv.candidateName, message: e?.message || String(e) });
      if (Object.keys(update).length) {
        await db.collection("interviews").doc(iv.id).update(update).catch(() => {});
      }
    }
  }

  return {
    scanned: snap.size, attempted: targets.length, succeeded, noTranscript, failed, errors,
    panelistAuditsSucceeded, panelistAuditsFailed,
  };
}
