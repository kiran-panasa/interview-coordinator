import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import type { NudgeReminderSettings } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// Single-document settings collection — mirrors the shape used elsewhere
// for admin-managed config, just one doc instead of a collection of many
// (there's only ever one set of reminder-timing values for the whole app).
const SETTINGS_DOC = doc(db, "settings", "nudgeReminders");

const DEFAULTS: NudgeReminderSettings = {
  reminder1DelayDays: 1,
  reminder2DelayDays: 2,
  sendTime: "10:00",
};

export function subscribeToNudgeReminderSettings(
  callback: (settings: NudgeReminderSettings) => void
): () => void {
  return onSnapshot(
    SETTINGS_DOC,
    snap => callback(snap.exists() ? (snap.data() as NudgeReminderSettings) : DEFAULTS),
    err => reportFirestoreListenerError("nudgeReminderSettings", err)
  );
}

export async function getNudgeReminderSettings(): Promise<NudgeReminderSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? (snap.data() as NudgeReminderSettings) : DEFAULTS;
}

export async function updateNudgeReminderSettings(
  data: Partial<Omit<NudgeReminderSettings, "updatedAt">>,
  updatedBy: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    { ...DEFAULTS, ...data, updatedAt: new Date().toISOString(), updatedBy },
    { merge: true }
  );
}
