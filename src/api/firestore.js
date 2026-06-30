import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction, increment, arrayUnion, arrayRemove,
} from "firebase/firestore";

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createUserProfile(uid, data) {
  const existing = await getDoc(doc(db, "users", uid));
  if (existing.exists()) return;
  await setDoc(doc(db, "users", uid), data);
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToUsers(callback) {
  return onSnapshot(collection(db, "users"), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export function subscribeToInvites(callback) {
  return onSnapshot(
    query(collection(db, "invites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function updateUser(id, data) {
  await updateDoc(doc(db, "users", id), data);
}

export async function deleteUser(id) {
  await deleteDoc(doc(db, "users", id));
}

// ── Candidates ────────────────────────────────────────────────────────────────

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

// ── Interviews ────────────────────────────────────────────────────────────────

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
    update.status    = "no_show";
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
    if (iv.candidateJoined === false) continue;       // no-show — stop
    if (iv.feedback?.submittedAt)     continue;       // feedback done — stop

    const start = parseInterviewStart(iv.scheduledDate, iv.scheduledTime);
    if (!start || start > now) continue;              // hasn't started yet

    const cutoff = new Date(start.getTime() + 48 * 60 * 60 * 1000);
    if (now > cutoff) continue;                       // past 48-hour window

    if (iv.nextNudgeAt && new Date(iv.nextNudgeAt) > now) continue; // not yet due

    await createNotification({
      type:          "feedback_reminder",
      recipientId:   interviewerId,
      recipientEmail: interviewerEmail,
      interviewId:   iv.id,
      candidateName: iv.candidateName || "",
      message:       `Please submit your feedback for the interview with ${iv.candidateName || "the candidate"}.`,
      status:        "unread",
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

// ── Availability ──────────────────────────────────────────────────────────────

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

// ── Real-time subscriptions ───────────────────────────────────────────────────

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

// ── Config ────────────────────────────────────────────────────────────────────

export const DEFAULT_ROUNDS = [
  "HR Round", "Technical Round 1", "Technical Round 2", "Final Round",
];

export const DEFAULT_FEEDBACK_QUESTIONS = [
  { id: "technical",      label: "Technical Skills",           type: "rating" },
  { id: "communication",  label: "Communication Skills",       type: "rating" },
  { id: "problem_solving",label: "Problem Solving Ability",    type: "rating" },
  { id: "attitude",       label: "Attitude & Professionalism", type: "rating" },
  { id: "strengths",      label: "Key Strengths",              type: "text"   },
  { id: "improvements",   label: "Areas for Improvement",      type: "text"   },
  {
    id: "recommendation", label: "Overall Recommendation", type: "select",
    options: ["Strongly Recommend", "Recommend", "Neutral", "Not Recommend"],
  },
];

// ── Interview Templates ───────────────────────────────────────────────────────

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

// ── Programs ──────────────────────────────────────────────────────────────────

export function subscribeToPrograms(callback) {
  return onSnapshot(
    query(collection(db, "programs"), orderBy("order", "asc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createProgram(name, order) {
  const ref = await addDoc(collection(db, "programs"), {
    name, order, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateProgram(id, data) {
  await updateDoc(doc(db, "programs", id), data);
}

export async function deleteProgram(id) {
  await deleteDoc(doc(db, "programs", id));
}

// ── Skills ────────────────────────────────────────────────────────────────────

export async function getSkills() {
  const snap = await getDocs(query(collection(db, "skills"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToSkills(callback) {
  return onSnapshot(
    query(collection(db, "skills"), orderBy("name")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createSkill(name) {
  const ref = await addDoc(collection(db, "skills"), { name: name.trim(), createdAt: new Date().toISOString() });
  return ref.id;
}

export async function updateSkill(id, name) {
  await updateDoc(doc(db, "skills", id), { name: name.trim() });
}

export async function deleteSkill(id) {
  await deleteDoc(doc(db, "skills", id));
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function subscribeToUserNotifications(userId, callback) {
  return onSnapshot(
    query(collection(db, "notifications"), where("recipientId", "==", userId)),
    snap => callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    )
  );
}

export async function createNotification(data) {
  const ref = await addDoc(collection(db, "notifications"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateNotification(id, data) {
  await updateDoc(doc(db, "notifications", id), data);
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function createInvite(data) {
  const ref = await addDoc(collection(db, "invites"), {
    ...data,
    email: data.email.toLowerCase().trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getInvites() {
  const snap = await getDocs(query(collection(db, "invites"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateInvite(id, data) {
  await updateDoc(doc(db, "invites", id), data);
}

export async function deleteInvite(id) {
  await deleteDoc(doc(db, "invites", id));
}

export async function getInviteByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
    where("status", "==", "pending"),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getAnyInviteByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase().trim()),
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Rating label descriptors ──────────────────────────────────────────────────

export const CODING_PS_LABELS = {
  1: "Minimal progress, could not reach even a basic working approach",
  2: "Partial basic solution only, needed multiple hints to get there",
  3: "Solved with a working but non-optimal approach, understood the logic",
  4: "Solved with 1 minor nudge, reached optimal approach with good reasoning",
  5: "Solved independently with the most efficient solution, explained clearly",
};

export const CODING_CI_LABELS = {
  1: "Could not write any meaningful code",
  2: "Partial basic solution only, needed multiple hints to get there",
  3: "Solved with a working but non-optimal approach, understood the logic",
  4: "Solved with 1 minor nudge, reached optimal approach with good reasoning",
  5: "Clean, optimal, well-structured implementation with clear explanation",
};

export const THEORY_LABELS = {
  1: "Incorrect or could not answer",
  2: "Partial answer, follow-ups frequently exposed gaps in understanding",
  3: "Correct but textbook answer, struggled when follow-ups pushed deeper",
  4: "Good understanding with solid follow-up answers",
  5: "Excellent depth, handled all follow-ups confidently",
};

export const PROJECT_LABELS = {
  1: "No meaningful understanding of the project",
  2: "Thin understanding, likely limited hands-on involvement",
  3: "Understands the project broadly, vague on specific decisions or challenges",
  4: "Good understanding, can explain most decisions and challenges",
  5: "Deep understanding, articulated all decisions and trade-offs clearly",
};

export const RESUME_LABELS = {
  1: "No relevant skills or experience demonstrated",
  2: "Familiar — surface-level knowledge only",
  3: "Knows the surface, basic understanding demonstrated",
  4: "Solid skills demonstrated with good examples",
  5: "Strong, well-rounded profile with clear evidence of depth",
};

export const VERDICT_OPTIONS = ["Shortlisted", "Average - Retake Interview", "Rejected"];

// ── Programs (one-shot fetch) ─────────────────────────────────────────────────

export async function getPrograms() {
  const snap = await getDocs(query(collection(db, "programs"), orderBy("order", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Schedule Invites ──────────────────────────────────────────────────────────

export function subscribeToScheduleInvites(callback) {
  return onSnapshot(
    query(collection(db, "scheduleInvites"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createScheduleInvite(data) {
  const ref = await addDoc(collection(db, "scheduleInvites"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateScheduleInvite(id, data) {
  await updateDoc(doc(db, "scheduleInvites", id), {
    ...data, updatedAt: new Date().toISOString(),
  });
}

export async function deleteScheduleInvite(id) {
  await deleteDoc(doc(db, "scheduleInvites", id));
}

export async function getScheduleInviteByToken(token) {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("inviteToken", "==", token)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getScheduleInvitesByEmail(email) {
  const snap = await getDocs(query(
    collection(db, "scheduleInvites"),
    where("candidateEmail", "==", email.toLowerCase()),
    orderBy("createdAt", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── OTP Verifications ─────────────────────────────────────────────────────────

export async function createOtpVerification(data) {
  // Invalidate any previous unused OTPs for this invite
  const old = await getDocs(query(
    collection(db, "otpVerifications"),
    where("inviteToken", "==", data.inviteToken),
    where("used", "==", false)
  ));
  for (const d of old.docs) await updateDoc(d.ref, { used: true });

  const ref = await addDoc(collection(db, "otpVerifications"), {
    ...data, createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getLatestOtpByToken(inviteToken) {
  const snap = await getDocs(query(
    collection(db, "otpVerifications"),
    where("inviteToken", "==", inviteToken),
    where("used", "==", false)
  ));
  if (snap.empty) return null;
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return docs[0];
}

export async function markOtpUsed(id) {
  await updateDoc(doc(db, "otpVerifications", id), { used: true });
}

// ── Available slots for a template + date range ───────────────────────────────

export async function getAvailableSlotsForTemplate(templateId, dateStart, dateEnd) {
  const usersSnap = await getDocs(collection(db, "users"));
  const interviewers = usersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u =>
      (u.role === "interviewer" || u.role === "interviewer_content") &&
      u.status === "active" &&
      (u.templateIds || []).includes(templateId)
    );

  const result = [];
  for (const ivr of interviewers) {
    const slotsSnap = await getDocs(query(
      collection(db, "availability", ivr.id, "slots"),
      where("date", ">=", dateStart),
      where("date", "<=", dateEnd)
    ));
    slotsSnap.docs.forEach(d => {
      const slot = d.data();
      if (!slot.isBooked) {
        result.push({
          slotId:          d.id,
          interviewerId:   ivr.id,
          interviewerName: ivr.displayName || ivr.email,
          interviewerEmail: ivr.email,
          date: slot.date,
          time: slot.time,
        });
      }
    });
  }
  result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return result;
}

// ── Question Bank ─────────────────────────────────────────────────────────────

export async function getQuestions(filters = {}) {
  let q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filters.domainType) docs = docs.filter(d => d.domainType === filters.domainType);
  if (filters.difficulty)  docs = docs.filter(d => d.difficulty  === filters.difficulty);
  if (filters.skill)       docs = docs.filter(d => (d.skills || []).includes(filters.skill));
  if (filters.status)      docs = docs.filter(d => d.status === filters.status);
  else                     docs = docs.filter(d => d.status !== "archived");
  return docs;
}

export async function getQuestionsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const results = await Promise.all(chunks.map(chunk =>
    getDocs(query(collection(db, "questions"), where("__name__", "in", chunk)))
  ));
  return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

export async function createQuestion(data) {
  const ref = await addDoc(collection(db, "questions"), {
    ...data,
    status: "active",
    usageCount: 0,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateQuestion(id, data) {
  await updateDoc(doc(db, "questions", id), { ...data, updatedAt: new Date().toISOString() });
}

export async function archiveQuestion(id) {
  await updateDoc(doc(db, "questions", id), { status: "archived", updatedAt: new Date().toISOString() });
}

export function subscribeToQuestions(callback) {
  return onSnapshot(
    query(collection(db, "questions"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
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

export async function incrementQuestionUsage(questionIds) {
  await Promise.all(
    questionIds.map(id => updateDoc(doc(db, "questions", id), { usageCount: increment(1) }))
  );
}

// ── Ad-hoc Question Review Queue ──────────────────────────────────────────────

export function subscribeToAdhocQuestions(callback) {
  return onSnapshot(
    query(collection(db, "adhocQuestions"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createAdhocQuestion(data) {
  const ref = await addDoc(collection(db, "adhocQuestions"), {
    ...data,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function approveAdhocQuestion(adhocId, questionData) {
  const questionId = await createQuestion(questionData);
  await updateDoc(doc(db, "adhocQuestions", adhocId), {
    status: "approved",
    promotedQuestionId: questionId,
    reviewedAt: new Date().toISOString(),
  });
  return questionId;
}

export async function rejectAdhocQuestion(adhocId, reviewedBy) {
  await updateDoc(doc(db, "adhocQuestions", adhocId), {
    status: "rejected",
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  });
}

// ── Book slot atomically (Firestore transaction) ──────────────────────────────

export async function bookSlotForCandidate(interviewerId, slotId, inviteId, bookedDate, bookedTime) {
  const slotRef   = doc(db, "availability", interviewerId, "slots", slotId);
  const inviteRef = doc(db, "scheduleInvites", inviteId);

  await runTransaction(db, async (txn) => {
    const slotDoc = await txn.get(slotRef);
    if (!slotDoc.exists()) throw new Error("Slot no longer exists.");
    if (slotDoc.data().isBooked) throw new Error("This slot was just taken — please choose another.");

    txn.update(slotRef,   { isBooked: true, inviteId, bookedAt: new Date().toISOString() });
    txn.update(inviteRef, {
      status:              "pending_confirmation",
      bookedSlotId:        slotId,
      bookedInterviewerId: interviewerId,
      bookedDate,
      bookedTime,
      bookedAt:            new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
    });
  });
}
