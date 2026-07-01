import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy,
} from "firebase/firestore";

export async function getCandidates() {
  const snap = await getDocs(query(collection(db, "candidates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCandidate(data) {
  const ref = await addDoc(collection(db, "candidates"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateCandidate(id, data) {
  await updateDoc(doc(db, "candidates", id), data);
}

export async function deleteCandidate(id) {
  await deleteDoc(doc(db, "candidates", id));
}
