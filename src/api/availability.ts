import { db } from "../firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, onSnapshot,
} from "firebase/firestore";
import type { AvailabilitySlot, AvailableSlot } from "../types";
import { compareTimeLabels } from "../utils/dates";
import { getBlockedDates } from "./blockedDates";
import { isDateBlocked } from "../utils/blockedDates";

export function slotIdFor(date: string, time: string): string {
  return `${date}_${time.replace(/[: ]/g, "")}`;
}

// Firestore batches cap at 500 writes — chunk defensively even though real
// usage (a handful of dates × a handful of slots) never gets close.
async function runBatched(
  interviewerId: string,
  items: { slotId: string; data?: Record<string, unknown> }[],
  mode: "set" | "delete"
): Promise<void> {
  const CHUNK = 450;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + CHUNK)) {
      const ref = doc(db, "availability", interviewerId, "slots", item.slotId);
      if (mode === "set") batch.set(ref, item.data);
      else batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function getInterviewerAvailability(interviewerId: string): Promise<AvailabilitySlot[]> {
  const snap = await getDocs(collection(db, "availability", interviewerId, "slots"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot));
}

export function subscribeToInterviewerAvailability(
  interviewerId: string,
  callback: (slots: AvailabilitySlot[]) => void
): () => void {
  return onSnapshot(
    collection(db, "availability", interviewerId, "slots"),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot)))
  );
}

export function subscribeToSlotsForInterviewers(
  interviewerIds: string[],
  callback: (slots: Record<string, AvailabilitySlot[]>) => void
): () => void {
  if (interviewerIds.length === 0) { callback({}); return () => {}; }
  const state: Record<string, AvailabilitySlot[]> = {};
  const unsubs = interviewerIds.map(id =>
    onSnapshot(collection(db, "availability", id, "slots"), snap => {
      state[id] = snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot));
      callback({ ...state });
    })
  );
  return () => unsubs.forEach(u => u());
}

export async function addAvailabilitySlot(
  interviewerId: string,
  date: string,
  time: string
): Promise<void> {
  const slotId = slotIdFor(date, time);
  await setDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    date, time, isBooked: false, interviewId: null,
  });
}

export async function removeAvailabilitySlot(
  interviewerId: string,
  slotId: string
): Promise<void> {
  await deleteDoc(doc(db, "availability", interviewerId, "slots", slotId));
}

// Bulk create — used by multi-date / recurring / range-generated slot creation.
export async function addAvailabilitySlots(
  interviewerId: string,
  entries: { date: string; time: string }[]
): Promise<void> {
  await runBatched(
    interviewerId,
    entries.map(({ date, time }) => ({
      slotId: slotIdFor(date, time),
      data: { date, time, isBooked: false, interviewId: null },
    })),
    "set"
  );
}

// Bulk delete — used for multi-select removal. Only ever called with free
// (non-booked) slot ids; callers are responsible for filtering those out.
export async function removeAvailabilitySlots(
  interviewerId: string,
  slotIds: string[]
): Promise<void> {
  await runBatched(interviewerId, slotIds.map(slotId => ({ slotId })), "delete");
}

export async function markSlotBooked(
  interviewerId: string,
  slotId: string,
  interviewId: string
): Promise<void> {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    isBooked: true, interviewId,
  });
}

export async function markSlotFree(interviewerId: string, slotId: string): Promise<void> {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    isBooked: false, interviewId: null,
  });
}

export async function flagAvailabilitySlot(
  interviewerId: string,
  slotId: string,
  flagged: boolean
): Promise<void> {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), { flagged });
}

export async function getSlotsForInterviewers(
  interviewerIds: string[]
): Promise<Record<string, AvailabilitySlot[]>> {
  const result: Record<string, AvailabilitySlot[]> = {};
  await Promise.all(interviewerIds.map(async id => {
    const snap = await getDocs(collection(db, "availability", id, "slots"));
    result[id] = snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot));
  }));
  return result;
}

export async function getAvailableSlotsForTemplate(
  templateId: string,
  dateStart: string,
  dateEnd: string,
  forceRefresh = false
): Promise<AvailableSlot[]> {
  const cacheKey = `avail_${templateId}_${dateStart}_${dateEnd}`;
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: AvailableSlot[]; ts: number };
        if (Date.now() - ts < 5 * 60 * 1000) return data;
      }
    } catch { /* sessionStorage unavailable */ }
  }

  const [usersSnap, blockedDates] = await Promise.all([
    getDocs(collection(db, "users")),
    getBlockedDates(),
  ]);
  const interviewers = usersSnap.docs
    .map(d => d.data() as { role: string; status: string; templateIds?: string[]; displayName?: string; email: string } & { id: string })
    .map((u, i) => ({ ...u, id: usersSnap.docs[i].id }))
    .filter(u =>
      (u.role === "interviewer" || u.role === "interviewer_content") &&
      u.status === "active" &&
      (u.templateIds || []).includes(templateId)
    );

  const result: AvailableSlot[] = [];
  await Promise.all(interviewers.map(async ivr => {
    const slotsSnap = await getDocs(query(
      collection(db, "availability", ivr.id, "slots"),
      where("date", ">=", dateStart),
      where("date", "<=", dateEnd)
    ));
    slotsSnap.docs.forEach(d => {
      const slot = d.data();
      if (isDateBlocked(slot.date as string, blockedDates)) return;
      result.push({
        slotId:           d.id,
        interviewerId:    ivr.id,
        interviewerName:  ivr.displayName || ivr.email,
        interviewerEmail: ivr.email,
        date:             slot.date as string,
        time:             slot.time as string,
        isBooked:         !!slot.isBooked,
      });
    });
  }));
  result.sort((a, b) => a.date.localeCompare(b.date) || compareTimeLabels(a.time, b.time));

  try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() })); }
  catch { /* sessionStorage full or unavailable */ }

  return result;
}
