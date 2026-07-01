import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import type { Skill } from "../types";

export async function getSkills(): Promise<Skill[]> {
  const snap = await getDocs(query(collection(db, "skills"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Skill));
}

export function subscribeToSkills(callback: (skills: Skill[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "skills"), orderBy("name")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Skill)))
  );
}

export async function createSkill(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "skills"), {
    name: name.trim(), createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateSkill(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, "skills", id), { name: name.trim() });
}

export async function deleteSkill(id: string): Promise<void> {
  await deleteDoc(doc(db, "skills", id));
}
