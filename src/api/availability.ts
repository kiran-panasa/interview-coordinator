import { db } from "../firebase";
import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, onSnapshot, getCountFromServer,
} from "firebase/firestore";
import type { AvailabilitySlot, AvailableSlot, BusyWindow } from "../types";
import { compareTimeLabels, timeToMinutes } from "../utils/dates";
import { getBlockedDates } from "./blockedDates";
import { isDateBlocked } from "../utils/blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { getUsersByIds } from "./users";
import { injectConsecutiveBreaks } from "../utils/interviewerBreaks";
import { getInterviewerBreakSettings } from "./interviewerBreakSettings";

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

// Symmetric counterpart to freeSlotsForInterview below — locks every raw
// slot doc an interview's full duration actually spans (not just the one
// matching its exact start time), same span lookup bookSlotForCandidate
// (api/scheduling.ts) uses. Used by admin's manual schedule/reassign/edit
// paths (InterviewsPage.jsx), which — unlike self-book/Nudge — don't go
// through that transaction-locked function at all, so without this a
// 60/90-minute admin-created interview only ever had its first 30 minutes
// actually marked booked, leaving the rest of its own span still shown (and
// bookable by someone else) as free.
export async function bookSlotsForInterview(
  interviewerId: string,
  date: string,
  time: string,
  durationMinutes: number,
  interviewId: string
): Promise<void> {
  if (!interviewerId || !date || !time) return;
  const startMin = timeToMinutes(time);
  const endMin = startMin + (durationMinutes || 30);
  const daySnap = await getDocs(query(
    collection(db, "availability", interviewerId, "slots"),
    where("date", "==", date)
  ));
  const toBook = daySnap.docs.filter(d => {
    const t = timeToMinutes((d.data() as { time?: string }).time || "");
    return t >= startMin && t < endMin;
  });
  await Promise.all(toBook.map(d => updateDoc(d.ref, { isBooked: true, interviewId })));
}

export async function markSlotFree(interviewerId: string, slotId: string): Promise<void> {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    isBooked: false, interviewId: null, heldByInviteId: null,
  });
}

// Frees every raw availability slot doc an already-scheduled interview's
// full duration actually spans, not just the one matching its exact start
// time — e.g. cancelling a 60-minute interview that started at 3:00 PM must
// also free the 3:30 slot it locked (see bookSlotForCandidate in
// api/scheduling.ts, which locks every raw slot in [start, start+duration)
// the same way), or that slot is left stuck "booked" forever with no invite
// or interview left pointing at it to ever free it later. Used by every
// cancel/decline/delete path for an already-confirmed interview — unlike
// freeSlotsHeldByInvite (used while a booking is still only an invite),
// this looks slots up by date+time span since a cancelled/deleted
// interview's own heldByInviteId tag may already be gone.
// One-time, self-guarding cleanup for raw availability slots left stuck
// isBooked:true from before freeSlotsForInterview existed — a cancelled/
// declined/deleted interview longer than one raw slot (any duration over
// 30 minutes) only ever had its FIRST slot freed by the old single-slot
// free, leaving the rest of its span orphaned (isBooked:true, with
// interviewId/heldByInviteId pointing at nothing live) forever — which is
// also what silently made a genuinely free slot unbookable by anyone else.
// Same settings-marker-doc guard as backfillAiReportPendingOnce and co.
// (src/api/interviews.ts) — runs the collectionGroup("slots") scan exactly
// once total, not per session.
export async function freeOrphanedBookedSlotsOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "orphanedSlotsCleanup");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const [bookedSnap, liveInterviewsSnap, liveInvitesSnap] = await Promise.all([
    getDocs(query(collectionGroup(db, "slots"), where("isBooked", "==", true))),
    getDocs(query(collection(db, "interviews"), where("status", "in",
      ["scheduled", "completed", "partially_completed", "no_show", "pending_acceptance"]))),
    getDocs(query(collection(db, "scheduleInvites"), where("status", "in", ["pending_confirmation", "confirmed"]))),
  ]);

  const liveInterviewIds = new Set(liveInterviewsSnap.docs.map(d => d.id));
  const liveInviteIds = new Set(liveInvitesSnap.docs.map(d => d.id));

  const orphaned = bookedSnap.docs.filter(d => {
    const data = d.data() as { interviewId?: string | null; heldByInviteId?: string | null };
    const pointsAtLiveInterview = !!data.interviewId && liveInterviewIds.has(data.interviewId);
    const pointsAtLiveInvite = !!data.heldByInviteId && liveInviteIds.has(data.heldByInviteId);
    return !pointsAtLiveInterview && !pointsAtLiveInvite;
  });

  for (let i = 0; i < orphaned.length; i += 450) {
    const batch = writeBatch(db);
    orphaned.slice(i, i + 450).forEach(d => {
      batch.update(d.ref, { isBooked: false, interviewId: null, heldByInviteId: null });
    });
    await batch.commit();
  }

  await setDoc(markerRef, { completedAt: new Date().toISOString(), count: orphaned.length });
}

export async function freeSlotsForInterview(
  interviewerId: string,
  date: string,
  time: string,
  durationMinutes: number
): Promise<void> {
  if (!interviewerId || !date || !time) return;
  const startMin = timeToMinutes(time);
  const endMin = startMin + (durationMinutes || 30);
  const daySnap = await getDocs(query(
    collection(db, "availability", interviewerId, "slots"),
    where("date", "==", date)
  ));
  const toFree = daySnap.docs.filter(d => {
    const t = timeToMinutes((d.data() as { time?: string }).time || "");
    return t >= startMin && t < endMin;
  });
  await Promise.all(toFree.map(d => updateDoc(d.ref, { isBooked: false, interviewId: null, heldByInviteId: null })));
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
export const BUSY_EXCLUDED_STATUSES = new Set(["cancelled", "declined"]);

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

// Interviews assigned to each interviewer WITHIN the date range being
// browsed (not all-time) — used to break ties when more than one
// interviewer is free for the same slot, so one panelist doesn't silently
// absorb every booking that week just by sorting first. Scoping this to the
// window being booked, rather than an interviewer's entire history, is
// deliberate: an interviewer who's simply been active longer (and so has a
// much higher all-time count) would otherwise lose every tie forever
// regardless of how light THIS week's load actually is — the thing that
// actually needs to stay fair is "did everyone get a fair share of this
// week's/this day's bookings", which a lifetime total doesn't track at all.
// Same composite index (interviewerId + scheduledDate) getInterviewerBusyWindows
// already relies on, with the same missing-index fallback.
async function getInterviewerLoadCounts(
  interviewerIds: string[],
  dateStart: string,
  dateEnd: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await Promise.all(interviewerIds.map(async id => {
    try {
      const snap = await getCountFromServer(query(
        collection(db, "interviews"),
        where("interviewerId", "==", id),
        where("scheduledDate", ">=", dateStart),
        where("scheduledDate", "<=", dateEnd)
      ));
      result[id] = snap.data().count;
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("index")) {
        const snap = await getCountFromServer(query(collection(db, "interviews"), where("interviewerId", "==", id)));
        result[id] = snap.data().count;
      } else {
        throw err;
      }
    }
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
  // Keyed by interviewerId — plain object (not a Map) for a trivial reason
  // now that there's no sessionStorage cache to (de)serialize for, but kept
  // as-is since every caller already destructures it that way.
  busyWindowsByInterviewer: Record<string, BusyWindow[]>;
  // Keyed by interviewerId — total interviews ever assigned, used to break
  // ties fairly when more than one interviewer is free for the same slot.
  loadByInterviewer: Record<string, number>;
}

// No caching here (there used to be a 5-minute sessionStorage one) — a
// candidate needs to see an interviewer's newly-added slot the moment it's
// bookable, not up to 5 minutes later just because they'd opened the picker
// recently in this same browser tab. `forceRefresh` is kept as a no-op
// parameter rather than removed, so every existing call site (which passes
// it after a booking conflict, or from the manual Refresh button) keeps
// working unchanged.
export async function getAvailableSlots(
  dateStart: string,
  dateEnd: string,
  interviewerIds: string[] | null = null,
  forceRefresh = false
): Promise<AvailableSlotsResult> {
  void forceRefresh;
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

  const [interviewers, blockedDates, breakSettings] = await Promise.all([
    fetchEligibleInterviewers(),
    getBlockedDates(),
    getInterviewerBreakSettings(),
  ]);
  const interviewerIdList = interviewers.map(ivr => ivr.id);

  const [slotsByInterviewer, busyWindowsByInterviewerMap, loadByInterviewer] = await Promise.all([
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
    getInterviewerLoadCounts(interviewerIdList, dateStart, dateEnd),
  ]);

  const result: AvailableSlot[] = slotsByInterviewer.flat();
  result.sort((a, b) => a.date.localeCompare(b.date) || compareTimeLabels(a.time, b.time));

  // "Two back-to-back is fine, then a break" — turns each interviewer's
  // real busy windows into the extra synthetic ones that actually enforce
  // it, so a slot inside the break period is just never offered, same as
  // any other genuinely busy time.
  const busyWindowsByInterviewer: Record<string, BusyWindow[]> = {};
  busyWindowsByInterviewerMap.forEach((windows, id) => {
    busyWindowsByInterviewer[id] = injectConsecutiveBreaks(windows, breakSettings.afterCount, breakSettings.breakMinutes);
  });

  return { slots: result, busyWindowsByInterviewer, loadByInterviewer };
}
