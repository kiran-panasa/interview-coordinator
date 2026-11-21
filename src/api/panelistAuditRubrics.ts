import { db } from "../firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

// Admin-editable overrides for each Panelist Audit Rubric's text — see the
// "Audit Rubrics" tab on the Templates page. A key with no doc here simply
// hasn't been customized yet; callers fall back to
// src/constants/panelistAuditRubricDefaults.js's DEFAULT_RUBRICS, so every
// rubric is always "live" even before an admin ever saves one.
export interface PanelistAuditRubricDoc {
  label: string;
  text: string;
  updatedAt?: string;
}

export async function getPanelistAuditRubrics(): Promise<Record<string, PanelistAuditRubricDoc>> {
  const snap = await getDocs(collection(db, "panelistAuditRubrics"));
  const out: Record<string, PanelistAuditRubricDoc> = {};
  snap.docs.forEach(d => { out[d.id] = d.data() as PanelistAuditRubricDoc; });
  return out;
}

export async function savePanelistAuditRubric(key: string, data: { label: string; text: string }): Promise<void> {
  await setDoc(doc(db, "panelistAuditRubrics", key), { ...data, updatedAt: new Date().toISOString() });
}
