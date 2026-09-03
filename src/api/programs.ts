import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy,
} from "firebase/firestore";
import type { Program } from "../types";

export async function getPrograms(): Promise<Program[]> {
  const snap = await getDocs(query(collection(db, "programs"), orderBy("order", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Program));
}

export async function createProgram(name: string, order: number): Promise<string> {
  const ref = await addDoc(collection(db, "programs"), {
    name, order, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateProgram(id: string, data: Partial<Omit<Program, "id">>): Promise<void> {
  await updateDoc(doc(db, "programs", id), data);
}

export async function deleteProgram(id: string): Promise<void> {
  await deleteDoc(doc(db, "programs", id));
}
