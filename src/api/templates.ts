import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, arrayUnion, arrayRemove,
} from "firebase/firestore";
import type { Template } from "../types";

export async function getTemplates(): Promise<Template[]> {
  const snap = await getDocs(query(collection(db, "interviewTemplates"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Template));
}

export async function getTemplate(id: string): Promise<Template | null> {
  const snap = await getDoc(doc(db, "interviewTemplates", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Template : null;
}

export async function createTemplate(data: Omit<Template, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "interviewTemplates"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateTemplate(id: string, data: Partial<Omit<Template, "id">>): Promise<void> {
  await updateDoc(doc(db, "interviewTemplates", id), data);
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, "interviewTemplates", id));
}

export async function addQuestionToTemplate(templateId: string, questionId: string): Promise<void> {
  await updateDoc(doc(db, "interviewTemplates", templateId), {
    questionIds: arrayUnion(questionId),
  });
}

export async function removeQuestionFromTemplate(templateId: string, questionId: string): Promise<void> {
  await updateDoc(doc(db, "interviewTemplates", templateId), {
    questionIds: arrayRemove(questionId),
  });
}
