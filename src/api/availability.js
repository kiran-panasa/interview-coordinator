import { db } from "../firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot,
} from "firebase/firestore";

export async function getInterviewerAvailability(interviewerId) {
  const snap = await getDocs(collection(db, "availability", interviewerId, "slots"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToInterviewerAvailability(interviewerId, callback) {
  return onSnapshot(
    collection(db, "availability", interviewerId, "slots"),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// Subscribes to slots for multiple interviewers; fires callback with { [interviewerId]: slot[] }
export function subscribeToSlotsForInterviewers(interviewerIds, callback) {
  if (interviewerIds.length === 0) { callback({}); return () => {}; }
  const state = {};
  const unsubs = interviewerIds.map(id =>
    onSnapshot(collection(db, "availability", id, "slots"), snap => {
      state[id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback({ ...state });
    })
  );
  return () => unsubs.forEach(u => u());
}

export async function addAvailabilitySlot(interviewerId, date, time) {
  const slotId = `${date}_${time.replace(/[: ]/g, "")}`;
  await setDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    date, time, isBooked: false, interviewId: null,
  });
}

export async function removeAvailabilitySlot(interviewerId, slotId) {
  await deleteDoc(doc(db, "availability", interviewerId, "slots", slotId));
}

export async function markSlotBooked(interviewerId, slotId, interviewId) {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    isBooked: true, interviewId,
  });
}

export async function markSlotFree(interviewerId, slotId) {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), {
    isBooked: false, interviewId: null,
  });
}

export async function flagAvailabilitySlot(interviewerId, slotId, flagged) {
  await updateDoc(doc(db, "availability", interviewerId, "slots", slotId), { flagged });
}

// Returns { [interviewerId]: slot[] } for a list of interviewer ids
export async function getSlotsForInterviewers(interviewerIds) {
  const result = {};
  await Promise.all(interviewerIds.map(async id => {
    const snap = await getDocs(collection(db, "availability", id, "slots"));
    result[id] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));
  return result;
}

export async function getAvailableSlotsForTemplate(templateId, dateStart, dateEnd) {
  const cacheKey = `avail_${templateId}_${dateStart}_${dateEnd}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < 5 * 60 * 1000) return data;
    }
  } catch { /* sessionStorage unavailable */ }

  const usersSnap = await getDocs(collection(db, "users"));
  const interviewers = usersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u =>
      (u.role === "interviewer" || u.role === "interviewer_content") &&
      u.status === "active" &&
      (u.templateIds || []).includes(templateId)
    );

  const result = [];
  await Promise.all(interviewers.map(async ivr => {
    const slotsSnap = await getDocs(query(
      collection(db, "availability", ivr.id, "slots"),
      where("date", ">=", dateStart),
      where("date", "<=", dateEnd)
    ));
    slotsSnap.docs.forEach(d => {
      const slot = d.data();
      if (!slot.isBooked) {
        result.push({
          slotId:           d.id,
          interviewerId:    ivr.id,
          interviewerName:  ivr.displayName || ivr.email,
          interviewerEmail: ivr.email,
          date: slot.date,
          time: slot.time,
        });
      }
    });
  }));
  result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() })); }
  catch { /* sessionStorage full or unavailable */ }

  return result;
}
