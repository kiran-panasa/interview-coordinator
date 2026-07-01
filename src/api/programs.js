import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";

export function subscribeToPrograms(callback) {
  return onSnapshot(
    query(collection(db, "programs"), orderBy("order", "asc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function getPrograms() {
  const snap = await getDocs(query(collection(db, "programs"), orderBy("order", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createProgram(name, order) {
  const ref = await addDoc(collection(db, "programs"), {
    name, order, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateProgram(id, data) {
  await updateDoc(doc(db, "programs", id), data);
}

export async function deleteProgram(id) {
  await deleteDoc(doc(db, "programs", id));
}
