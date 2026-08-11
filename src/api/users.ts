import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from "firebase/firestore";
import type { User, Invite } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

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

export function subscribeToUsers(callback: (users: User[]) => void): () => void {
  return onSnapshot(
    collection(db, "users"),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as User))),
    err => reportFirestoreListenerError("users", err)
  );
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

export function subscribeToInvites(callback: (invites: Invite[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "invites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite))),
    err => reportFirestoreListenerError("invites", err)
  );
}
