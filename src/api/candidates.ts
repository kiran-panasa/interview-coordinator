import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy,
} from "firebase/firestore";
import type { Candidate } from "../types";

export async function getCandidates(): Promise<Candidate[]> {
  const snap = await getDocs(query(collection(db, "candidates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Candidate));
}

// Single-doc fetch — used where only one candidate's current (not
// snapshotted) data is needed, e.g. the Interviewer Portal's live Resume link.
export async function getCandidate(id: string): Promise<Candidate | null> {
  const snap = await getDoc(doc(db, "candidates", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Candidate : null;
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

export async function archiveCandidate(id: string): Promise<void> {
  await updateDoc(doc(db, "candidates", id), {
    archived: true,
    archivedAt: new Date().toISOString(),
  });
}

export async function unarchiveCandidate(id: string): Promise<void> {
  await updateDoc(doc(db, "candidates", id), {
    archived: false,
    archivedAt: null,
  });
}
