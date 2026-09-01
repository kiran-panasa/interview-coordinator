import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, where, limit, startAfter, getCountFromServer,
} from "firebase/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import type { Candidate } from "../types";

export async function getCandidates(): Promise<Candidate[]> {
  const snap = await getDocs(query(collection(db, "candidates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Candidate));
}

export interface CandidatesPageResult {
  items: Candidate[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  done: boolean;
}

// Server-scoped "fresh N" fetch for the default (no search, active-only)
// Candidates view — avoids reading the whole collection just to show a
// tab's most recent rows. Filtering out archived docs happens client-side
// (not every legacy doc has an `archived` field, so a server-side
// `archived == false` filter would silently miss them); `cursor`/`done`
// are still keyed off the raw page so "Load more" keeps working correctly
// even when a batch happens to contain archived rows.
export async function getCandidatesPage(
  programId: string | null,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  take = 10
): Promise<CandidatesPageResult> {
  const constraints = [] as import("firebase/firestore").QueryConstraint[];
  if (programId) constraints.push(where("program", "==", programId));
  constraints.push(orderBy("createdAt", "desc"));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(take));

  const snap = await getDocs(query(collection(db, "candidates"), ...constraints));
  const items = snap.docs
    .filter(d => d.data().archived !== true)
    .map(d => ({ id: d.id, ...d.data() } as Candidate));
  return {
    items,
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : cursor,
    done: snap.docs.length < take,
  };
}

export interface CandidateCounts {
  total: number;
  archived: number;
  byProgram: Record<string, { total: number; archived: number }>;
}

// Cheap (aggregation, ~1 read regardless of collection size) counts for the
// header/tab badges — lets the default Candidates view stay scoped to a
// handful of documents without losing accurate "N active" / per-program
// counts. Equality-only filters (program==, archived==) never need a
// composite index, so this works with zero index setup.
export async function getCandidateCounts(programIds: string[]): Promise<CandidateCounts> {
  const col = collection(db, "candidates");
  const [totalSnap, archivedSnap, ...programSnaps] = await Promise.all([
    getCountFromServer(query(col)),
    getCountFromServer(query(col, where("archived", "==", true))),
    ...programIds.flatMap(id => [
      getCountFromServer(query(col, where("program", "==", id))),
      getCountFromServer(query(col, where("program", "==", id), where("archived", "==", true))),
    ]),
  ]);
  const byProgram: Record<string, { total: number; archived: number }> = {};
  programIds.forEach((id, i) => {
    byProgram[id] = {
      total: programSnaps[i * 2].data().count,
      archived: programSnaps[i * 2 + 1].data().count,
    };
  });
  return { total: totalSnap.data().count, archived: archivedSnap.data().count, byProgram };
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
