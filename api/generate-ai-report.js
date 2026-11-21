import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";
import { generateReportWithClaude } from "./_lib/claudeReport.js";
import { generatePanelistAuditWithClaude } from "./_lib/panelistAuditReport.js";
import { resolveRubricText } from "./_lib/panelistAuditRubrics.js";

// POST /api/generate-ai-report
// Body (candidate report, default): { transcriptText, candidateName, round, templateName? }
// Body (panelist audit — pass reportType: "panelist"): { reportType: "panelist",
//   transcriptText, rubricKey, panelistName, panelistEmail, round, templateName?, priorFindings? }
// Auth: "Authorization: Bearer <caller's Firebase ID token>" — the caller's
// own users/{uid} Firestore doc must have role === "admin".
//
// Manual, single-interview path for BOTH report types — triggered from
// InterviewsPage.jsx's "Generate with Claude" button (candidate) and its
// "Generate Panelist Audit" safety-net action (panelist; the automatic
// nightly sweep, cron/generate-ai-reports.js via _lib/aiReportSweep.js, is
// the primary path for that one). Kept as ONE function with a reportType
// discriminator rather than a second standalone file — Vercel's Hobby plan
// caps a deployment at 12 Serverless Functions (see sso-handler.js's own
// comment on the same constraint), and this project is already at that
// ceiling. The transcript's actual TEXT content is fetched client-side
// first (Apps Script already has read access to the Google Doc transcript;
// this function has no Google credentials of its own) and sent in the
// request body either way.

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
      return res.status(403).json({ success: false, error: "forbidden", message: "Only an admin can generate reports." });
    }

    if (req.body?.reportType === "panelist") {
      const { transcriptText, rubricKey, panelistName, panelistEmail, round, templateName, priorFindings } = req.body;
      const { label: rubricLabel, text: rubricText } = await resolveRubricText(db, rubricKey);
      const panelistAudit = await generatePanelistAuditWithClaude(transcriptText, {
        rubricKey, rubricLabel, rubricText, panelistName, panelistEmail, round, templateName, priorFindings,
      });
      return res.status(200).json({ success: true, panelistAudit });
    }

    const { transcriptText, candidateName, round, templateName } = req.body || {};
    const report = await generateReportWithClaude(transcriptText, { candidateName, round, templateName });
    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error("generate-ai-report error:", err);
    return res.status(500).json({ success: false, error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
