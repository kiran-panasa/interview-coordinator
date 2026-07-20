import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  query, where, orderBy, onSnapshot,
} from "firebase/firestore";
import { parseInterviewStart } from "../utils/dates";
import type { Interview, InterviewStatus } from "../types";

export const DEFAULT_ROUNDS = [
  "HR Round", "Technical Round 1", "Technical Round 2", "Final Round",
];

interface FeedbackQuestion {
  id: string;
  label: string;
  type: "rating" | "text" | "select";
  options?: string[];
}

export const DEFAULT_FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { id: "technical",       label: "Technical Skills",           type: "rating" },
  { id: "communication",   label: "Communication Skills",       type: "rating" },
  { id: "problem_solving", label: "Problem Solving Ability",    type: "rating" },
  { id: "attitude",        label: "Attitude & Professionalism", type: "rating" },
  { id: "strengths",       label: "Key Strengths",              type: "text"   },
  { id: "improvements",    label: "Areas for Improvement",      type: "text"   },
  {
    id: "recommendation", label: "Overall Recommendation", type: "select",
    options: ["Strongly Recommend", "Recommend", "Neutral", "Not Recommend"],
  },
];

export async function getAllInterviews(): Promise<Interview[]> {
  const snap = await getDocs(query(collection(db, "interviews"), orderBy("scheduledDate", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview));
}

export async function getInterviewerInterviews(interviewerEmail: string): Promise<Interview[]> {
  const snap = await getDocs(query(
    collection(db, "interviews"),
    where("interviewerEmail", "==", interviewerEmail),
  ));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview));
  return docs.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
}

export async function getInterview(id: string): Promise<Interview | null> {
  const snap = await getDoc(doc(db, "interviews", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Interview : null;
}

export async function createInterview(
  data: Omit<Interview, "id" | "status" | "createdAt"> & { status?: InterviewStatus }
): Promise<string> {
  const { status, ...rest } = data;
  // Enforced here too (not just in the UI) since this is the function every
  // scheduling path funnels through — direct admin scheduling and the
  // candidate-confirm-booking flow.
  const start = parseInterviewStart(rest.scheduledDate, rest.scheduledTime);
  if (start && start < new Date()) {
    throw new Error("Cannot schedule an interview in the past — please pick a future date and time.");
  }
  const ref = await addDoc(collection(db, "interviews"), {
    ...rest,
    status: status || "pending_acceptance",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateInterview(
  id: string,
  data: Partial<Omit<Interview, "id">>
): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    ...data, updatedAt: new Date().toISOString(),
  });
}

export async function deleteInterview(id: string): Promise<void> {
  await deleteDoc(doc(db, "interviews", id));
}

export async function markCandidateAttendance(
  interviewId: string,
  joined: boolean
): Promise<void> {
  const update: Record<string, unknown> = {
    candidateJoined: joined,
    attendanceMarkedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!joined) {
    update.status      = "no_show";
    update.nextNudgeAt = null;
  }
  await updateDoc(doc(db, "interviews", interviewId), update);
}

export async function saveFeedbackDraft(id: string, feedback: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    feedback: { ...feedback, submittedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  });
}

// Autosaved, unvalidated in-progress evaluation input — distinct from `feedback`,
// which only ever holds a validated, explicitly-submitted evaluation.
export async function saveFeedbackAutoDraft(id: string, draftData: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    feedbackDraft: { ...draftData, savedAt: new Date().toISOString() },
  });
}

export async function clearFeedbackAutoDraft(id: string): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    feedbackDraft: deleteField(),
  });
}

export async function submitFeedback(id: string, feedback: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    feedback: { ...feedback, submittedAt: new Date().toISOString() },
    status: "completed",
    updatedAt: new Date().toISOString(),
  });
}

export async function importScheduledInterview(
  data: Omit<Interview, "id" | "status" | "feedback" | "candidateJoined" | "attendanceMarkedAt" | "questionsAsked" | "questionRemarks" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "interviews"), {
    ...data,
    status: "pending_acceptance",
    candidateJoined: false,
    questionsAsked: [],
    questionRemarks: {},
    importedFromSheet: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function importCompletedInterview(
  data: Omit<Interview, "id" | "status" | "candidateJoined" | "attendanceMarkedAt" | "questionsAsked" | "questionRemarks" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "interviews"), {
    ...data,
    status: "completed",
    candidateJoined: true,
    attendanceMarkedAt: new Date().toISOString(),
    questionsAsked: [],
    questionRemarks: {},
    importedFromSheet: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export function subscribeToInterviews(callback: (interviews: Interview[]) => void): () => void {
  const q = query(collection(db, "interviews"), orderBy("scheduledDate", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview))));
}

export function subscribeToInterviewerInterviews(
  interviewerEmail: string,
  callback: (interviews: Interview[]) => void
): () => void {
  const q = query(
    collection(db, "interviews"),
    where("interviewerEmail", "==", interviewerEmail),
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview));
    docs.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
    callback(docs);
  });
}

export async function archiveInterview(id: string): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    archived: true,
    archivedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function unarchiveInterview(id: string): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    archived: false,
    archivedAt: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function getCandidateAskedQuestions(
  candidateId: string,
  excludeInterviewId: string | null = null
): Promise<Set<string>> {
  const snap = await getDocs(query(
    collection(db, "interviews"),
    where("candidateId", "==", candidateId)
  ));
  const questionIds = new Set<string>();
  snap.docs.forEach(d => {
    if (excludeInterviewId && d.id === excludeInterviewId) return;
    (d.data().questionsAsked as (string | { questionId: string })[] || []).forEach(q => {
      if (typeof q === "string") questionIds.add(q);
      else if (q?.questionId) questionIds.add(q.questionId);
    });
  });
  return questionIds;
}
