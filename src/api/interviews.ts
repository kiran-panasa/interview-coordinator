import { db, auth } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  query, where, orderBy, onSnapshot, writeBatch, setDoc,
} from "firebase/firestore";
import { parseInterviewStart } from "../utils/dates";
import { findBlockedDateFor } from "./blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import type { Interview, InterviewStatus, InterviewHistoryEntry } from "../types";

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
  if (rest.scheduledDate) {
    const blocked = await findBlockedDateFor(rest.scheduledDate);
    if (blocked) {
      throw new Error(`This date is blocked${blocked.reason ? `: ${blocked.reason}` : ""}. Please choose another date.`);
    }
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
  // Mirrors createInterview's blocked-date guard — previously only enforced
  // when scheduling a brand-new interview, so an edit could freely move an
  // existing interview onto an admin-blocked date.
  if (data.scheduledDate) {
    const blocked = await findBlockedDateFor(data.scheduledDate);
    if (blocked) {
      throw new Error(`This date is blocked${blocked.reason ? `: ${blocked.reason}` : ""}. Please choose another date.`);
    }
  }
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

async function pushToAcademyIfApplicable(interviewId: string) {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch("/api/push-academy-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ interviewId }),
    });
  } catch (err) {
    console.error("Failed to push completed interview to Academy Nexus:", err);
  }
}

// Shared choke point behind both markInterviewCompleted and
// markInterviewPartiallyCompleted below — every path that can complete an
// interview (feedback submission, the interviewer's Mark as
// Completed/Partially Completed buttons, admin feedback edits, CSV/Sheet
// import) must funnel through one of those two so aiReportPending and the
// Academy Nexus push never get forgotten on a new code path.
// aiReportPending is what the Apps Script sweep queries on instead of
// rescanning every completed interview — a partial completion still gets a
// recording/transcript/AI report generated where one exists.
async function completeInterview(
  id: string,
  status: "completed" | "partially_completed",
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    ...extraFields,
    status,
    aiReportPending: true,
    aiReportPendingSince: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  pushToAcademyIfApplicable(id);
}

export async function markInterviewCompleted(
  id: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  await completeInterview(id, "completed", extraFields);
}

// `reason` is mandatory at the call site (enforced in the UI, not here) —
// carried through to admin views and the Download Feedback export for
// payment reconciliation / audit purposes.
export async function markInterviewPartiallyCompleted(
  id: string,
  reason: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  await completeInterview(id, "partially_completed", { ...extraFields, partialCompletionReason: reason });
}

export async function submitFeedback(id: string, feedback: Record<string, unknown>): Promise<void> {
  await markInterviewCompleted(id, {
    feedback: { ...feedback, submittedAt: new Date().toISOString() },
  });
}

// One-time, self-guarding backfill so interviews completed BEFORE
// aiReportPending existed (see markInterviewCompleted above) still get
// picked up by the Apps Script sweep automatically, instead of only newly-
// completed interviews benefiting — matches what backfillAiReportPending_()
// in Code.gs does, but runs itself from the client so it doesn't depend on
// anyone manually running that Apps Script function.
//
// Guarded by a settings/aiReportBackfill marker doc so the (potentially
// large) status=="completed" query only ever runs once total, not once per
// admin session — re-running that query on every page load would reproduce
// the exact unbounded-read problem this whole aiReportPending mechanism was
// built to avoid. Only touches interviews that have literally never been
// considered (aiReportPendingSince still unset) — one that already tried
// and gave up (see GIVE_UP_AFTER_DAYS in Code.gs) is left alone rather than
// being re-queued forever.
export async function backfillAiReportPendingOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "aiReportBackfill");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const snap = await getDocs(query(collection(db, "interviews"), where("status", "==", "completed")));
  const now = new Date().toISOString();
  const targets = snap.docs.filter(d => {
    const data = d.data() as Interview;
    return !data.aiReport && data.aiReportPendingSince == null;
  });

  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach(d => {
      const data = d.data() as Interview;
      batch.update(d.ref, {
        aiReportPending: true,
        aiReportPendingSince: data.createdAt || now,
      });
    });
    await batch.commit();
  }

  await setDoc(markerRef, { completedAt: now, count: targets.length });
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
    // No recording/transcript link yet (imported rows can carry one already,
    // via meetingRecordingUrl in `data`) — let the sweep try to find one.
    aiReportPending: !data.meetingRecordingUrl,
    aiReportPendingSince: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export function subscribeToInterviews(callback: (interviews: Interview[]) => void): () => void {
  const q = query(collection(db, "interviews"), orderBy("scheduledDate", "desc"));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview))),
    err => reportFirestoreListenerError("interviews", err)
  );
}

// Live single-interview subscription — used by the Interviewer Portal's
// interview-detail page so an admin's edit (reschedule, panelist swap, etc.)
// shows up immediately instead of only on the next page load.
export function subscribeToInterview(id: string, callback: (interview: Interview | null) => void): () => void {
  return onSnapshot(
    doc(db, "interviews", id),
    snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } as Interview : null),
    err => reportFirestoreListenerError("interview", err)
  );
}

export function subscribeToInterviewerInterviews(
  interviewerEmail: string,
  callback: (interviews: Interview[]) => void
): () => void {
  const q = query(
    collection(db, "interviews"),
    where("interviewerEmail", "==", interviewerEmail),
  );
  return onSnapshot(
    q,
    snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview));
      docs.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
      callback(docs);
    },
    err => reportFirestoreListenerError("interviewerInterviews", err)
  );
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

export async function logInterviewHistory(
  interviewId: string,
  entry: Omit<InterviewHistoryEntry, "id" | "changedAt">
): Promise<void> {
  if (!entry.changes.length) return; // nothing actually changed — don't log a no-op entry
  await addDoc(collection(db, "interviews", interviewId, "history"), {
    ...entry,
    changedAt: new Date().toISOString(),
  });
}

export async function getInterviewHistory(interviewId: string): Promise<InterviewHistoryEntry[]> {
  const snap = await getDocs(query(
    collection(db, "interviews", interviewId, "history"),
    orderBy("changedAt", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InterviewHistoryEntry));
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
