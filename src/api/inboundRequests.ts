import { db } from "../firebase";
import {
  collection, doc, updateDoc, query, orderBy, onSnapshot,
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
