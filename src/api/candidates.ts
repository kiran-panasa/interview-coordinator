import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy,
} from "firebase/firestore";
import type { Candidate } from "../types";

export async function getCandidates(): Promise<Candidate[]> {
  const snap = await getDocs(query(collection(db, "candidates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Candidate));
}

export async function createCandidate(data: Omit<Candidate, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "candidates"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateCandidate(id: string, data: Partial<Omit<Candidate, "id">>): Promise<void> {
  await updateDoc(doc(db, "candidates", id), data);
}

export async function deleteCandidate(id: string): Promise<void> {
  await deleteDoc(doc(db, "candidates", id));
}
