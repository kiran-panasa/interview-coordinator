import { db } from "../firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, onSnapshot,
} from "firebase/firestore";
import type { AvailabilitySlot, AvailableSlot, BusyWindow } from "../types";
import { compareTimeLabels, timeToMinutes } from "../utils/dates";
import { getBlockedDates } from "./blockedDates";
import { isDateBlocked } from "../utils/blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { getUsersByIds } from "./users";

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
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot))),
    err => reportFirestoreListenerError("interviewerAvailability", err)
  );
}

export function subscribeToSlotsForInterviewers(
  interviewerIds: string[],
  callback: (slots: Record<string, AvailabilitySlot[]>) => void
): () => void {
  if (interviewerIds.length === 0) { callback({}); return () => {}; }
  const state: Record<string, AvailabilitySlot[]> = {};
  const unsubs = interviewerIds.map(id =>
    onSnapshot(
      collection(db, "availability", id, "slots"),
      snap => {
        state[id] = snap.docs.map(d => ({ id: d.id, ...d.data() } as AvailabilitySlot));
        callback({ ...state });
      },
      err => reportFirestoreListenerError(`slotsForInterviewer:${id}`, err)
    )
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
    isBooked: false, interviewId: null, heldByInviteId: null,
  });
}

// A longer interview can hold more than one raw slot doc (see
// bookSlotForCandidate in api/scheduling.ts, which tags every slot it locks
// with heldByInviteId) — this frees all of them, not just the one the
// invite's own bookedSlotId points at, so rejecting/resending/deleting a
// booking releases the interviewer's whole reserved window back to
// everyone else instead of leaving the rest of it silently stuck.
export async function freeSlotsHeldByInvite(interviewerId: string, inviteId: string): Promise<void> {
  if (!interviewerId || !inviteId) return;
  const snap = await getDocs(query(
    collection(db, "availability", interviewerId, "slots"),
    where("heldByInviteId", "==", inviteId)
  ));
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { isBooked: false, interviewId: null, heldByInviteId: null })));
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

// Statuses that mean the interviewer is NOT genuinely committed to this
// time anymore — everything else (including pending_acceptance: they've
// been assigned it and haven't yet said no) still counts as busy.
const BUSY_EXCLUDED_STATUSES = new Set(["cancelled", "declined"]);

// The authoritative "is this interviewer actually busy then" signal — built
// fresh from their real interviews every time it's read, rather than a flag
// (availability slot isBooked) that has to be kept in sync by every
// scheduling path. This is what makes a manually-scheduled interview
// correctly block a nudge candidate from double-booking the same time (and
// vice versa), and what makes a reschedule/cancel free the old time and
// block the new one with no separate bookkeeping — the next read just sees
// the interview's current date/time/status.
function toBusyWindows(
  docs: { id: string; data(): { status?: string; scheduledDate?: string; scheduledTime?: string; duration?: number } }[],
  dateStart: string,
  dateEnd: string,
  excludeInterviewId?: string
): BusyWindow[] {
  const windows: BusyWindow[] = [];
  docs.forEach(d => {
    if (excludeInterviewId && d.id === excludeInterviewId) return;
    const iv = d.data();
    if (!iv.scheduledDate || !iv.scheduledTime) return;
    if (iv.scheduledDate < dateStart || iv.scheduledDate > dateEnd) return;
    if (iv.status && BUSY_EXCLUDED_STATUSES.has(iv.status)) return;
    const startMin = timeToMinutes(iv.scheduledTime);
    windows.push({ date: iv.scheduledDate, startMin, endMin: startMin + (iv.duration || 60) });
  });
  return windows;
}

// excludeInterviewId — pass the interview currently being edited so its own
// existing booking doesn't show up as a conflict with itself (otherwise
// re-picking its own current time, or any time within its own duration,
// would be wrongly refused).
export async function getInterviewerBusyWindows(
  interviewerId: string,
  dateStart: string,
  dateEnd: string,
  excludeInterviewId?: string
): Promise<BusyWindow[]> {
  if (!interviewerId) return [];
  try {
    const snap = await getDocs(query(
      collection(db, "interviews"),
      where("interviewerId", "==", interviewerId),
      where("scheduledDate", ">=", dateStart),
      where("scheduledDate", "<=", dateEnd)
    ));
    return toBusyWindows(snap.docs, dateStart, dateEnd, excludeInterviewId);
  } catch (err) {
    // Composite index (interviewerId + scheduledDate) not built/ready yet —
    // fall back to an equality-only query (needs no composite index at all)
    // and filter the date range client-side, so this never hard-fails the
    // candidate scheduling page while the index is still building.
    if (err instanceof Error && err.message.toLowerCase().includes("index")) {
      const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "==", interviewerId)));
      return toBusyWindows(snap.docs, dateStart, dateEnd, excludeInterviewId);
    }
    throw err;
  }
}

// Same, in bulk for a pool of interviewers — mirrors getSlotsForInterviewers'
// one-query-per-interviewer parallel fetch, scoped to the same date range so
// it stays cheap (no unscoped collection reads).
export async function getBusyWindowsForInterviewers(
  interviewerIds: string[],
  dateStart: string,
  dateEnd: string
): Promise<Map<string, BusyWindow[]>> {
  const result = new Map<string, BusyWindow[]>();
  await Promise.all(interviewerIds.map(async id => {
    result.set(id, await getInterviewerBusyWindows(id, dateStart, dateEnd));
  }));
  return result;
}

// `interviewerIds`, when given (non-empty), restricts the eligible pool to
// exactly those interviewers — the explicit "Panelists" selection an admin
// can make when launching a Nudge campaign (see ScheduleInvite.interviewerIds
// in types.ts). When omitted/empty, every active interviewer is eligible.
// templateId is no longer used to gate eligibility at all — the old model
// (an interviewer's own profile-level templateIds silently determining
// whether ANY candidate ever saw their availability) was replaced because it
// was invisible and error-prone; template still matters for which
// evaluation form the resulting interview uses, just not for this.
export interface AvailableSlotsResult {
  slots: AvailableSlot[];
  // Keyed by interviewerId — plain object rather than a Map so this is
  // JSON-serializable for the sessionStorage cache below.
  busyWindowsByInterviewer: Record<string, BusyWindow[]>;
}

export async function getAvailableSlots(
  dateStart: string,
  dateEnd: string,
  interviewerIds: string[] | null = null,
  forceRefresh = false
): Promise<AvailableSlotsResult> {
  const poolKey = interviewerIds && interviewerIds.length ? [...interviewerIds].sort().join(",") : "all";
  const cacheKey = `avail_${poolKey}_${dateStart}_${dateEnd}`;
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: AvailableSlotsResult; ts: number };
        if (Date.now() - ts < 5 * 60 * 1000) return data;
      }
    } catch { /* sessionStorage unavailable */ }
  }

  type CandidateUser = { role: string; status: string; displayName?: string; email: string; id: string };

  // Scoped queries only — never an unscoped full-collection read, since this
  // page is public/unauthenticated and gets far more daily traffic than any
  // admin page.
  async function fetchEligibleInterviewers(): Promise<CandidateUser[]> {
    if (interviewerIds && interviewerIds.length) {
      const users = await getUsersByIds(interviewerIds);
      return users
        .filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active")
        .map(u => ({ role: u.role, status: u.status, displayName: u.displayName, email: u.email, id: u.id }));
    }
    const snap = await getDocs(query(
      collection(db, "users"),
      where("role", "in", ["interviewer", "interviewer_content"]),
      where("status", "==", "active")
    ));
    return snap.docs.map(d => ({ ...(d.data() as Omit<CandidateUser, "id">), id: d.id }));
  }

  const [interviewers, blockedDates] = await Promise.all([
    fetchEligibleInterviewers(),
    getBlockedDates(),
  ]);
  const interviewerIdList = interviewers.map(ivr => ivr.id);

  const [slotsByInterviewer, busyWindowsByInterviewerMap] = await Promise.all([
    Promise.all(interviewers.map(async ivr => {
      const slotsSnap = await getDocs(query(
        collection(db, "availability", ivr.id, "slots"),
        where("date", ">=", dateStart),
        where("date", "<=", dateEnd)
      ));
      const slots: AvailableSlot[] = [];
      slotsSnap.docs.forEach(d => {
        const slot = d.data();
        if (isDateBlocked(slot.date as string, blockedDates)) return;
        slots.push({
          slotId:           d.id,
          interviewerId:    ivr.id,
          interviewerName:  ivr.displayName || ivr.email,
          interviewerEmail: ivr.email,
          date:             slot.date as string,
          time:             slot.time as string,
          isBooked:         !!slot.isBooked,
        });
      });
      return slots;
    })),
    getBusyWindowsForInterviewers(interviewerIdList, dateStart, dateEnd),
  ]);

  const result: AvailableSlot[] = slotsByInterviewer.flat();
  result.sort((a, b) => a.date.localeCompare(b.date) || compareTimeLabels(a.time, b.time));

  const busyWindowsByInterviewer: Record<string, BusyWindow[]> = {};
  busyWindowsByInterviewerMap.forEach((windows, id) => { busyWindowsByInterviewer[id] = windows; });

  const data: AvailableSlotsResult = { slots: result, busyWindowsByInterviewer };
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* sessionStorage full or unavailable */ }

  return data;
}
