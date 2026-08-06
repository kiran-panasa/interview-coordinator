import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction,
} from "firebase/firestore";
import type { ScheduleInvite, OtpVerification, InviteHistoryEntry } from "../types";
import { parseInterviewStart } from "../utils/dates";
import { findBlockedDateFor } from "./blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// ── Schedule Invites ──────────────────────────────────────────────────────────

export function subscribeToScheduleInvites(
  callback: (invites: ScheduleInvite[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, "scheduleInvites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleInvite))),
    err => reportFirestoreListenerError("scheduleInvites", err)
  );
}

// Scoped to just the pending-confirmation subset — used for the admin
// sidebar's "pending bookings" badge, which only ever needs to know about
// this small, transient slice, not the full (constantly-growing) history
// that subscribeToScheduleInvites() reads for pages like Nudge Analytics.
// Keeping this always-on listener narrow is what keeps it cheap to run for
// the entire admin session.
export function subscribeToPendingScheduleInvites(
  callback: (invites: ScheduleInvite[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, "scheduleInvites"), where("status", "==", "pending_confirmation")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleInvite))),
    err => reportFirestoreListenerError("scheduleInvites", err)
  );
}

export async function createScheduleInvite(
  data: Omit<ScheduleInvite, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "scheduleInvites"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateScheduleInvite(
  id: string,
  data: Partial<Omit<ScheduleInvite, "id">>
): Promise<void> {
  await updateDoc(doc(db, "scheduleInvites", id), {
    ...data, updatedAt: new Date().toISOString(),
  });
}

export async function deleteScheduleInvite(id: string): Promise<void> {
  await deleteDoc(doc(db, "scheduleInvites", id));
}

export async function getScheduleInviteByToken(token: string): Promise<ScheduleInvite | null> {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("inviteToken", "==", token)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as ScheduleInvite;
}

export async function getScheduleInvitesByEmail(email: string): Promise<ScheduleInvite[]> {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("candidateEmail", "==", email.toLowerCase()),
    orderBy("createdAt", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleInvite));
}

// ── Invite history (audit trail for the candidate lifecycle timeline) ─────────

export async function logInviteHistory(inviteId: string, status: string, note?: string): Promise<void> {
  await addDoc(collection(db, "scheduleInvites", inviteId, "history"), {
    status, at: new Date().toISOString(), ...(note ? { note } : {}),
  });
}

export async function getInviteHistory(inviteId: string): Promise<InviteHistoryEntry[]> {
  const snap = await getDocs(
    query(collection(db, "scheduleInvites", inviteId, "history"), orderBy("at", "asc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InviteHistoryEntry));
}

// ── OTP Verifications ─────────────────────────────────────────────────────────

export async function createOtpVerification(
  data: Omit<OtpVerification, "id" | "createdAt">
): Promise<string> {
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

export async function getLatestOtpByToken(
  inviteToken: string
): Promise<OtpVerification | null> {
  const snap = await getDocs(query(
    collection(db, "otpVerifications"),
    where("inviteToken", "==", inviteToken),
    where("used", "==", false)
  ));
  if (snap.empty) return null;
  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as OtpVerification))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return docs[0];
}

export async function markOtpUsed(id: string): Promise<void> {
  await updateDoc(doc(db, "otpVerifications", id), { used: true });
}

// ── Atomic slot booking (Firestore transaction) ───────────────────────────────

export async function bookSlotForCandidate(
  interviewerId: string,
  slotId: string,
  inviteId: string,
  bookedDate: string,
  bookedTime: string
): Promise<void> {
  // Validated here too (not just in the UI) since this is the single
  // function every booking path — student portal, resend flows, etc. —
  // funnels through, regardless of what the client-side UI allowed.
  const slotStart = parseInterviewStart(bookedDate, bookedTime);
  if (slotStart && slotStart < new Date()) {
    throw new Error("This slot has already passed — please choose a future time.");
  }
  const blocked = await findBlockedDateFor(bookedDate);
  if (blocked) {
    throw new Error(`This date is blocked${blocked.reason ? `: ${blocked.reason}` : ""}. Please choose another date.`);
  }

  const slotRef    = doc(db, "availability", interviewerId, "slots", slotId);
  const inviteRef  = doc(db, "scheduleInvites", inviteId);
  const historyRef = doc(collection(db, "scheduleInvites", inviteId, "history"));

  await runTransaction(db, async (txn) => {
    const slotDoc = await txn.get(slotRef);
    if (!slotDoc.exists()) throw new Error("Slot no longer exists.");
    if (slotDoc.data().isBooked) throw new Error("This slot is already booked. Please choose another available slot.");

    const now = new Date().toISOString();
    txn.update(slotRef,   { isBooked: true, inviteId, bookedAt: now });
    txn.update(inviteRef, {
      status:              "pending_confirmation",
      bookedSlotId:        slotId,
      bookedInterviewerId: interviewerId,
      bookedDate,
      bookedTime,
      bookedAt:            now,
      updatedAt:           now,
    });
    // Logged inside the same transaction as the booking itself — this is
    // the one function every booking path (student portal, any future
    // path) funnels through, so this is the single reliable place to
    // guarantee the "candidate booked" history entry always exists.
    txn.set(historyRef, { status: "pending_confirmation", at: now, note: "Candidate booked a slot" });
  });
}
