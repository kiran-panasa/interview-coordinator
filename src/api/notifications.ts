import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot,
} from "firebase/firestore";
import type { AppNotification } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export function subscribeToUserNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, "notifications"), where("recipientId", "==", userId)),
    snap => callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    ),
    err => reportFirestoreListenerError("notifications", err)
  );
}

export async function createNotification(
  data: Omit<AppNotification, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "notifications"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateNotification(
  id: string,
  data: Partial<Omit<AppNotification, "id">>
): Promise<void> {
  await updateDoc(doc(db, "notifications", id), data);
}
