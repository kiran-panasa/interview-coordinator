import { db } from "../firebase";
import {
  collection, doc, updateDoc, query, orderBy, onSnapshot, arrayUnion,
} from "firebase/firestore";
import type { StudentQuery, QueryStatus } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// Admin-side only — the student side never writes this collection directly
// (every student mutation goes through the SSO session-authenticated
// backend, api/sso-handler.js's queries/create and queries/reply, since the
// Student Dashboard runs on an anonymous Firebase session with no reason to
// trust it with direct write access to other students' queries). The admin
// is already fully authenticated via Firebase Auth, so plain client
// Firestore reads/writes here are consistent with every other admin page.
export function subscribeToStudentQueries(callback: (queries: StudentQuery[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "studentQueries"), orderBy("updatedAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudentQuery))),
    err => reportFirestoreListenerError("studentQueries", err)
  );
}

export async function replyToQueryAsAdmin(queryId: string, text: string, byName: string): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, "studentQueries", queryId), {
    messages: arrayUnion({ from: "admin", text, at: now, byName }),
    status: "replied",
    updatedAt: now,
  });
}

export async function updateQueryStatus(queryId: string, status: QueryStatus): Promise<void> {
  await updateDoc(doc(db, "studentQueries", queryId), { status, updatedAt: new Date().toISOString() });
}
