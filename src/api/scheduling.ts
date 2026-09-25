import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction,
} from "firebase/firestore";
import type { ScheduleInvite, OtpVerification, InviteHistoryEntry } from "../types";
import { parseInterviewStart, timeToMinutes } from "../utils/dates";
import { findBlockedDateFor } from "./blockedDates";
import { freeSlotsHeldByInvite } from "./availability";
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

// Deleting the invite record alone used to leave two things behind:
//  - if the candidate had already picked a slot, that slot stayed marked
//    isBooked on the interviewer's own availability forever (no interview
//    was ever created from it, so nothing else would free it);
//  - the invite's own history subcollection, which Firestore never
//    cascade-deletes, orphaned under a doc that no longer exists.
// This centralizes the real cleanup so every caller (this tab's row delete,
// Nudge Analytics' bulk/row delete) gets it for free, and — the candidate-
// facing effect — getScheduleInviteByToken returns null the moment this
// runs, which is what flips their link straight to "Invalid Link".
export async function deleteScheduleInvite(id: string): Promise<void> {
  const ref  = doc(db, "scheduleInvites", id);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as ScheduleInvite) : null;

  if (data?.bookedSlotId && data?.bookedInterviewerId) {
    // Frees every slot this booking held (a longer interview can span more
    // than one raw slot doc — see bookSlotForCandidate), not just the exact
    // one bookedSlotId points at. Falls back to freeing just that one slot
    // directly for invites booked before heldByInviteId existed.
    await freeSlotsHeldByInvite(data.bookedInterviewerId, id).catch(() => {});
    await updateDoc(doc(db, "availability", data.bookedInterviewerId, "slots", data.bookedSlotId), {
      isBooked: false, interviewId: null, heldByInviteId: null,
    }).catch(() => {}); // slot may already be gone/reassigned — deleting the invite must still proceed
  }

  const historySnap = await getDocs(collection(db, "scheduleInvites", id, "history"));
  await Promise.all(historySnap.docs.map(d => deleteDoc(d.ref)));

  await deleteDoc(ref);
}

export async function getScheduleInviteByToken(token: string): Promise<ScheduleInvite | null> {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("inviteToken", "==", token)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as ScheduleInvite;
}

// Reverse lookup — used when an admin edits an already-scheduled interview,
// so the linked invite's bookedDate/bookedTime/bookedIntervierId can be kept
// in sync (that invite is what the Candidate Portal actually reads).
export async function getScheduleInviteByInterviewId(interviewId: string): Promise<ScheduleInvite | null> {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("interviewId", "==", interviewId)
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
  bookedTime: string,
  durationMinutes = 60
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

  // Longer interviews span more than one raw slot doc — e.g. a 90-minute
  // booking at 3:00 PM also occupies whatever's submitted at 3:30/4:00. The
  // UI (collapseSlotsByDuration) already refuses to offer a start whose span
  // overlaps something booked, but that's a point-in-time check, not a
  // lock — two candidates picking different-but-overlapping starts at
  // nearly the same moment could otherwise both succeed. Finding every raw
  // slot in the span and locking all of them here (not just the one
  // clicked) closes that race. Slots are looked up outside the transaction
  // (Firestore transactions can only get() known refs, not run queries) and
  // re-verified with txn.get() below before anything is written.
  const startMin = timeToMinutes(bookedTime);
  const endMin   = startMin + durationMinutes;
  const daySnap = await getDocs(query(
    collection(db, "availability", interviewerId, "slots"),
    where("date", "==", bookedDate)
  ));
  const coveredRefs = new Set([slotRef.id]);
  daySnap.docs.forEach(d => {
    const t = timeToMinutes((d.data() as { time?: string }).time || "");
    if (t >= startMin && t < endMin) coveredRefs.add(d.id);
  });
  const otherRefs = [...coveredRefs].filter(id => id !== slotRef.id).map(id => doc(db, "availability", interviewerId, "slots", id));

  await runTransaction(db, async (txn) => {
    const slotDoc = await txn.get(slotRef);
    if (!slotDoc.exists()) throw new Error("Slot no longer exists.");
    if (slotDoc.data().isBooked) throw new Error("This slot is already booked. Please choose another available slot.");

    const otherDocs = await Promise.all(otherRefs.map(ref => txn.get(ref)));
    for (const d of otherDocs) {
      if (d.exists() && d.data().isBooked) {
        throw new Error("Part of this time range was just booked by someone else. Please choose another available slot.");
      }
    }

    const now = new Date().toISOString();
    // heldByInviteId lets a later reject/resend/delete find and free every
    // slot this booking consumed, not just the one that was clicked.
    txn.update(slotRef, { isBooked: true, inviteId, bookedAt: now, heldByInviteId: inviteId });
    otherRefs.forEach((ref, i) => {
      if (otherDocs[i].exists()) txn.update(ref, { isBooked: true, inviteId, bookedAt: now, heldByInviteId: inviteId });
    });
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
