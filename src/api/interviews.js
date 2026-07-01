import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from "firebase/firestore";
import { createNotification } from "./notifications";

export const DEFAULT_ROUNDS = [
  "HR Round", "Technical Round 1", "Technical Round 2", "Final Round",
];

export const DEFAULT_FEEDBACK_QUESTIONS = [
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

export async function getAllInterviews() {
  const snap = await getDocs(query(collection(db, "interviews"), orderBy("scheduledDate", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getInterviewerInterviews(interviewerEmail) {
  const snap = await getDocs(query(
    collection(db, "interviews"),
    where("interviewerEmail", "==", interviewerEmail),
  ));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
}

export async function getInterview(id) {
  const snap = await getDoc(doc(db, "interviews", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createInterview(data) {
  const ref = await addDoc(collection(db, "interviews"), {
    ...data,
    status: "pending_acceptance",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateInterview(id, data) {
  await updateDoc(doc(db, "interviews", id), {
    ...data, updatedAt: new Date().toISOString(),
  });
}

export async function deleteInterview(id) {
  await deleteDoc(doc(db, "interviews", id));
}

export async function markCandidateAttendance(interviewId, joined) {
  const update = {
    candidateJoined: joined,
    attendanceMarkedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!joined) {
    update.status     = "no_show";
    update.nextNudgeAt = null;
  }
  await updateDoc(doc(db, "interviews", interviewId), update);
}

function parseInterviewStart(scheduledDate, scheduledTime) {
  if (!scheduledDate || !scheduledTime) return null;
  try {
    const match = scheduledTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const min = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return new Date(`${scheduledDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
  } catch { return null; }
}

export async function checkAndSendFeedbackNudges(interviewerId, interviewerEmail) {
  const now  = new Date();
  const hour = now.getHours();
  if (hour < 9 || hour >= 21) return; // only 9 AM – 9 PM

  const snap = await getDocs(
    query(collection(db, "interviews"), where("interviewerEmail", "==", interviewerEmail))
  );
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const iv of rows) {
    if (iv.status !== "scheduled") continue;
    if (iv.candidateJoined === false) continue;
    if (iv.feedback?.submittedAt)     continue;

    const start = parseInterviewStart(iv.scheduledDate, iv.scheduledTime);
    if (!start || start > now) continue;

    const cutoff = new Date(start.getTime() + 48 * 60 * 60 * 1000);
    if (now > cutoff) continue;

    if (iv.nextNudgeAt && new Date(iv.nextNudgeAt) > now) continue;

    await createNotification({
      type:           "feedback_reminder",
      recipientId:    interviewerId,
      recipientEmail: interviewerEmail,
      interviewId:    iv.id,
      candidateName:  iv.candidateName || "",
      message:        `Please submit your feedback for the interview with ${iv.candidateName || "the candidate"}.`,
      status:         "unread",
    });

    await updateDoc(doc(db, "interviews", iv.id), {
      nextNudgeAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      nudgeCount:  (iv.nudgeCount || 0) + 1,
      updatedAt:   now.toISOString(),
    });
  }
}

export async function saveFeedbackDraft(id, feedback) {
  await updateDoc(doc(db, "interviews", id), {
    feedback: { ...feedback, submittedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  });
}

export async function submitFeedback(id, feedback) {
  await updateDoc(doc(db, "interviews", id), {
    feedback: { ...feedback, submittedAt: new Date().toISOString() },
    status: "completed",
    updatedAt: new Date().toISOString(),
  });
}

export async function importCompletedInterview(data) {
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

export function subscribeToInterviews(callback) {
  const q = query(collection(db, "interviews"), orderBy("scheduledDate", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function subscribeToInterviewerInterviews(interviewerEmail, callback) {
  const q = query(
    collection(db, "interviews"),
    where("interviewerEmail", "==", interviewerEmail),
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
    callback(docs);
  });
}

export async function getCandidateAskedQuestions(candidateId, excludeInterviewId = null) {
  const snap = await getDocs(query(
    collection(db, "interviews"),
    where("candidateId", "==", candidateId)
  ));
  const questionIds = new Set();
  snap.docs.forEach(d => {
    if (excludeInterviewId && d.id === excludeInterviewId) return;
    (d.data().questionsAsked || []).forEach(q => {
      if (typeof q === "string") questionIds.add(q);
      else if (q?.questionId) questionIds.add(q.questionId);
    });
  });
  return questionIds;
}
