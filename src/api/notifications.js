import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot,
} from "firebase/firestore";

export function subscribeToUserNotifications(userId, callback) {
  return onSnapshot(
    query(collection(db, "notifications"), where("recipientId", "==", userId)),
    snap => callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    )
  );
}

export async function createNotification(data) {
  const ref = await addDoc(collection(db, "notifications"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateNotification(id, data) {
  await updateDoc(doc(db, "notifications", id), data);
}
