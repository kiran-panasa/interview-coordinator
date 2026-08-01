import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { PreInterviewResourcesSettings } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// Single-document settings collection — mirrors src/api/nudgeSettings.ts.
// Everything here is stored as links (Drive share links / video URLs), not
// uploaded files — this app has no Firebase Storage plumbing anywhere else,
// and every other "document" in the app (resumeLink, transcriptUrl,
// meetingRecordingUrl) already follows the same link-only convention.
const SETTINGS_DOC = doc(db, "settings", "preInterviewResources");

const DEFAULTS: PreInterviewResourcesSettings = {
  videoGuideLabel: "",
  videoGuideUrl: "",
  documents: [],
};

export function subscribeToPreInterviewResources(
  callback: (settings: PreInterviewResourcesSettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC,
    snap => callback(snap.exists() ? { ...DEFAULTS, ...(snap.data() as PreInterviewResourcesSettings) } : DEFAULTS),
    err => reportFirestoreListenerError("preInterviewResources", err)
  );
}

export async function getPreInterviewResources(): Promise<PreInterviewResourcesSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? { ...DEFAULTS, ...(snap.data() as PreInterviewResourcesSettings) } : DEFAULTS;
}

export async function updatePreInterviewResources(
  data: Partial<Omit<PreInterviewResourcesSettings, "updatedAt">>,
  updatedBy: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    { ...DEFAULTS, ...data, updatedAt: new Date().toISOString(), updatedBy },
    { merge: true }
  );
}
