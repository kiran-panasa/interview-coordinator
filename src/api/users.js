import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from "firebase/firestore";

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createUserProfile(uid, data) {
  const existing = await getDoc(doc(db, "users", uid));
  if (existing.exists()) return;
  await setDoc(doc(db, "users", uid), data);
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToUsers(callback) {
  return onSnapshot(collection(db, "users"), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function updateUser(id, data) {
  await updateDoc(doc(db, "users", id), data);
}

export async function deleteUser(id) {
  await deleteDoc(doc(db, "users", id));
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function createInvite(data) {
  const ref = await addDoc(collection(db, "invites"), {
    ...data,
    email: data.email.toLowerCase().trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getInvites() {
  const snap = await getDocs(query(collection(db, "invites"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateInvite(id, data) {
  await updateDoc(doc(db, "invites", id), data);
}

export async function deleteInvite(id) {
  await deleteDoc(doc(db, "invites", id));
}

export async function getInviteByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
    where("status", "==", "pending"),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getAnyInviteByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export function subscribeToInvites(callback) {
  return onSnapshot(
    query(collection(db, "invites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}
