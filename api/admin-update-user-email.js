import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

// Changes an interviewer/admin's actual LOGIN email (the Firebase Auth
// account), not just the display field in Firestore. Every other
// admin-on-user action in this app (changeRole, revoke, Set Phone — see
// src/pages/admin/SettingsPage.jsx) is a plain client-side Firestore write,
// because none of them touch the Auth account itself. Email is different:
// users/{uid}.email and the Auth user's real email are two separate things,
// and nothing keeps them in sync automatically. Writing only the Firestore
// field (the "obvious" quick way to do this) would silently desync them —
// the UI would show the new email while the person could still only log in
// with the old one. The Firebase client SDK can't fix this either:
// updateEmail() only works on the CURRENTLY signed-in user's own account,
// not another user's, by design. An admin changing someone ELSE's email
// requires the Admin SDK, which only runs server-side — hence this endpoint.
//
// POST /api/admin-update-user-email
// Body: { targetUserId: string, newEmail: string }
// Auth: "Authorization: Bearer <caller's Firebase ID token>" — the caller's
// OWN users/{uid} Firestore doc must have role === "admin" (the strict
// admin role, not the broader ADMIN_ROLES page-access set that also
// includes content_team/interviewer_content — see src/constants/roles.js).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // Everything below runs inside this try, including Admin SDK init. An init
  // failure outside a try used to make Vercel return its own plain-text error
  // page, which the browser then failed to parse as JSON — hiding the real cause.
  try {
    // getDb() must run before getAuth() — see push-academy-feedback.js for why
    // (same lazy Admin-app-init ordering requirement).
    const db = getDb();

    const header = req.headers.authorization || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!idToken) {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }

    let callerUid;
    try {
      ({ uid: callerUid } = await getAuth().verifyIdToken(idToken));
    } catch {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;
    if (callerRole !== "admin") {
      return res.status(403).json({ success: false, error: "forbidden", message: "Only an admin can change another user's email." });
    }

    const { targetUserId, newEmail } = req.body || {};
    if (!targetUserId || !newEmail) {
      return res.status(400).json({ success: false, error: "invalid_parameter", message: "targetUserId and newEmail are required." });
    }
    const trimmedEmail = String(newEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ success: false, error: "invalid_email", message: "That doesn't look like a valid email address." });
    }

    const targetSnap = await db.collection("users").doc(targetUserId).get();
    if (!targetSnap.exists) {
      return res.status(404).json({ success: false, error: "not_found" });
    }
    const oldEmail = targetSnap.data().email || "";
    if (oldEmail.toLowerCase() === trimmedEmail) {
      return res.status(200).json({ success: true, oldEmail, newEmail: trimmedEmail, unchanged: true });
    }

    // Updates the actual Auth account — this is what the person logs in
    // with. Their password is untouched; they sign in the same way as
    // before, just with the new email.
    await getAuth().updateUser(targetUserId, { email: trimmedEmail });

    // Keep the Firestore profile in sync — every notification/display/
    // export in the app reads from here, not from Auth directly.
    await db.collection("users").doc(targetUserId).update({ email: trimmedEmail });

    return res.status(200).json({ success: true, oldEmail, newEmail: trimmedEmail });
  } catch (err) {
    if (err?.code === "auth/email-already-exists") {
      return res.status(409).json({ success: false, error: "email_in_use", message: "That email is already used by another account." });
    }
    if (err?.code === "auth/invalid-email") {
      return res.status(400).json({ success: false, error: "invalid_email", message: "That doesn't look like a valid email address." });
    }
    console.error("admin-update-user-email error:", err);
    return res.status(500).json({ success: false, error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
