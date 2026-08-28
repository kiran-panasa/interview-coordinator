import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

// Called BY our own frontend right after an Academy interview's status/
// feedback changes (see markInterviewCompleted in src/api/interviews.ts).
// Looks the interview up server-side — so the client only ever sends an id,
// never the feedback content itself — and forwards it to Academy Nexus if
// it belongs to an Academy-prefixed template. Keeps ACADEMY_FEEDBACK_API_KEY
// out of the browser bundle entirely (mirrors how Academy Nexus's own
// api/send-to-interview.js keeps ITS outbound key server-side).
//
// Also callable a second time for the SAME interview once its recording/
// transcript link shows up — those usually aren't ready yet at the moment
// an interview is marked completed (Google Meet takes a few minutes to
// finish processing), so the Apps Script sweep re-triggers this once it
// finds one, using a shared secret instead of a Firebase user token since
// Apps Script isn't a logged-in user.
//
// POST /api/push-academy-feedback
// Body: { interviewId: string }
// Auth: EITHER "Authorization: Bearer <this app's own Firebase ID token>"
//       (the frontend's own call) OR "x-internal-secret: <ACADEMY_PUSH_INTERNAL_SECRET>"
//       (the Apps Script sweep's re-push call)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // getDb() lazily calls initializeApp() for the Admin SDK — must run before
  // getAuth() below, which reads the same default app. Calling getAuth()
  // first would throw on a cold start (no app registered yet), which the
  // catch block would misreport as "unauthorized" rather than the real
  // cause.
  const db = getDb();

  const internalSecret = req.headers["x-internal-secret"];
  const expectedInternalSecret = process.env.ACADEMY_PUSH_INTERNAL_SECRET;
  let authorized = !!(internalSecret && expectedInternalSecret && internalSecret === expectedInternalSecret);

  if (!authorized) {
    const header = req.headers.authorization || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (idToken) {
      try {
        await getAuth().verifyIdToken(idToken);
        authorized = true;
      } catch {
        // falls through to the 401 below
      }
    }
  }
  if (!authorized) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  const { interviewId } = req.body || {};
  if (!interviewId) {
    return res.status(400).json({ success: false, error: "invalid_parameter", message: "interviewId is required" });
  }

  const targetUrl = process.env.ACADEMY_FEEDBACK_URL;
  const targetKey = process.env.ACADEMY_FEEDBACK_API_KEY;
  if (!targetUrl || !targetKey) {
    return res.status(500).json({ success: false, error: "server_misconfigured", message: "ACADEMY_FEEDBACK_URL / ACADEMY_FEEDBACK_API_KEY not set." });
  }

  try {
    const snap = await db.collection("interviews").doc(interviewId).get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "not_found" });
    }
    const iv = snap.data();
    if (!(iv.templateName || "").startsWith("Academy")) {
      return res.status(200).json({ success: true, skipped: true });
    }

    // Candidate UserID (e.g. "STU-2024-001") is Academy's own student
    // identifier — snapshotted onto iv.candidateUid at interview-creation
    // time for anything scheduled after that existed (see withCandidateUid
    // in src/api/interviews.ts). Older interviews fall back to a live
    // lookup on the candidate's own doc (Candidate.uid in src/types.ts).
    let candidateUid = iv.candidateUid || "";
    if (!candidateUid && iv.candidateId) {
      const candidateSnap = await db.collection("candidates").doc(iv.candidateId).get();
      candidateUid = candidateSnap.exists ? (candidateSnap.data().uid || "") : "";
    }

    const feedback = iv.feedback || {};
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": targetKey },
      body: JSON.stringify({
        candidateUid,
        candidateName: iv.candidateName || "",
        candidateEmail: iv.candidateEmail || "",
        interviewerName: iv.interviewerName || "",
        templateName: iv.templateName || "",
        round: iv.round || "",
        status: iv.status || "",
        outcome: feedback.overallRecommendation || "",
        finalVerdict: feedback.finalVerdict ?? null,
        remarks: feedback.comments || "",
        scheduledDate: iv.scheduledDate || "",
        scheduledTime: iv.scheduledTime || "",
        completedAt: feedback.submittedAt || iv.updatedAt || null,
        updatedAt: iv.updatedAt || new Date().toISOString(),
        meetLink: iv.meetLink || null,
        recordingUrl: iv.meetingRecordingUrl || null,
        transcriptUrl: iv.transcriptUrl || null,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("push-academy-feedback: Academy Nexus rejected the push", resp.status, detail);
      return res.status(502).json({ success: false, error: "academy_rejected" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("push-academy-feedback error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
}
