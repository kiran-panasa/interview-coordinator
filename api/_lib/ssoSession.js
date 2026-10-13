import crypto from "crypto";
import { getDb } from "./firebaseAdmin.js";

// Matches "SSO Login — Implementation Details" (12 Oct 2026) Section 4 —
// idle timeout extended by activity, absolute cap regardless of activity.
export const SESSION_COOKIE = "ic_student_session";
export const CSRF_COOKIE    = "ic_student_csrf";
const IDLE_TIMEOUT_MS  = 30 * 60 * 1000;
const MAX_LIFETIME_MS  = 12 * 60 * 60 * 1000;

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

// The CSRF cookie is deliberately NOT HttpOnly — the double-submit pattern
// requires client JS to read it and echo it back as a header, proving the
// request came from a page that can read our own cookies (not a third
// party). The session cookie stays HttpOnly throughout.
export function setSessionCookies(res, sessionId, csrfToken, { secure }) {
  const maxAge = Math.floor(MAX_LIFETIME_MS / 1000);
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
    `${CSRF_COOKIE}=${csrfToken}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
  ]);
}

export function clearSessionCookies(res, { secure }) {
  const expired = `Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; ${expired}; HttpOnly; SameSite=Lax`,
    `${CSRF_COOKIE}=; ${expired}; SameSite=Lax`,
  ]);
}

// Validates the session cookie against its Firestore record, enforcing both
// the idle timeout and the absolute lifetime cap. Returns the session
// (with its id) or null — never throws on an invalid/expired session, since
// that's an ordinary "not signed in" outcome, not a server error.
export async function getValidSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  const db = getDb();
  const ref = db.collection("ssoSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  const now = Date.now();
  if (now - new Date(data.createdAt).getTime() > MAX_LIFETIME_MS) {
    await ref.delete().catch(() => {});
    return null;
  }
  if (now - new Date(data.lastActiveAt).getTime() > IDLE_TIMEOUT_MS) {
    await ref.delete().catch(() => {});
    return null;
  }
  await ref.update({ lastActiveAt: new Date().toISOString() }).catch(() => {});
  return { id: snap.id, ...data };
}

export function requireCsrf(req) {
  const cookies = parseCookies(req);
  const header = req.headers["x-csrf-token"];
  return !!header && !!cookies[CSRF_COOKIE] && header === cookies[CSRF_COOKIE];
}

export { parseCookies };
