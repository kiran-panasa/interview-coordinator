import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, onSnapshot, where,
} from "firebase/firestore";
import type { Vendor, User } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export async function getVendors(): Promise<Vendor[]> {
  const snap = await getDocs(query(collection(db, "vendors"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
}

// Single-vendor lookup — used by the Vendor Dashboard to resolve its own
// vendor's display name from the viewer's own vendorContactFor, without
// reading the full vendors collection (see VendorDashboardPage.jsx).
export async function getVendor(id: string): Promise<Vendor | null> {
  const snap = await getDoc(doc(db, "vendors", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Vendor) : null;
}

// This vendor's current interviewer roster — the same query
// setVendorMembers/deleteVendor above already use internally, exposed here
// for the Vendor Dashboard (a vendor contact's own scoped "Panelists" view).
export async function getVendorInterviewers(vendorId: string): Promise<User[]> {
  const snap = await getDocs(query(collection(db, "users"), where("vendorId", "==", vendorId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
}

export function subscribeToVendors(callback: (vendors: Vendor[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "vendors"), orderBy("name")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor))),
    err => reportFirestoreListenerError("vendors", err)
  );
}

export async function createVendor(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "vendors"), {
    name: name.trim(), createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateVendor(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, "vendors", id), { name: name.trim() });
}

// Un-assigns every interviewer currently under this vendor before deleting
// it — otherwise they'd be left pointing at a vendor id that no longer
// resolves to anything, which would silently vanish from every filter
// instead of falling back to "no vendor" the way a manual reassignment would.
export async function deleteVendor(id: string): Promise<void> {
  const membersSnap = await getDocs(query(collection(db, "users"), where("vendorId", "==", id)));
  if (!membersSnap.empty) {
    const batch = writeBatch(db);
    membersSnap.docs.forEach(d => batch.update(d.ref, { vendorId: null }));
    await batch.commit();
  }
  await deleteDoc(doc(db, "vendors", id));
}

// Replaces a vendor's whole interviewer roster in one go — called from the
// "Manage Interviewers" picker with the full set of ids that should now
// belong to this vendor (both newly checked and newly unchecked are in
// scope; a member who stays checked is written again, harmlessly).
// Keeps an interviewer's EXISTING interview records in sync with their new
// vendor assignment. An interview's vendorId is a snapshot taken at
// creation time (see withVendorId, api/interviews.ts) — deliberately not
// kept live-updated on every read — so an interviewer added to a vendor
// AFTER they'd already run interviews left those older records with no
// vendorId at all, invisible to that vendor's dashboard forever (Firestore
// security rules gate interview reads on vendorId matching exactly; there's
// no client-side workaround for a stale/missing snapshot). Called for both
// directions: newly added (backfill to the new vendorId) and removed
// (clear back to null, same as a brand-new interview with no vendor yet).
async function resyncInterviewerVendorId(interviewerId: string, vendorId: string | null): Promise<void> {
  const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "==", interviewerId)));
  const targets = snap.docs.filter(d => ((d.data() as { vendorId?: string | null }).vendorId || null) !== vendorId);
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach(d => batch.update(d.ref, { vendorId }));
    await batch.commit();
  }
}

export async function setVendorMembers(vendorId: string, interviewerIds: string[]): Promise<void> {
  const currentSnap = await getDocs(query(collection(db, "users"), where("vendorId", "==", vendorId)));
  const currentIds = new Set(currentSnap.docs.map(d => d.id));
  const nextIds = new Set(interviewerIds);
  const added   = [...nextIds].filter(id => !currentIds.has(id));
  const removed = [...currentIds].filter(id => !nextIds.has(id));

  const batch = writeBatch(db);
  let writes = 0;
  removed.forEach(id => { batch.update(doc(db, "users", id), { vendorId: null }); writes++; });
  added.forEach(id   => { batch.update(doc(db, "users", id), { vendorId }); writes++; });
  if (writes) await batch.commit();

  await Promise.all([
    ...added.map(id => resyncInterviewerVendorId(id, vendorId)),
    ...removed.map(id => resyncInterviewerVendorId(id, null)),
  ]);
}

// On-demand fix for members who were already on this vendor BEFORE
// resyncInterviewerVendorId existed, or whose interview records drifted out
// of sync some other way — re-stamps vendorId onto every CURRENT member's
// interviews unconditionally (idempotent, safe to run repeatedly), without
// needing to remove and re-add them through setVendorMembers to trigger it.
export async function resyncVendorInterviews(vendorId: string): Promise<number> {
  const membersSnap = await getDocs(query(collection(db, "users"), where("vendorId", "==", vendorId)));
  const memberIds = membersSnap.docs.map(d => d.id);
  let total = 0;
  for (const id of memberIds) {
    const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "==", id)));
    const targets = snap.docs.filter(d => ((d.data() as { vendorId?: string | null }).vendorId || null) !== vendorId);
    total += targets.length;
    for (let i = 0; i < targets.length; i += 450) {
      const batch = writeBatch(db);
      targets.slice(i, i + 450).forEach(d => batch.update(d.ref, { vendorId }));
      await batch.commit();
    }
  }
  return total;
}
