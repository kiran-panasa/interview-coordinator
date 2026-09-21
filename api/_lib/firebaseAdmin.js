import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Server-only — never import this from src/. Reads a service account key
// from an env var that must NOT have the VITE_ prefix, or Vite would inline
// it into the public client bundle.
function loadServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set (server-side env var, no VITE_ prefix).");
  }
  raw = raw.trim();
  // Pasted wrapped in quotes (e.g. copied from a .env line).
  if (raw.length > 1 && raw[0] === raw[raw.length - 1] && (raw[0] === '"' || raw[0] === "'")) {
    raw = raw.slice(1, -1).trim();
  }
  // Base64-encoded copy of the key file.
  if (raw[0] !== "{") {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
      if (decoded[0] === "{") raw = decoded;
    } catch { /* fall through to the error below */ }
  }
  const attempts = [
    raw,
    // Pasting the key file can turn the private key's \n escapes into real
    // line breaks, which JSON.parse rejects inside a string — put them back.
    raw.replace(/("private_key"\s*:\s*")([\s\S]*?)("\s*,)/, (_m, pre, key, post) =>
      pre + key.replace(/\r?\n/g, "\\n") + post),
  ];
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") return JSON.parse(parsed); // double-encoded
      return parsed;
    } catch { /* try the next form */ }
  }
  // Shape only — never the key material itself.
  throw new Error(
    `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON (length ${raw.length}, starts with "${raw.slice(0, 1)}", ends with "${raw.slice(-1)}") — ` +
    "it must be the full contents of the service account .json file, from the first { to the last }."
  );
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
