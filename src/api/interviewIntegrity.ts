import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { Field } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { INTEGRITY_DOMAIN_PRESET } from "../utils/templateEngine";

// Single global checklist — NOT copied into each template. Every template
// pulls this live (see withIntegrityDomain in templateEngine.js) so an admin
// edit here takes effect everywhere immediately, with nothing to keep in
// sync and no per-template copy that can drift or go missing.
const SETTINGS_DOC = doc(db, "settings", "interviewIntegrity");

export interface InterviewIntegritySettings {
  domainFields: Field[];
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULTS: InterviewIntegritySettings = {
  domainFields: INTEGRITY_DOMAIN_PRESET.domainFields,
};

export function subscribeToInterviewIntegrity(
  callback: (settings: InterviewIntegritySettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC,
    snap => callback(snap.exists() ? { ...DEFAULTS, ...(snap.data() as InterviewIntegritySettings) } : DEFAULTS),
    err => reportFirestoreListenerError("interviewIntegrity", err)
  );
}

export async function getInterviewIntegrity(): Promise<InterviewIntegritySettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? { ...DEFAULTS, ...(snap.data() as InterviewIntegritySettings) } : DEFAULTS;
}

export async function updateInterviewIntegrity(
  domainFields: Field[],
  updatedBy: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    { domainFields, updatedAt: new Date().toISOString(), updatedBy },
    { merge: true }
  );
}
