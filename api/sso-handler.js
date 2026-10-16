import { getDb } from "./_lib/firebaseAdmin.js";
import { randomToken } from "./_lib/ssoSession.js";
import { createSession, exchangeTokenForSession } from "./_lib/ssoExchange.js";
import { setSessionCookies, clearSessionCookies, getValidSession, requireCsrf } from "./_lib/ssoSession.js";
import { sendWhatsAppOtp } from "./_lib/whatsapp.js";
import { sendSmsOtp } from "./_lib/sms.js";

// Every /api/sso/* route, consolidated into one function — Vercel's Hobby
// plan caps a deployment at 12 Serverless Functions, and the 7 separate SSO
// files (accounts/token, accounts/callback, callback, me, logout,
// otp/request, otp/verify) pushed this project's total to 14, which is
// what made the "mobile-number login" deployment fail outright.
//
// This is a plain literal file, not a [...path] bracket route — Vercel's
// Next.js-style dynamic function-route convention isn't honored for this
// project's (Vite) framework preset, so a bracket file silently became
// unreachable (every request fell through to the SPA shell instead).
// vercel.json instead rewrites each friendly /api/sso/* path here with a
// ?route= query param, which this dispatches on.

const SECURE = process.env.NODE_ENV === "production";

// How much longer, past an invite's own expiresAt, a candidate can still
// book it from the authenticated Student Dashboard (Slot Overview tab)
// even after the emailed/magic link itself would call it expired — the
// link has no server-side enforcement of its own, so this is the one place
// that actually draws a hard line. After this, the invite is dropped from
// /me's pendingInvites (so it stops showing as bookable) and selfBook stops
// treating it as still-open (so "Find Slots" starts a fresh one instead of
// being stuck on a dead invite forever).
const BOOKING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
function isPastGrace(invite) {
  return !!invite.expiresAt && new Date(invite.expiresAt).getTime() + BOOKING_GRACE_MS < Date.now();
}

export default async function handler(req, res) {
  const route = String(req.query.route || "");

  try {
    switch (route) {
      case "accounts/token":    return await accountsToken(req, res);
      case "accounts/callback": return await accountsCallback(req, res);
      case "callback":          return await backendCallback(req, res);
      case "me":                return await me(req, res);
      case "logout":            return await logout(req, res);
      case "otp/request":       return await otpRequest(req, res);
      case "otp/verify":        return await otpVerify(req, res);
      case "profile/resume":    return await updateResume(req, res);
      case "interviews/request-reschedule": return await requestReschedule(req, res);
      case "interviews/self-book": return await selfBook(req, res);
      default:                  return res.status(404).json({ error: "not_found" });
    }
  } catch (err) {
    console.error(`sso/${route} error:`, err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// ── POST /api/sso/accounts/token ───────────────────────────────────────────
// Server-to-server endpoint Forms calls to mint a one-time login token.
const tokenRateLimitState = new Map();
function underTokenRateLimit(ip) {
  const now = Date.now();
  const entry = tokenRateLimitState.get(ip);
  if (!entry || now - entry.windowStart > 60_000) { tokenRateLimitState.set(ip, { count: 1, windowStart: now }); return true; }
  entry.count++;
  return entry.count <= 30;
}
// TEMPORARY — logs every real call Forms makes to this endpoint (whatever
// they send, whatever we return) to its own Firestore collection, so this
// can be diagnosed directly from the Firebase console instead of needing
// Forms' own server logs, which aren't available to us. Safe to remove
// once the integration is confirmed working.
async function logTokenAttempt(db, fields) {
  try {
    await db.collection("ssoTokenRequestLog").add({ at: new Date().toISOString(), ...fields });
  } catch { /* never let logging break the real response */ }
}

async function accountsToken(req, res) {
  const db = getDb();
  if (req.method !== "POST") {
    await logTokenAttempt(db, { outcome: "method_not_allowed", method: req.method });
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const apiKey = req.headers["x-api-key"];
  const keyMatches = !!apiKey && !!process.env.FORMS_SSO_API_KEY && apiKey === process.env.FORMS_SSO_API_KEY;
  if (!keyMatches) {
    await logTokenAttempt(db, {
      outcome: "unauthorized",
      apiKeyReceived: apiKey ? `${apiKey.slice(0, 6)}…(len ${apiKey.length})` : null,
      contentType: req.headers["content-type"] || null,
      rawBody: typeof req.body === "object" ? JSON.stringify(req.body) : String(req.body || ""),
    });
    return res.status(401).json({ error: "unauthorized" });
  }
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (!underTokenRateLimit(ip)) {
    await logTokenAttempt(db, { outcome: "rate_limited", ip });
    return res.status(429).json({ error: "rate_limited" });
  }

  const userId = String(req.body?.user_id || "").trim();
  if (!userId) {
    await logTokenAttempt(db, {
      outcome: "invalid_parameter",
      contentType: req.headers["content-type"] || null,
      rawBody: typeof req.body === "object" ? JSON.stringify(req.body) : String(req.body || ""),
    });
    return res.status(400).json({ error: "invalid_parameter", message: "user_id is required." });
  }

  const snap = await db.collection("candidates").where("uid", "==", userId).get();
  if (snap.size !== 1) {
    await logTokenAttempt(db, { outcome: "student_not_found", userId, matchCount: snap.size });
    return res.status(404).json({
      error: "student_not_found",
      message: "No access — you're not registered. Please connect with your team.",
    });
  }
  const candidate = snap.docs[0];

  const token = randomToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  await db.collection("ssoLoginTokens").doc(token).set({
    candidateId: candidate.id, studentUid: userId,
    createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), used: false,
  });
  await logTokenAttempt(db, { outcome: "success", userId, candidateId: candidate.id });
  // Exactly {"auth_token": "..."} per their documented contract — no extra
  // fields, in case their backend does strict response-schema validation.
  return res.status(200).json({ auth_token: token });
}

// ── POST /api/sso/accounts/callback?auth_token=X ───────────────────────────
// Frontend-driven exchange, called by the /sso/callback React page.
async function accountsCallback(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const authToken = String(req.query?.auth_token || "");
  const result = await exchangeTokenForSession(authToken);
  if (result.error) return res.status(401).json({ error: result.error });
  setSessionCookies(res, result.sessionId, result.csrfToken, { secure: SECURE });
  return res.status(200).json({ success: true });
}

// ── GET /api/sso/callback?auth_token=X ──────────────────────────────────────
// Backend-driven exchange — redirects the browser straight to the dashboard.
async function backendCallback(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  const authToken = String(req.query?.auth_token || "");
  const result = await exchangeTokenForSession(authToken);
  if (result.error) return res.redirect(302, `/student/portal?sso_error=${encodeURIComponent(result.error)}`);
  setSessionCookies(res, result.sessionId, result.csrfToken, { secure: SECURE });
  return res.redirect(302, "/student/dashboard");
}

// ── GET /api/sso/me ──────────────────────────────────────────────────────────
async function me(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  const session = await getValidSession(req);
  if (!session) return res.status(401).json({ error: "no_session" });

  const db = getDb();
  const candidateSnap = await db.collection("candidates").doc(session.candidateId).get();
  if (!candidateSnap.exists) return res.status(404).json({ error: "candidate_not_found" });
  const candidate = candidateSnap.data();

  const [programSnap, templateSnaps] = await Promise.all([
    candidate.program ? db.collection("programs").doc(candidate.program).get() : Promise.resolve(null),
    Promise.all((candidate.templateIds || []).map(tid => db.collection("interviewTemplates").doc(tid).get())),
  ]);
  const programName = programSnap?.exists ? programSnap.data().name : (candidate.program || "");
  const templates = templateSnaps
    .filter(s => s.exists)
    .map(s => ({ id: s.id, name: s.data().name, durationMinutes: s.data().durationMinutes || 60 }));

  // Only invites for templates CURRENTLY assigned to this candidate —
  // candidate.templateIds can change after an invite was created (admin
  // reassigns templates), and a stale invite for a template the student
  // isn't assigned to anymore shouldn't still show as bookable.
  const assignedTemplateIds = new Set(candidate.templateIds || []);
  const invitesSnap = await db.collection("scheduleInvites").where("candidateId", "==", session.candidateId).get();
  const pendingInvites = invitesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(inv => !["confirmed", "cancelled"].includes(inv.status))
    .filter(inv => inv.templateId && assignedTemplateIds.has(inv.templateId))
    .filter(inv => !isPastGrace(inv))
    .map(inv => ({
      id: inv.id, inviteToken: inv.inviteToken || "", templateId: inv.templateId || "", templateName: inv.templateName || "",
      round: inv.round || "", status: inv.status,
      dateRangeStart: inv.dateRangeStart || "", dateRangeEnd: inv.dateRangeEnd || "", expiresAt: inv.expiresAt || "",
      // InlineSlotPicker.jsx (Slot Overview / Book an Interview tab) reads
      // all four of these straight off the invite — duration (wrong default
      // of 60min for any non-default-length template otherwise),
      // timeRangeStart/End (an admin-set business-hours restriction, if
      // any), and interviewerIds (the skill-matched/manually-restricted
      // panelist pool, see findSkillMatchedInterviewerIds in selfBook) —
      // previously missing here entirely, so none of them ever reached the
      // dashboard's picker even though the public email-link flow
      // (SchedulePage.jsx, which reads the full invite doc directly) always
      // respected them correctly.
      duration: inv.duration || 60,
      timeRangeStart: inv.timeRangeStart || "",
      timeRangeEnd: inv.timeRangeEnd || "",
      interviewerIds: inv.interviewerIds || null,
      // Also read directly off the invite by InlineSlotPicker.jsx, for the
      // admin-notification emails it sends on booking/no-slots — without
      // these the emails literally said "undefined has selected a slot..."
      // (candidateName), and resolveActionAdminRecipients had no actor to
      // scope to so it fell back to broadcasting every active admin instead
      // of just the one who sent/owns this invite (sentBy). noSlotsNotifiedAt
      // is the guard against re-sending that same email every refresh.
      candidateName: inv.candidateName || "",
      sentBy: inv.sentBy || "",
      noSlotsNotifiedAt: inv.noSlotsNotifiedAt || "",
      // bookedDate/Time — the slot the candidate actually picked, once
      // status is pending_confirmation — was missing here too, so the
      // "awaiting confirmation" card on the dashboard could only say
      // "a slot was selected," never which one. selfBooked distinguishes a
      // student-initiated invite from an admin-sent nudge, shown on the
      // dashboard so it's clear where this invite came from.
      bookedDate: inv.bookedDate || "",
      bookedTime: inv.bookedTime || "",
      selfBooked: !!inv.selfBooked,
    }));

  // Matched by candidateId (the normal, correct path) UNIONED with a
  // candidateEmail match — a booking made against a different/duplicate
  // candidate doc for the same person (e.g. one created by an admin via the
  // old email-link nudge flow, another provisioned by SSO) would otherwise
  // silently never show up here even though session.candidateId itself
  // resolved correctly. This is the same class of linkage gap as the
  // Forms/Accounts uid mismatch found earlier (different dimension — that
  // was candidate.uid vs this account's SSO user_id; this is candidateId vs
  // a stale/duplicate candidate doc) — catching it here means a candidate
  // record mismatch degrades to "shows twice if duplicated" rather than
  // "an interview silently never appears."
  const [byIdSnap, byEmailSnap] = await Promise.all([
    db.collection("interviews").where("candidateId", "==", session.candidateId).get(),
    candidate.email
      ? db.collection("interviews").where("candidateEmail", "==", candidate.email).get()
      : Promise.resolve({ docs: [] }),
  ]);
  const interviewDocsById = new Map();
  [...byIdSnap.docs, ...byEmailSnap.docs].forEach(d => interviewDocsById.set(d.id, d));
  const interviews = [...interviewDocsById.values()]
    .map(d => {
      const iv = d.data();
      return {
        id: d.id, templateName: iv.templateName || "", round: iv.round || "",
        scheduledDate: iv.scheduledDate || "", scheduledTime: iv.scheduledTime || "",
        duration: iv.duration || 60, status: iv.status, meetLink: iv.meetLink || "",
        rescheduleRequested: !!iv.rescheduleRequested,
        rescheduleApproved: !!iv.rescheduleApproved,
        aiReport: iv.aiReport || null,
      };
    })
    .sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));

  return res.status(200).json({
    candidate: { name: candidate.name, email: candidate.email, uid: candidate.uid || "", program: programName, resumeLink: candidate.resumeLink || "" },
    templates, interviews, pendingInvites,
  });
}

// ── POST /api/sso/logout ─────────────────────────────────────────────────────
async function logout(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!requireCsrf(req)) return res.status(403).json({ error: "csrf_mismatch" });
  const session = await getValidSession(req);
  if (session) await getDb().collection("ssoSessions").doc(session.id).delete().catch(() => {});
  clearSessionCookies(res, { secure: SECURE });
  return res.status(200).json({ success: true });
}

// ── POST /api/sso/otp/request ────────────────────────────────────────────────
const otpRateLimitState = new Map();
function underOtpRateLimit(ip) {
  const now = Date.now();
  const entry = otpRateLimitState.get(ip);
  if (!entry || now - entry.windowStart > 60_000) { otpRateLimitState.set(ip, { count: 1, windowStart: now }); return true; }
  entry.count++;
  return entry.count <= 10;
}
function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
async function otpRequest(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (!underOtpRateLimit(ip)) return res.status(429).json({ error: "rate_limited" });

  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ error: "invalid_parameter", message: "phone is required." });

  const db = getDb();
  const snap = await db.collection("candidates").where("phone", "==", phone).get();
  if (snap.size !== 1) return res.status(404).json({ error: "student_not_found", message: "No access — you're not registered. Please connect with your team." });
  const candidate = snap.docs[0];

  const otp = generateOtp();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  await db.collection("otpLoginCodes").add({
    candidateId: candidate.id, phone, otp,
    createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), used: false,
  });

  // SMS is the primary channel — plain text, not WhatsApp. WhatsApp stays
  // as a secondary fallback (harmless to keep, in case it's configured
  // too), then the on-screen dev fallback if neither is set up yet.
  const sms = await sendSmsOtp(phone, otp);
  if (sms.sent) return res.status(200).json({ success: true, channel: "sms" });

  const whatsapp = await sendWhatsAppOtp(phone, otp);
  if (whatsapp.sent) return res.status(200).json({ success: true, channel: "whatsapp" });

  console.warn(`OTP for ${phone} (SMS not configured: ${sms.reason}; WhatsApp not configured: ${whatsapp.reason}):`, otp);
  return res.status(200).json({ success: true, channel: "dev_fallback", devOtp: otp, reason: sms.reason });
}

// ── POST /api/sso/otp/verify ──────────────────────────────────────────────────
async function otpVerify(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const phone = String(req.body?.phone || "").trim();
  const otp   = String(req.body?.otp   || "").trim();
  if (!phone || !otp) return res.status(400).json({ error: "invalid_parameter" });

  const db = getDb();
  const snap = await db.collection("otpLoginCodes").where("phone", "==", phone).where("used", "==", false).get();
  const record = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (!record) return res.status(401).json({ error: "no_code_requested" });
  if (new Date(record.expiresAt) < new Date()) return res.status(401).json({ error: "code_expired" });
  if (record.otp !== otp) return res.status(401).json({ error: "incorrect_code" });

  await db.collection("otpLoginCodes").doc(record.id).update({ used: true, usedAt: new Date().toISOString() });

  const session = await createSession(record.candidateId);
  setSessionCookies(res, session.sessionId, session.csrfToken, { secure: SECURE });
  return res.status(200).json({ success: true });
}

// ── POST /api/sso/profile/resume ───────────────────────────────────────────
// Lets the signed-in student set/update their own resume link — scoped to
// their OWN candidate record only (session.candidateId, never a client-
// supplied id), same pattern as every other session-gated write here.
async function updateResume(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!requireCsrf(req)) return res.status(403).json({ error: "csrf_mismatch" });
  const session = await getValidSession(req);
  if (!session) return res.status(401).json({ error: "no_session" });

  const resumeLink = String(req.body?.resumeLink || "").trim();
  if (resumeLink && !/^https?:\/\//i.test(resumeLink)) {
    return res.status(400).json({ error: "invalid_url", message: "Resume link must be a valid http(s) URL." });
  }
  await getDb().collection("candidates").doc(session.candidateId).update({
    resumeLink, resumeUpdatedAt: new Date().toISOString(),
  });
  return res.status(200).json({ success: true, resumeLink });
}

// ── POST /api/sso/interviews/request-reschedule ─────────────────────────────
// Records a reschedule request against the student's OWN interview only —
// verified by candidateId match, not just interview id, so a student can
// never flag someone else's interview. No SLA engine or auto-approval yet
// (see the Student Dashboard & SSO Technical Due Diligence doc — that's a
// bigger, separate piece of work) — this just captures the request and
// reason so an admin can see and act on it.
async function requestReschedule(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!requireCsrf(req)) return res.status(403).json({ error: "csrf_mismatch" });
  const session = await getValidSession(req);
  if (!session) return res.status(401).json({ error: "no_session" });

  const interviewId = String(req.body?.interviewId || "").trim();
  const reason = String(req.body?.reason || "").trim();
  if (!interviewId || !reason) return res.status(400).json({ error: "invalid_parameter" });

  const db = getDb();
  const ref = db.collection("interviews").doc(interviewId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().candidateId !== session.candidateId) {
    return res.status(404).json({ error: "interview_not_found" });
  }
  await ref.update({
    rescheduleRequested: true,
    rescheduleRequestReason: reason,
    rescheduleRequestedAt: new Date().toISOString(),
  });
  return res.status(200).json({ success: true });
}

// Resolves which active interviewers are eligible for a template's
// "Required Skills" (Template.skills, set on the Templates page) — an
// interviewer qualifies only if their own skills (InterviewersPage.jsx /
// ProfilePage.jsx) cover EVERY skill the template requires, not just one.
// Returns null (meaning "no restriction, use the full active-interviewer
// pool") when the template has no required skills set, OR when skill data
// is incomplete enough that nobody currently qualifies — self-book must
// never silently show zero bookable interviewers just because admins
// haven't finished tagging skills yet; it's meant to narrow the pool, not
// be able to block booking outright.
async function findSkillMatchedInterviewerIds(db, templateSkills) {
  if (!templateSkills || !templateSkills.length) return null;
  const snap = await db.collection("users")
    .where("role", "in", ["interviewer", "interviewer_content"])
    .where("status", "==", "active")
    .get();
  const matched = snap.docs
    .filter(d => {
      const userSkills = d.data().skills || [];
      return templateSkills.every(s => userSkills.includes(s));
    })
    .map(d => d.id);
  if (!matched.length) {
    console.warn(`[selfBook] No active interviewer matches all required skills [${templateSkills.join(", ")}] — falling back to the full interviewer pool.`);
    return null;
  }
  return matched;
}

// ── POST /api/sso/interviews/self-book ───────────────────────────────────────
// Lets a student proactively volunteer for one of their OWN assigned
// templates (candidate.templateIds — checked server-side, never trusting
// the client) instead of waiting for an admin-sent invite. Creates a
// ScheduleInvite the same shape admin-created ones have, pre-verified
// (status "otp_verified") since the SSO session already proved identity.
// Scoped to interviewers matching the template's Required Skills when any
// are set (see findSkillMatchedInterviewerIds) — same interviewerIds field
// an admin's manual "Select Panelists" picker already uses, so
// getAvailableSlots (src/api/availability.ts) needs no changes to respect it.
async function selfBook(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!requireCsrf(req)) return res.status(403).json({ error: "csrf_mismatch" });
  const session = await getValidSession(req);
  if (!session) return res.status(401).json({ error: "no_session" });

  const templateId = String(req.body?.templateId || "").trim();
  if (!templateId) return res.status(400).json({ error: "invalid_parameter" });

  const db = getDb();
  const candidateSnap = await db.collection("candidates").doc(session.candidateId).get();
  if (!candidateSnap.exists) return res.status(404).json({ error: "candidate_not_found" });
  const candidate = candidateSnap.data();
  if (!(candidate.templateIds || []).includes(templateId)) {
    return res.status(403).json({ error: "template_not_assigned" });
  }

  // Reuse an existing still-open invite for this template rather than
  // creating a duplicate if the student already started one — but not one
  // that's sat unbooked well past its own window (isPastGrace), since that's
  // effectively abandoned and reusing it would just hand back the same
  // dead-end invite forever instead of giving the student a fresh 7-day one.
  const existingSnap = await db.collection("scheduleInvites")
    .where("candidateId", "==", session.candidateId)
    .where("templateId", "==", templateId)
    .get();
  const existing = existingSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(inv => !["confirmed", "cancelled"].includes(inv.status) && !isPastGrace(inv));
  if (existing) {
    return res.status(200).json({ success: true, inviteId: existing.id, reused: true });
  }

  const templateSnap = await db.collection("interviewTemplates").doc(templateId).get();
  if (!templateSnap.exists) return res.status(404).json({ error: "template_not_found" });
  const template = templateSnap.data();

  const matchedInterviewerIds = await findSkillMatchedInterviewerIds(db, template.skills);

  const now = new Date();
  const dateRangeStart = now.toISOString().slice(0, 10);
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateRangeEnd = endDate.toISOString().slice(0, 10);
  const expiresAt = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const ref = await db.collection("scheduleInvites").add({
    candidateId: session.candidateId,
    candidateUid: candidate.uid || "",
    candidateEmail: candidate.email,
    candidateName: candidate.name,
    templateId,
    templateName: template.name,
    program: template.program || candidate.program || "",
    round: template.name,
    duration: template.durationMinutes || 60,
    dateRangeStart,
    dateRangeEnd,
    status: "otp_verified",
    inviteToken: randomToken(16),
    selfBooked: true,
    ...(matchedInterviewerIds ? { interviewerIds: matchedInterviewerIds } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
  });

  return res.status(200).json({ success: true, inviteId: ref.id });
}
