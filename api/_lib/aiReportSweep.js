import { generateReportWithClaude } from "./claudeReport.js";

// Shared by the nightly cron (cron/generate-ai-reports.js) and the manual
// "Generate Missing AI Reports" button (generate-ai-reports-bulk.js) — both
// scan the SAME server-side window of completed interviews regardless of
// whatever date range an admin happens to have selected in the Interviews
// page's filters, so the button actually catches older missing reports too,
// not just whatever's currently in view.
export async function runAiReportSweep(db, { appsScriptUrl, appsScriptSecret, lookbackDays = 14, maxPerRun = 15 }) {
  if (!appsScriptUrl) throw new Error("APPS_SCRIPT_URL is not set (server-side env var, no VITE_ prefix).");

  async function callAppsScriptServer(payload) {
    const res = await fetch(appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ ...payload, secret: appsScriptSecret }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Apps Script call failed");
    return json;
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snap = await db.collection("interviews")
    .where("status", "==", "completed")
    .where("scheduledDate", ">=", since)
    .get();

  const targets = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(iv => !iv.aiReport && (iv.transcriptUrl || iv.eventId || iv.meetLink))
    .slice(0, maxPerRun);

  let succeeded = 0, noTranscript = 0, failed = 0;
  // Keeps the actual failure reason per interview — a bare "X failed" count
  // was impossible to debug from the UI alone (see the "Unknown action"
  // Apps Script gap this surfaced originally).
  const errors = [];
  for (const iv of targets) {
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
          await db.collection("interviews").doc(iv.id).update({ transcriptUrl });
        }
      }
      if (!transcriptUrl) { noTranscript++; continue; }

      const textResult = await callAppsScriptServer({ action: "getTranscriptText", transcriptUrl });
      if (textResult?.status !== "ready" || !textResult.text) { noTranscript++; continue; }

      const report = await generateReportWithClaude(textResult.text, {
        candidateName: iv.candidateName, round: iv.round || iv.templateName || "Interview", templateName: iv.templateName || "",
      });
      await db.collection("interviews").doc(iv.id).update({ aiReport: { ...report, generatedAt: new Date().toISOString() } });
      succeeded++;
    } catch (e) {
      failed++;
      errors.push({ id: iv.id, candidateName: iv.candidateName, message: e?.message || String(e) });
    }
  }

  return { scanned: snap.size, attempted: targets.length, succeeded, noTranscript, failed, errors };
}
