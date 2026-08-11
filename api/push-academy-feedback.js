import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

// Called BY our own frontend right after an Academy interview's status/
// feedback changes (see src/api/interviews.ts submitFeedback). Looks the
// interview up server-side — so the client only ever sends an id, never the
// feedback content itself — and forwards it to Academy Nexus if it belongs
// to an Academy-prefixed template. Keeps ACADEMY_FEEDBACK_API_KEY out of the
// browser bundle entirely (mirrors how Academy Nexus's own
// api/send-to-interview.js keeps ITS outbound key server-side).
//
// POST /api/push-academy-feedback
// Body: { interviewId: string }
// Auth: Authorization: Bearer <this app's own Firebase ID token>

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

  const header = req.headers.authorization || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  try {
    await getAuth().verifyIdToken(idToken);
  } catch {
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

    const feedback = iv.feedback || {};
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": targetKey },
      body: JSON.stringify({
        interviewId,
        candidateName: iv.candidateName || "",
        candidateEmail: iv.candidateEmail || "",
        interviewerEmail: iv.interviewerEmail || "",
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
