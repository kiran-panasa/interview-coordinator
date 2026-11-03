import { db } from "../firebase";
import {
  collection, doc, setDoc, deleteDoc, query, where, onSnapshot,
} from "firebase/firestore";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export interface AccessRequestLog {
  id: string;
  at?: string;
  outcome?: string;
  userId?: string;
  matchCount?: number;
  rawBody?: string;
}

export interface AccessRequestResolution {
  id: string; // userId
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

// Written server-side (Admin SDK, api/sso-handler.js's logTokenAttempt) every
// time Forms tries to sign a student in — this only ever reads the
// "student_not_found" slice: a student whose Forms account has no matching
// candidate record in our own Candidates list, which is exactly the "Oops"
// screen Forms shows them with no way for us to help unless an admin can
// actually see it happened. Single equality filter only, deliberately no
// orderBy/limit here — combining those needs a composite index that
// doesn't exist, and since this hook loads on every admin page (see
// AdminLayout's badge count), a missing-index error here would break the
// whole admin portal's connection-lost banner, not just this one page.
// Recency sorting/trimming happens client-side instead, in
// groupAccessRequests (src/utils/accessRequests.js).
const LOG_COLLECTION        = "ssoTokenRequestLog";
const RESOLUTIONS_COLLECTION = "accessRequestResolutions";

export function subscribeToFailedAccessRequests(
  callback: (logs: AccessRequestLog[]) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, LOG_COLLECTION),
      where("outcome", "==", "student_not_found"),
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessRequestLog))),
    err => reportFirestoreListenerError(`${LOG_COLLECTION}:student_not_found`, err)
  );
}

// Small — one doc per userId an admin has actually dealt with, not per
// attempt — so fetching the whole collection here is cheap.
export function subscribeToAccessRequestResolutions(
  callback: (resolutions: AccessRequestResolution[]) => void
): () => void {
  return onSnapshot(
    collection(db, RESOLUTIONS_COLLECTION),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessRequestResolution))),
    err => reportFirestoreListenerError(RESOLUTIONS_COLLECTION, err)
  );
}

export async function resolveAccessRequest(
  userId: string, resolvedBy: string, resolvedByName: string
): Promise<void> {
  await setDoc(doc(db, RESOLUTIONS_COLLECTION, userId), {
    resolvedAt: new Date().toISOString(), resolvedBy, resolvedByName,
  });
}

// Lets an admin reopen one if it turns out the candidate still can't log in.
export async function unresolveAccessRequest(userId: string): Promise<void> {
  await deleteDoc(doc(db, RESOLUTIONS_COLLECTION, userId));
}
