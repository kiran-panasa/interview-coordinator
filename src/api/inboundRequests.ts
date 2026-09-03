import { db } from "../firebase";
import {
  collection, doc, updateDoc, query, where, orderBy, onSnapshot,
} from "firebase/firestore";
import type { InboundRequest } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// `interview_requests` is written directly by the IOE Admin Portal's own
// server (its /api/ic-request Vercel function, using a Firebase Admin
// service account scoped to THIS app's Firestore project — not a separate
// project). We only ever read/update it here, never create documents in it.
const COLLECTION = "interview_requests";

export function subscribeToInboundRequests(
  callback: (requests: InboundRequest[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLLECTION), orderBy("requestedAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as InboundRequest))),
    err => reportFirestoreListenerError(COLLECTION, err)
  );
}

// Narrower sibling of subscribeToInboundRequests() for AdminLayout's sidebar
// badge (and its "notify admins of new pending request" effect) — both only
// ever look at status="pending" requests, so scoping server-side cuts reads
// without changing what the badge shows. InboundPage keeps the full,
// all-statuses listener since its own status filter can show "All".
export function subscribeToPendingInboundRequests(
  callback: (requests: InboundRequest[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, COLLECTION), where("status", "==", "pending")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as InboundRequest))),
    err => reportFirestoreListenerError(`${COLLECTION}:pending`, err)
  );
}

export async function markInboundRequestNotified(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { notifiedAt: new Date().toISOString() });
}

export async function moveInboundRequestToNudge(
  id: string,
  candidateId: string,
  movedBy: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: "moved_to_nudge",
    candidateId,
    movedAt: new Date().toISOString(),
    movedBy,
  });
}

export async function dismissInboundRequest(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: "dismissed" });
}
