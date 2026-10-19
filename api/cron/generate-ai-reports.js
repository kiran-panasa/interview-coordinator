import { getDb } from "../_lib/firebaseAdmin.js";
import { generateReportWithClaude } from "../_lib/claudeReport.js";

// GET /api/cron/generate-ai-reports — scheduled daily by vercel.json's
// "crons" entry. Vercel sends "Authorization: Bearer $CRON_SECRET"
// automatically for scheduled invocations once CRON_SECRET is set as an
// env var; anyone else hitting this URL directly gets rejected, since
// there's no per-admin auth here at all (nobody's logged in for a cron run).
//
// Backfills AI reports with Claude for completed interviews that are still
// missing one — the automatic counterpart to InterviewsPage.jsx's manual
// "Generate Missing AI Reports" button, for whenever Gemini's own daily
// quota runs out and silently blocks the existing Apps Script/Gemini path.
//
// Needs server-side Apps Script credentials (APPS_SCRIPT_URL/SECRET, no
// VITE_ prefix — same values as the client's VITE_APPS_SCRIPT_URL/SECRET,
// just also set as plain server env vars) since Apps Script still owns
// fetching the transcript's actual TEXT; this function has no Google
// credentials of its own.

const APPS_SCRIPT_URL    = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;

// Only interviews scheduled within this window are even considered — an
// unbounded "every completed interview ever" scan would grow more
// expensive (and slower) every single day forever. Comfortably wider than
// the 1-day cron cadence so a transient miss (Apps Script down, transcript
// not ready yet) still gets picked up by the next few days' runs.
const LOOKBACK_DAYS = 14;
// Caps how many interviews one run will attempt — each one is 1-2 Apps
// Script calls plus a Claude call, done sequentially; this is a time-
// budget guard (see maxDuration in vercel.json) more than a cost control.
// Leftovers simply get picked up by tomorrow's run.
const MAX_PER_RUN = 15;

async function callAppsScriptServer(payload) {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL is not set (server-side env var, no VITE_ prefix).");
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify({ ...payload, secret: APPS_SCRIPT_SECRET }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Apps Script call failed");
  return json;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const db = getDb();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const snap = await db.collection("interviews")
      .where("status", "==", "completed")
      .where("scheduledDate", ">=", since)
      .get();

    const targets = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(iv => !iv.aiReport && (iv.transcriptUrl || iv.eventId || iv.meetLink))
      .slice(0, MAX_PER_RUN);

    let succeeded = 0, noTranscript = 0, failed = 0;
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
      } catch {
        failed++;
      }
    }

    return res.status(200).json({ scanned: snap.size, attempted: targets.length, succeeded, noTranscript, failed });
  } catch (err) {
    console.error("cron/generate-ai-reports error:", err);
    return res.status(500).json({ error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
