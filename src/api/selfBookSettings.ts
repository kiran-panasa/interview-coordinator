import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { SelfBookCutoffSettings } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { DEFAULT_SELF_BOOK_CUTOFF_TIME } from "../utils/selfBookWindow";

// Single-document settings collection — same shape as nudgeSettings.ts'
// SETTINGS_DOC, just one doc instead of a collection of many (there's only
// ever one cutoff time for the whole app).
const SETTINGS_DOC = doc(db, "settings", "selfBookCutoff");

const DEFAULTS: SelfBookCutoffSettings = {
  cutoffTime: DEFAULT_SELF_BOOK_CUTOFF_TIME,
};

export function subscribeToSelfBookCutoffSettings(
  callback: (settings: SelfBookCutoffSettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC,
    snap => callback(snap.exists() ? (snap.data() as SelfBookCutoffSettings) : DEFAULTS),
    err => reportFirestoreListenerError("selfBookCutoffSettings", err)
  );
}

export async function getSelfBookCutoffSettings(): Promise<SelfBookCutoffSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? (snap.data() as SelfBookCutoffSettings) : DEFAULTS;
}

export async function updateSelfBookCutoffSettings(
  data: Partial<Omit<SelfBookCutoffSettings, "updatedAt">>,
  updatedBy: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    { ...DEFAULTS, ...data, updatedAt: new Date().toISOString(), updatedBy },
    { merge: true }
  );
}
