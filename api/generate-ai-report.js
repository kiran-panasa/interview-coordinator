import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";
import { generateReportWithClaude } from "./_lib/claudeReport.js";

// POST /api/generate-ai-report
// Body: { transcriptText: string, candidateName: string, round: string, templateName?: string }
// Auth: "Authorization: Bearer <caller's Firebase ID token>" — the caller's
// own users/{uid} Firestore doc must have role === "admin".
//
// Manual, single-interview path — triggered from InterviewsPage.jsx's
// "Generate with Claude" button. The scheduled sweep (cron/generate-ai-
// reports.js) runs the same underlying generateReportWithClaude without
// needing an admin to click anything. The transcript's actual TEXT content
// has to be fetched client-side first (Apps Script already has read access
// to the Google Doc transcript; this function has no Google credentials of
// its own) and sent in the request body — this endpoint only turns that
// transcript into the same AiCandidateReport shape (src/types.ts) the UI
// already renders, so AiReportModal needs no changes either way.

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

    const { transcriptText, candidateName, round, templateName } = req.body || {};
    const report = await generateReportWithClaude(transcriptText, { candidateName, round, templateName });
    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error("generate-ai-report error:", err);
    return res.status(500).json({ success: false, error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
