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
async function accountsToken(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !process.env.FORMS_SSO_API_KEY || apiKey !== process.env.FORMS_SSO_API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (!underTokenRateLimit(ip)) return res.status(429).json({ error: "rate_limited" });

  const userId = String(req.body?.user_id || "").trim();
  if (!userId) return res.status(400).json({ error: "invalid_parameter", message: "user_id is required." });

  const db = getDb();
  const snap = await db.collection("candidates").where("uid", "==", userId).get();
  if (snap.size !== 1) return res.status(404).json({ error: "student_not_found" });
  const candidate = snap.docs[0];

  const token = randomToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  await db.collection("ssoLoginTokens").doc(token).set({
    candidateId: candidate.id, studentUid: userId,
    createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), used: false,
  });
  return res.status(200).json({ auth_token: token, expires_in: 300 });
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

  const invitesSnap = await db.collection("scheduleInvites").where("candidateId", "==", session.candidateId).get();
  const pendingInvites = invitesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(inv => !["confirmed", "cancelled"].includes(inv.status))
    .map(inv => ({
      id: inv.id, inviteToken: inv.inviteToken || "", templateName: inv.templateName || "",
      round: inv.round || "", status: inv.status,
      dateRangeStart: inv.dateRangeStart || "", dateRangeEnd: inv.dateRangeEnd || "",
    }));

  const interviewsSnap = await db.collection("interviews").where("candidateId", "==", session.candidateId).get();
  const interviews = interviewsSnap.docs
    .map(d => {
      const iv = d.data();
      return {
        id: d.id, templateName: iv.templateName || "", round: iv.round || "",
        scheduledDate: iv.scheduledDate || "", scheduledTime: iv.scheduledTime || "",
        duration: iv.duration || 60, status: iv.status, meetLink: iv.meetLink || "",
        rescheduleRequested: !!iv.rescheduleRequested,
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
  if (snap.size !== 1) return res.status(404).json({ error: "student_not_found", message: "No account found for this mobile number." });
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
