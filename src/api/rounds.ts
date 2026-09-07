import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import type { Round } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export async function getRounds(): Promise<Round[]> {
  const snap = await getDocs(query(collection(db, "rounds"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Round));
}

export function subscribeToRounds(callback: (rounds: Round[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "rounds"), orderBy("name")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Round))),
    err => reportFirestoreListenerError("rounds", err)
  );
}

export async function createRound(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "rounds"), {
    name: name.trim(), createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateRound(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, "rounds", id), { name: name.trim() });
}

export async function deleteRound(id: string): Promise<void> {
  await deleteDoc(doc(db, "rounds", id));
}

// Called wherever a round name is actually used (scheduling an interview,
// launching a nudge campaign) with whatever the admin typed — if it's a
// new name (not already in the list, case-insensitively), it's saved so it
// shows up as a normal option everywhere next time, with no separate
// "manage rounds" step required to make a one-off custom round stick.
export async function ensureRoundExists(name: string, existingRounds: Round[]): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const exists = existingRounds.some(r => r.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) return;
  await createRound(trimmed).catch(() => {}); // best-effort — never block the actual save on this
}

// One-time migration seed — the round dropdowns used to be two separate
// hardcoded lists (DEFAULT_ROUNDS in api/interviews.ts, NUDGE_ROUND_OPTIONS
// in constants/nudgeRounds.js) before rounds became an admin-managed
// Firestore collection. Seeds their union once so nothing existing admins
// relied on disappears. Guarded by a marker doc (not "is the collection
// empty") so it never re-seeds after an admin deliberately deletes every
// round.
const LEGACY_SEED_ROUNDS = [
  "HR Round", "Technical Round 1", "Technical Round 2", "Final Round",
  "Academy – DSA Interview", "React Developer", "React Developer – TR2",
  "Technical Interview Round", "IRP 2.0 L1 Human Interview", "Domain Expert Interview",
  "NxtWave Edge – DSA Interview", "Intensive Offline – Benchmarking Interview",
];

// Returns true only the one time it actually seeds — callers can use that
// to invalidate any already-mounted rounds query/cache so it shows up
// immediately instead of waiting for a reload.
export async function seedDefaultRoundsOnce(): Promise<boolean> {
  const markerRef = doc(db, "settings", "roundsSeeded");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return false;

  await Promise.all(LEGACY_SEED_ROUNDS.map(name => createRound(name)));
  await setDoc(markerRef, { completedAt: new Date().toISOString(), count: LEGACY_SEED_ROUNDS.length });
  return true;
}
