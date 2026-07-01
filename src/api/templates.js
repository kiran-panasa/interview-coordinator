import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, arrayUnion, arrayRemove,
} from "firebase/firestore";

export async function getTemplates() {
  const snap = await getDocs(query(collection(db, "interviewTemplates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTemplate(id) {
  const snap = await getDoc(doc(db, "interviewTemplates", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTemplate(data) {
  const ref = await addDoc(collection(db, "interviewTemplates"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateTemplate(id, data) {
  await updateDoc(doc(db, "interviewTemplates", id), data);
}

export async function deleteTemplate(id) {
  await deleteDoc(doc(db, "interviewTemplates", id));
}

export async function addQuestionToTemplate(templateId, questionId) {
  await updateDoc(doc(db, "interviewTemplates", templateId), {
    questionIds: arrayUnion(questionId),
  });
}

export async function removeQuestionFromTemplate(templateId, questionId) {
  await updateDoc(doc(db, "interviewTemplates", templateId), {
    questionIds: arrayRemove(questionId),
  });
}
