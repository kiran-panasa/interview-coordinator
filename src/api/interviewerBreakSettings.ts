import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { InterviewerBreakSettings } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { DEFAULT_BREAK_AFTER_COUNT, DEFAULT_BREAK_MINUTES } from "../utils/interviewerBreaks";

// Single-document settings collection — same shape as nudgeSettings.ts /
// selfBookSettings.ts.
const SETTINGS_DOC = doc(db, "settings", "interviewerBreak");

const DEFAULTS: InterviewerBreakSettings = {
  afterCount: DEFAULT_BREAK_AFTER_COUNT,
  breakMinutes: DEFAULT_BREAK_MINUTES,
};

export function subscribeToInterviewerBreakSettings(
  callback: (settings: InterviewerBreakSettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC,
    snap => callback(snap.exists() ? (snap.data() as InterviewerBreakSettings) : DEFAULTS),
    err => reportFirestoreListenerError("interviewerBreakSettings", err)
  );
}

export async function getInterviewerBreakSettings(): Promise<InterviewerBreakSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? (snap.data() as InterviewerBreakSettings) : DEFAULTS;
}

export async function updateInterviewerBreakSettings(
  data: Partial<Omit<InterviewerBreakSettings, "updatedAt">>,
  updatedBy: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    { ...DEFAULTS, ...data, updatedAt: new Date().toISOString(), updatedBy },
    { merge: true }
  );
}
