import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";
import { runAiReportSweep } from "./_lib/aiReportSweep.js";

// POST /api/generate-ai-reports-bulk
// Auth: "Authorization: Bearer <caller's Firebase ID token>" — the caller's
// own users/{uid} Firestore doc must have role === "admin".
//
// Backs the "Generate Missing AI Reports" button in InterviewsPage.jsx.
// Deliberately does NOT take the admin's current page filters (date range,
// interviewer, vendor, etc.) as input — it scans the same server-side
// window the nightly cron does (see _lib/aiReportSweep.js), so clicking it
// catches every completed interview missing a report in the last 14 days,
// not just whatever happens to be in the admin's currently filtered view.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  try {
    const db = getDb();

    const header = req.headers.authorization || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ success: false, error: "unauthorized" });

    let callerUid;
    try {
      ({ uid: callerUid } = await getAuth().verifyIdToken(idToken));
    } catch {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      return res.status(403).json({ success: false, error: "forbidden", message: "Only an admin can generate AI reports." });
    }

    const result = await runAiReportSweep(db, {
      appsScriptUrl:    process.env.APPS_SCRIPT_URL,
      appsScriptSecret: process.env.APPS_SCRIPT_SECRET,
      lookbackDays: 14,
      // Each interview costs 2-3 slow round trips (Apps Script transcript
      // fetch/read + a Claude call that alone can take 5-15s) -- a batch
      // much bigger than this risks blowing past Vercel's 60s maxDuration
      // partway through, which kills the function and returns Vercel's own
      // generic error page instead of JSON (that's what the client's
      // "Unexpected token 'A'..." parse error actually was, NOT an Apps
      // Script problem). InterviewsPage.jsx's handleBulkGenerateAiReports
      // loops this endpoint across several small rounds instead of asking
      // for everything in one request.
      maxPerRun: 6,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("generate-ai-reports-bulk error:", err);
    return res.status(500).json({ success: false, error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
