import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, onSnapshot, where,
} from "firebase/firestore";
import type { Vendor } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

export async function getVendors(): Promise<Vendor[]> {
  const snap = await getDocs(query(collection(db, "vendors"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
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
export async function setVendorMembers(vendorId: string, interviewerIds: string[]): Promise<void> {
  const currentSnap = await getDocs(query(collection(db, "users"), where("vendorId", "==", vendorId)));
  const currentIds = new Set(currentSnap.docs.map(d => d.id));
  const nextIds = new Set(interviewerIds);

  const batch = writeBatch(db);
  let writes = 0;
  currentIds.forEach(id => {
    if (!nextIds.has(id)) { batch.update(doc(db, "users", id), { vendorId: null }); writes++; }
  });
  nextIds.forEach(id => {
    if (!currentIds.has(id)) { batch.update(doc(db, "users", id), { vendorId }); writes++; }
  });
  if (writes) await batch.commit();
}
