import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";

export async function getSkills() {
  const snap = await getDocs(query(collection(db, "skills"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToSkills(callback) {
  return onSnapshot(
    query(collection(db, "skills"), orderBy("name")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createSkill(name) {
  const ref = await addDoc(collection(db, "skills"), {
    name: name.trim(), createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateSkill(id, name) {
  await updateDoc(doc(db, "skills", id), { name: name.trim() });
}

export async function deleteSkill(id) {
  await deleteDoc(doc(db, "skills", id));
}
