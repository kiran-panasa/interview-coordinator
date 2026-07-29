import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Server-only — never import this from src/. Reads a service account key
// from an env var that must NOT have the VITE_ prefix, or Vite would inline
// it into the public client bundle.
function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set (server-side env var, no VITE_ prefix).");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON — paste the full service account key file contents.");
  }
}

// Reused across warm serverless invocations instead of re-initializing per request.
let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    if (!getApps().length) {
      initializeApp({ credential: cert(loadServiceAccount()) });
    }
    dbInstance = getFirestore();
  }
  return dbInstance;
}
