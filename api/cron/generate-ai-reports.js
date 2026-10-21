import { getDb } from "../_lib/firebaseAdmin.js";
import { runAiReportSweep } from "../_lib/aiReportSweep.js";

// GET /api/cron/generate-ai-reports — scheduled daily by vercel.json's
// "crons" entry. Vercel sends "Authorization: Bearer $CRON_SECRET"
// automatically for scheduled invocations once CRON_SECRET is set as an
// env var; anyone else hitting this URL directly gets rejected, since
// there's no per-admin auth here at all (nobody's logged in for a cron run).
//
// Backfills AI reports with Claude for completed interviews that are still
// missing one — the automatic counterpart to InterviewsPage.jsx's manual
// "Generate Missing AI Reports" button (generate-ai-reports-bulk.js, which
// shares the actual sweep logic via _lib/aiReportSweep.js), for whenever
// Gemini's own daily quota runs out and silently blocks the existing Apps
// Script/Gemini path.
//
// Needs server-side Apps Script credentials (APPS_SCRIPT_URL/SECRET, no
// VITE_ prefix — same values as the client's VITE_APPS_SCRIPT_URL/SECRET,
// just also set as plain server env vars) since Apps Script still owns
// fetching the transcript's actual TEXT; this function has no Google
// credentials of its own.

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const db = getDb();
    const result = await runAiReportSweep(db, {
      appsScriptUrl:    process.env.APPS_SCRIPT_URL,
      appsScriptSecret: process.env.APPS_SCRIPT_SECRET,
      lookbackDays: 14,
      // Kept modest for the same reason as generate-ai-reports-bulk.js's
      // own maxPerRun — each interview can cost 10+ seconds (Apps Script
      // round trips + a Claude call), and this function's own maxDuration
      // is 60s. Leftovers just get picked up by tomorrow's run.
      maxPerRun: 8,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("cron/generate-ai-reports error:", err);
    return res.status(500).json({ error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
