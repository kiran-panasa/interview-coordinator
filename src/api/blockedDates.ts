import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import type { BlockedDate } from "../types";
import { findBlockedDate } from "../utils/blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export function subscribeToBlockedDates(callback: (dates: BlockedDate[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "blockedDates"), orderBy("startDate", "asc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlockedDate))),
    err => reportFirestoreListenerError("blockedDates", err)
  );
}

export async function getBlockedDates(): Promise<BlockedDate[]> {
  const snap = await getDocs(query(collection(db, "blockedDates"), orderBy("startDate", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlockedDate));
}

export async function createBlockedDate(
  data: Omit<BlockedDate, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "blockedDates"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateBlockedDate(id: string, data: Partial<Omit<BlockedDate, "id">>): Promise<void> {
  await updateDoc(doc(db, "blockedDates", id), data);
}

export async function deleteBlockedDate(id: string): Promise<void> {
  await deleteDoc(doc(db, "blockedDates", id));
}

// Server-side lookup for a single date — used by scheduling/interview-creation
// funnels as a defense-in-depth check, not just relying on the UI already
// having filtered blocked dates out.
export async function findBlockedDateFor(dateStr: string): Promise<BlockedDate | null> {
  const dates = await getBlockedDates();
  return findBlockedDate(dateStr, dates) || null;
}
