import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction,
} from "firebase/firestore";

// ── Schedule Invites ──────────────────────────────────────────────────────────

export function subscribeToScheduleInvites(callback) {
  return onSnapshot(
    query(collection(db, "scheduleInvites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createScheduleInvite(data) {
  const ref = await addDoc(collection(db, "scheduleInvites"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateScheduleInvite(id, data) {
  await updateDoc(doc(db, "scheduleInvites", id), {
    ...data, updatedAt: new Date().toISOString(),
  });
}

export async function deleteScheduleInvite(id) {
  await deleteDoc(doc(db, "scheduleInvites", id));
}

export async function getScheduleInviteByToken(token) {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("inviteToken", "==", token)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getScheduleInvitesByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("candidateEmail", "==", email.toLowerCase()),
    orderBy("createdAt", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── OTP Verifications ─────────────────────────────────────────────────────────

export async function createOtpVerification(data) {
  // Invalidate any previous unused OTPs for this invite
  const old = await getDocs(query(
    collection(db, "otpVerifications"),
    where("inviteToken", "==", data.inviteToken),
    where("used", "==", false)
  ));
  for (const d of old.docs) await updateDoc(d.ref, { used: true });

  const ref = await addDoc(collection(db, "otpVerifications"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getLatestOtpByToken(inviteToken) {
  const snap = await getDocs(query(
    collection(db, "otpVerifications"),
    where("inviteToken", "==", inviteToken),
    where("used", "==", false)
  ));
  if (snap.empty) return null;
  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return docs[0];
}

export async function markOtpUsed(id) {
  await updateDoc(doc(db, "otpVerifications", id), { used: true });
}

// ── Atomic slot booking (Firestore transaction) ───────────────────────────────

export async function bookSlotForCandidate(interviewerId, slotId, inviteId, bookedDate, bookedTime) {
  const slotRef   = doc(db, "availability", interviewerId, "slots", slotId);
  const inviteRef = doc(db, "scheduleInvites", inviteId);

  await runTransaction(db, async (txn) => {
    const slotDoc = await txn.get(slotRef);
    if (!slotDoc.exists()) throw new Error("Slot no longer exists.");
    if (slotDoc.data().isBooked) throw new Error("This slot was just taken — please choose another.");

    txn.update(slotRef,   { isBooked: true, inviteId, bookedAt: new Date().toISOString() });
    txn.update(inviteRef, {
      status:              "pending_confirmation",
      bookedSlotId:        slotId,
      bookedInterviewerId: interviewerId,
      bookedDate,
      bookedTime,
      bookedAt:            new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
    });
  });
}
