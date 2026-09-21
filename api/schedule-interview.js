import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./_lib/firebaseAdmin.js";

// Creates the Google Calendar event + Meet link for an interview and saves
// the result onto the interview doc — all server-side. This used to run in
// the browser (callAppsScript from the interviewer's Accept click / the
// admin's Send Invite click), which meant the Meet link only ever reached
// the database if that exact browser tab stayed open and its fetch got the
// Apps Script response back. Apps Script takes 10-60s, so an interviewer
// closing the tab, or the browser's fetch failing on Apps Script's redirect,
// left the Calendar event created but the link never saved — then an admin
// clicking Send Invite again created a second event. Here the write happens
// on the server regardless of what the browser does afterward.
//
// Also the single place that guards against duplicates: a transaction-held
// lock (scheduleStartedAt) means an Accept click and an admin Send Invite
// click racing each other, or a double-click, can never both create an event.
//
// POST /api/schedule-interview
// Body: { interviewId: string }
// Auth: Authorization: Bearer <Firebase ID token> — caller must be the
//       interview's own interviewer or an admin.

export const config = { maxDuration: 60 };

const LOCK_TTL_MS = 3 * 60 * 1000;
const APPS_SCRIPT_TIMEOUT_MS = 55 * 1000;

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
}

async function callAppsScript(payload) {
  const url = process.env.APPS_SCRIPT_URL || process.env.VITE_APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET || process.env.VITE_APPS_SCRIPT_SECRET;
  if (!url || !secret) {
    const err = new Error("Apps Script URL/secret not configured on the server.");
    err.definitive = true;
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ ...payload, secret }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error || "Apps Script call failed");
      err.definitive = true; // Apps Script itself said it failed — safe to retry
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function sendConfirmationEmails(db, iv, meetLink) {
  const round = iv.round || iv.templateName || "Interview";

  if (iv.interviewerEmail) {
    await callAppsScript({
      action: "sendEmail",
      subject: "Action Required: Interview Assigned",
      body:
        `Hi ${iv.interviewerName || "there"},\n\nYour interview meeting link is ready:\n\n` +
        `Candidate: ${iv.candidateName || "—"}\nRound: ${round}\n` +
        `Date: ${fmtDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
        `Meeting Link: ${meetLink}\n\nThank you.`,
      recipients: [{ email: iv.interviewerEmail, name: iv.interviewerName || iv.interviewerEmail }],
    }).catch(err => console.error("Interviewer confirmation email failed:", err.message));
  }

  if (iv.candidateEmail) {
    let resources = null;
    try {
      const snap = await db.collection("settings").doc("preInterviewResources").get();
      resources = snap.exists ? snap.data() : null;
    } catch { /* resources are optional — send the email without them */ }

    const docs = resources?.documents || [];
    const instructionLines = [];
    if (resources?.videoGuideUrl) {
      instructionLines.push(`${resources.videoGuideLabel || "Video Setup Guide"}: ${resources.videoGuideUrl}`);
    }
    docs.filter(d => d.type === "instruction" && d.url)
      .forEach(d => instructionLines.push(`${d.label || "Interview Instructions"}: ${d.url}`));
    const referenceLines = docs.filter(d => d.type === "reference" && d.url)
      .map(d => `${d.label || "Reference Document"}: ${d.url}`);

    const instructionsBlock = instructionLines.length
      ? `\nPlease review the following before joining your interview:\n${instructionLines.map(l => `• ${l}`).join("\n")}\n`
      : "";
    const referenceBlock = referenceLines.length
      ? `\nAdditional Reference Documents:\n${referenceLines.map(l => `• ${l}`).join("\n")}\n`
      : "";

    await callAppsScript({
      action: "sendEmail",
      subject: `Interview Confirmed — ${round}`,
      body:
        `Hi ${iv.candidateName || "there"},\n\nYour interview has been confirmed:\n\n` +
        `Round: ${round}\nDate: ${fmtDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
        `Meeting Link: ${meetLink}\n` +
        instructionsBlock + referenceBlock +
        `\nNxtWave Interview Team`,
      recipients: [{ email: iv.candidateEmail, name: iv.candidateName || iv.candidateEmail }],
    }).catch(err => console.error("Candidate confirmation email failed:", err.message));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }
  try {
    return await scheduleHandler(req, res);
  } catch (err) {
    // Anything thrown before/outside the scheduling step itself (most
    // likely FIREBASE_SERVICE_ACCOUNT_KEY missing or malformed on the
    // server). Nothing has been created at this point, so the client is
    // told it's safe to fall back — and the real reason is returned instead
    // of Vercel's opaque HTML 500 page.
    console.error("schedule-interview crashed before scheduling:", err);
    return res.status(500).json({ success: false, error: "server_error", message: err?.message || String(err) });
  }
}

async function scheduleHandler(req, res) {
  const db = getDb(); // must run before getAuth() — initializes the Admin app

  const header = req.headers.authorization || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  let decoded;
  try {
    if (!idToken) throw new Error("no token");
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  const { interviewId } = req.body || {};
  if (!interviewId) {
    return res.status(400).json({ success: false, error: "invalid_parameter", message: "interviewId is required" });
  }

  const ref = db.collection("interviews").doc(interviewId);

  // Authorization + idempotency lock, atomically.
  let iv;
  let outcome;
  try {
    outcome = await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists) return { kind: "not_found" };
      const data = snap.data();

      let allowed = data.interviewerId === decoded.uid;
      if (!allowed) {
        const userSnap = await txn.get(db.collection("users").doc(decoded.uid));
        allowed = userSnap.exists && userSnap.data().role === "admin";
      }
      if (!allowed) return { kind: "forbidden" };

      if (data.eventId || data.meetLink) {
        return { kind: "already", data };
      }
      const startedAt = data.scheduleStartedAt ? new Date(data.scheduleStartedAt).getTime() : 0;
      if (startedAt && Date.now() - startedAt < LOCK_TTL_MS) {
        return { kind: "in_progress" };
      }
      txn.update(ref, { scheduleStartedAt: new Date().toISOString() });
      return { kind: "locked", data };
    });
  } catch (err) {
    console.error("schedule-interview lock failed:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }

  if (outcome.kind === "not_found") return res.status(404).json({ success: false, error: "not_found" });
  if (outcome.kind === "forbidden") return res.status(403).json({ success: false, error: "forbidden" });
  if (outcome.kind === "already") {
    return res.status(200).json({
      success: true, alreadyScheduled: true,
      meetLink: outcome.data.meetLink || "", eventId: outcome.data.eventId || "",
    });
  }
  if (outcome.kind === "in_progress") {
    return res.status(200).json({ success: true, inProgress: true });
  }
  iv = outcome.data;

  try {
    const result = await callAppsScript({
      action:           "schedule",
      interviewId,
      candidateEmail:   iv.candidateEmail,
      interviewerEmail: iv.interviewerEmail,
      candidateName:    iv.candidateName,
      interviewerName:  iv.interviewerName,
      round:            iv.round,
      date:             iv.scheduledDate,
      startTime:        iv.scheduledTime,
      durationMinutes:  iv.duration || 60,
    });

    await ref.update({
      meetLink:     result.meetLink || "",
      eventId:      result.eventId || "",
      recallBotId:  result.recallBotId || "",
      inviteSentAt: new Date().toISOString(),
      scheduleStartedAt: FieldValue.delete(),
      updatedAt:    new Date().toISOString(),
    });

    if (result.meetLink) await sendConfirmationEmails(db, iv, result.meetLink);

    return res.status(200).json({
      success: true,
      meetLink: result.meetLink || "",
      eventId: result.eventId || "",
      hostManagementWarning: result.hostManagementWarning || undefined,
    });
  } catch (err) {
    console.error("schedule-interview failed:", err);
    if (err.definitive) {
      // Apps Script explicitly reported failure — nothing was created, so
      // release the lock and let a retry go through immediately.
      await ref.update({ scheduleStartedAt: FieldValue.delete() }).catch(() => {});
      return res.status(502).json({ success: false, error: "apps_script_failed", message: err.message });
    }
    // Timeout / network error: the event may well have been created anyway,
    // so leave the lock in place (it expires on its own after LOCK_TTL_MS)
    // rather than inviting an immediate retry that could create a duplicate.
    return res.status(504).json({
      success: false, error: "no_response",
      message: "The calendar service didn't respond in time. The invite may still be created — check again in a minute before retrying.",
    });
  }
}
