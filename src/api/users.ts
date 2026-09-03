import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, getCountFromServer,
} from "firebase/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import type { User, Invite } from "../types";

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getMyProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } as User : null;
}

export async function createUserProfile(uid: string, data: Omit<User, "id">): Promise<void> {
  const existing = await getDoc(doc(db, "users", uid));
  if (existing.exists()) return;
  await setDoc(doc(db, "users", uid), data);
}

export async function getAllUsers(): Promise<User[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
}

const INTERVIEWER_ROLES = ["interviewer", "interviewer_content"];

export interface UsersPageResult {
  items: User[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  done: boolean;
}

// Server-scoped "fresh N" fetch for the default Interviewers view — mirrors
// getCandidatesPage. Some legacy user docs may not have `createdAt` (it's
// optional on the User type, unlike Candidate.createdAt) — such docs are
// excluded from this ordered query entirely, so they'd only ever be found
// via a full-list search, never via "Load more". Acceptable for a default
// "browse recent" view, but worth knowing if an old interviewer seems
// to have vanished from the default list.
export async function getInterviewersPage(
  status: "active" | "archived",
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  take = 10
): Promise<UsersPageResult> {
  const constraints = [
    where("role", "in", INTERVIEWER_ROLES),
    where("status", "==", status),
    orderBy("createdAt", "desc"),
  ] as import("firebase/firestore").QueryConstraint[];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(take));

  const snap = await getDocs(query(collection(db, "users"), ...constraints));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
  return {
    items,
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : cursor,
    done: snap.docs.length < take,
  };
}

// Cheap aggregation counts for the Active/Archived tab badges — equality/`in`
// filters only, so no composite index is needed for these.
export async function getInterviewerCounts(): Promise<{ active: number; archived: number }> {
  const col = collection(db, "users");
  const [activeSnap, archivedSnap] = await Promise.all([
    getCountFromServer(query(col, where("role", "in", INTERVIEWER_ROLES), where("status", "==", "active"))),
    getCountFromServer(query(col, where("role", "in", INTERVIEWER_ROLES), where("status", "==", "archived"))),
  ]);
  return { active: activeSnap.data().count, archived: archivedSnap.data().count };
}

// Targeted equality-only fetch (no composite index needed) — used where
// only admins are needed (e.g. AdminLayout's inbound-request notification
// loop) instead of reading the entire users collection on every admin page.
export async function getActiveAdmins(): Promise<User[]> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "admin"), where("status", "==", "active")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
}

export async function getUsersByStatus(status: string): Promise<User[]> {
  const snap = await getDocs(query(collection(db, "users"), where("status", "==", status)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
}

// Targeted batch fetch by id (chunked at Firestore's 10-value `in` limit) —
// for resolving a small, known set of user ids (e.g. the handful of
// interviewers referenced by the ad-hoc question review queue) without
// reading the whole users collection.
export async function getUsersByIds(ids: string[]): Promise<User[]> {
  if (!ids || ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const results = await Promise.all(chunks.map(chunk =>
    getDocs(query(collection(db, "users"), where("__name__", "in", chunk)))
  ));
  return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
}

export async function updateUser(id: string, data: Partial<Omit<User, "id">>): Promise<void> {
  await updateDoc(doc(db, "users", id), data);
}

export async function deleteUser(id: string): Promise<void> {
  await deleteDoc(doc(db, "users", id));
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function createInvite(
  data: Omit<Invite, "id" | "status" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "invites"), {
    ...data,
    email: data.email.toLowerCase().trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getInvites(): Promise<Invite[]> {
  const snap = await getDocs(query(collection(db, "invites"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite));
}

export async function updateInvite(id: string, data: Partial<Omit<Invite, "id">>): Promise<void> {
  await updateDoc(doc(db, "invites", id), data);
}

export async function deleteInvite(id: string): Promise<void> {
  await deleteDoc(doc(db, "invites", id));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const snap = await getDocs(query(
    collection(db, "users"),
    where("email", "==", email.toLowerCase().trim()),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as User;
}

export async function getInviteByEmail(email: string): Promise<Invite | null> {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
    where("status", "==", "pending"),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as Invite;
}

export async function getAnyInviteByEmail(email: string): Promise<Invite | null> {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as Invite;
}
