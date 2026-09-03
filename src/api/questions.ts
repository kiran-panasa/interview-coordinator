import { db } from "../firebase";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, increment, limit, startAfter, getCountFromServer,
} from "firebase/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import type { Question, AdhocQuestion, QuestionFilters } from "../types";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";

// ── Rating label descriptors ──────────────────────────────────────────────────

export const CODING_PS_LABELS: Record<number, string> = {
  1: "Minimal progress, could not reach even a basic working approach",
  2: "Partial basic solution only, needed multiple hints to get there",
  3: "Solved with a working but non-optimal approach, understood the logic",
  4: "Solved with 1 minor nudge, reached optimal approach with good reasoning",
  5: "Solved independently with the most efficient solution, explained clearly",
};

export const CODING_CI_LABELS: Record<number, string> = {
  1: "Could not write any meaningful code",
  2: "Partial basic solution only, needed multiple hints to get there",
  3: "Solved with a working but non-optimal approach, understood the logic",
  4: "Solved with 1 minor nudge, reached optimal approach with good reasoning",
  5: "Clean, optimal, well-structured implementation with clear explanation",
};

export const THEORY_LABELS: Record<number, string> = {
  1: "Incorrect or could not answer",
  2: "Partial answer, follow-ups frequently exposed gaps in understanding",
  3: "Correct but textbook answer, struggled when follow-ups pushed deeper",
  4: "Good understanding with solid follow-up answers",
  5: "Excellent depth, handled all follow-ups confidently",
};

export const PROJECT_LABELS: Record<number, string> = {
  1: "No meaningful understanding of the project",
  2: "Thin understanding, likely limited hands-on involvement",
  3: "Understands the project broadly, vague on specific decisions or challenges",
  4: "Good understanding, can explain most decisions and challenges",
  5: "Deep understanding, articulated all decisions and trade-offs clearly",
};

export const RESUME_LABELS: Record<number, string> = {
  1: "No relevant skills or experience demonstrated",
  2: "Familiar — surface-level knowledge only",
  3: "Knows the surface, basic understanding demonstrated",
  4: "Solid skills demonstrated with good examples",
  5: "Strong, well-rounded profile with clear evidence of depth",
};

export const VERDICT_OPTIONS = ["Shortlisted", "Average - Retake Interview", "Rejected"];

// ── Question Bank ─────────────────────────────────────────────────────────────

export async function getQuestions(filters: QuestionFilters = {}): Promise<Question[]> {
  const snap = await getDocs(query(collection(db, "questions"), orderBy("createdAt", "desc")));
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
  if (filters.domainType) docs = docs.filter(d => d.domainType === filters.domainType as unknown);
  if (filters.difficulty)  docs = docs.filter(d => d.difficulty  === filters.difficulty);
  if (filters.skill)       docs = docs.filter(d => (d.skills || []).includes(filters.skill!));
  if (filters.status)      docs = docs.filter(d => d.status === filters.status);
  else                     docs = docs.filter(d => d.status !== "archived");
  return docs;
}

export interface QuestionsPageResult {
  items: Question[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  done: boolean;
}

// Server-scoped "fresh N" fetch for the default Question Bank view — mirrors
// getCandidatesPage/getInterviewersPage. Question.status and Question.createdAt
// are both required fields (unlike Candidate.archived/User.createdAt), so
// this query is reliable for every doc — nothing can silently fall outside it.
export async function getQuestionsPage(
  status: "active" | "archived",
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  take = 20
): Promise<QuestionsPageResult> {
  const constraints = [
    where("status", "==", status),
    orderBy("createdAt", "desc"),
  ] as import("firebase/firestore").QueryConstraint[];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(take));

  const snap = await getDocs(query(collection(db, "questions"), ...constraints));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
  return {
    items,
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : cursor,
    done: snap.docs.length < take,
  };
}

export interface QuestionCounts { active: number; archived: number; }

// Cheap aggregation counts for the active/archived header text.
export async function getQuestionCounts(): Promise<QuestionCounts> {
  const col = collection(db, "questions");
  const [activeSnap, archivedSnap] = await Promise.all([
    getCountFromServer(query(col, where("status", "==", "active"))),
    getCountFromServer(query(col, where("status", "==", "archived"))),
  ]);
  return { active: activeSnap.data().count, archived: archivedSnap.data().count };
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids || ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const results = await Promise.all(chunks.map(chunk =>
    getDocs(query(collection(db, "questions"), where("__name__", "in", chunk)))
  ));
  return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
}

export async function createQuestion(
  data: Omit<Question, "id" | "status" | "usageCount" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "questions"), {
    ...data,
    status: "active",
    usageCount: 0,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateQuestion(
  id: string,
  data: Partial<Omit<Question, "id">>
): Promise<void> {
  await updateDoc(doc(db, "questions", id), { ...data, updatedAt: new Date().toISOString() });
}

export async function archiveQuestion(id: string): Promise<void> {
  await updateDoc(doc(db, "questions", id), { status: "archived", updatedAt: new Date().toISOString() });
}

// Hard delete — permanent, unlike archiveQuestion. Callers are responsible
// for first removing this question's id from any template's questionIds
// (see removeQuestionFromTemplate in api/templates.ts) so no template is
// left pointing at a document that no longer exists.
export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(db, "questions", id));
}

export async function incrementQuestionUsage(questionIds: string[]): Promise<void> {
  await Promise.all(
    questionIds.map(id => updateDoc(doc(db, "questions", id), { usageCount: increment(1) }))
  );
}

// ── Ad-hoc Question Review Queue ──────────────────────────────────────────────

// Its only caller (AdminLayout's sidebar badge) only ever needs the pending
// count, so the query is scoped server-side to "pending" instead of
// streaming the whole (ever-growing) adhocQuestions collection for every
// admin, on every page, for the entire session.
export function subscribeToAdhocQuestions(
  callback: (questions: AdhocQuestion[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, "adhocQuestions"), where("status", "==", "pending")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdhocQuestion))),
    err => reportFirestoreListenerError("adhocQuestions", err)
  );
}

export async function createAdhocQuestion(
  data: Omit<AdhocQuestion, "id" | "status" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "adhocQuestions"), {
    ...data,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function approveAdhocQuestion(
  adhocId: string,
  questionData: Omit<Question, "id" | "status" | "usageCount" | "createdAt">
): Promise<string> {
  const questionId = await createQuestion(questionData);
  await updateDoc(doc(db, "adhocQuestions", adhocId), {
    status: "approved",
    promotedQuestionId: questionId,
    reviewedAt: new Date().toISOString(),
  });
  return questionId;
}

export async function rejectAdhocQuestion(adhocId: string, reviewedBy: string): Promise<void> {
  await updateDoc(doc(db, "adhocQuestions", adhocId), {
    status: "rejected",
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  });
}
