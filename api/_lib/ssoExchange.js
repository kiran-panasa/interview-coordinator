import { getDb } from "./firebaseAdmin.js";
import { randomToken } from "./ssoSession.js";

// Shared by every login path (Forms-token exchange, mobile-OTP verify) —
// creates a new session record once a candidate's identity has already
// been established by the caller.
export async function createSession(candidateId, studentUid = "") {
  const db = getDb();
  const sessionId = randomToken();
  const csrfToken = randomToken(16);
  const now = new Date().toISOString();
  await db.collection("ssoSessions").doc(sessionId).set({
    candidateId, studentUid, csrfToken, createdAt: now, lastActiveAt: now,
  });
  return { sessionId, csrfToken };
}

// Used by both callback endpoints (the frontend-driven
// /api/sso/accounts/callback and the backend-driven /api/sso/callback) —
// validates and CONSUMES a one-time login token (single use, 5-minute TTL,
// per the SSO spec Section 2), then creates a new session record.
//
// The consume check runs inside a transaction so the same token can never
// be redeemed twice even if both callback paths somehow receive it near-
// simultaneously.
export async function exchangeTokenForSession(authToken) {
  if (!authToken) return { error: "missing_token" };
  const db = getDb();
  const tokenRef = db.collection("ssoLoginTokens").doc(authToken);

  const claim = await db.runTransaction(async (txn) => {
    const snap = await txn.get(tokenRef);
    if (!snap.exists) return { error: "invalid_token" };
    const data = snap.data();
    if (data.used) return { error: "token_already_used" };
    if (new Date(data.expiresAt) < new Date()) return { error: "token_expired" };
    txn.update(tokenRef, { used: true, usedAt: new Date().toISOString() });
    return { candidateId: data.candidateId, studentUid: data.studentUid };
  });
  if (claim.error) return claim;

  return createSession(claim.candidateId, claim.studentUid);
}
