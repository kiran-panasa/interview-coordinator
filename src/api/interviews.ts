import { db, auth } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  query, where, orderBy, onSnapshot, writeBatch, setDoc,
} from "firebase/firestore";
import { parseInterviewStart } from "../utils/dates";
import { findBlockedDateFor } from "./blockedDates";
import { reportFirestoreListenerError } from "../utils/firestoreSubscribe";
import { getTemplates } from "./templates";
import { getCandidates } from "./candidates";
import { getPrograms } from "./programs";
import { getInterviewIntegrity } from "./interviewIntegrity";
import { withIntegrityDomain, attachDescriptors } from "../utils/templateEngine";
import type { Interview, InterviewStatus, InterviewHistoryEntry, Candidate, Program } from "../types";

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

// Denormalizes the candidate's own external UserID (Candidate.uid, e.g.
// "STU-2024-001") onto the interview at creation time — same pattern as
// candidateName/candidateEmail already being snapshotted by callers, done
// centrally here so every creation path (direct scheduling, CSV/Sheet
// import) gets it consistently instead of relying on each call site to
// remember. A caller-supplied candidateUid (e.g. an import that already
// resolved the candidate) is left as-is, no extra read.
async function withCandidateUid<T extends { candidateId?: string; candidateUid?: string }>(
  data: T
): Promise<T> {
  if (data.candidateUid || !data.candidateId) return data;
  const candidateSnap = await getDoc(doc(db, "candidates", data.candidateId));
  const uid = candidateSnap.exists() ? (candidateSnap.data() as Candidate).uid : undefined;
  return uid ? { ...data, candidateUid: uid } : data;
}

// Denormalizes the template's own Program assignment (Template.program ->
// Program.id/name) onto the interview at creation time, same reasoning as
// withCandidateUid above — a direct-Firestore reader can then filter on an
// exact programName instead of guessing from the template's own display
// name, which isn't required to match its Program (see the "Frontend
// Development" / "Programming with Problem Solving (DSA)" case: both
// belong to the Academy program without being named "Academy ..."). A
// caller-supplied programId/programName is left as-is, no extra reads.
async function withProgramInfo<T extends {
  templateId?: string; programId?: string; programName?: string;
}>(data: T): Promise<T> {
  if (data.programId || data.programName || !data.templateId) return data;
  const templates = await getTemplates();
  const template = templates.find(t => t.id === data.templateId);
  if (!template?.program) return data;
  const programs = await getPrograms();
  const program = programs.find((p: Program) => p.id === template.program);
  return program ? { ...data, programId: program.id, programName: program.name } : { ...data, programId: template.program };
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
    ...(await withProgramInfo(await withCandidateUid(rest))),
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

// Cancelled = no interview conducted = no scoring. Clears every
// feedback/scoring/attendance/recording field along with flipping status,
// so a cancelled interview can never carry stale ratings, a verdict, an AI
// report, or a completion timestamp into admin views, exports, or payment
// reconciliation — regardless of what it held before being cancelled.
export async function markInterviewCancelled(id: string): Promise<void> {
  await updateDoc(doc(db, "interviews", id), {
    status: "cancelled",
    eventId: null,
    meetLink: "",
    feedback: deleteField(),
    feedbackDraft: deleteField(),
    aiReport: deleteField(),
    aiReportPending: false,
    aiReportPendingSince: deleteField(),
    meetingRecordingUrl: deleteField(),
    transcriptUrl: deleteField(),
    candidateJoined: deleteField(),
    attendanceMarkedAt: deleteField(),
    partialCompletionReason: deleteField(),
    updatedAt: new Date().toISOString(),
  });
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

// One-time, self-guarding cleanup for cancelled interviews that were
// carrying stale scoring data from BEFORE markInterviewCancelled existed
// (the old Cancel action only cleared eventId/meetLink, so an interview
// completed-and-scored and then later cancelled kept its feedback/aiReport/
// verdict). Same settings-marker-doc guard as backfillAiReportPendingOnce —
// runs the status=="cancelled" query exactly once total, not per session.
export async function clearCancelledInterviewScoringOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "cancelledScoringCleanup");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const snap = await getDocs(query(collection(db, "interviews"), where("status", "==", "cancelled")));
  const now = new Date().toISOString();
  const targets = snap.docs.filter(d => {
    const data = d.data() as Interview;
    return !!(data.feedback || data.aiReport || data.meetingRecordingUrl || data.transcriptUrl || data.candidateJoined != null);
  });

  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach(d => {
      batch.update(d.ref, {
        feedback: deleteField(),
        feedbackDraft: deleteField(),
        aiReport: deleteField(),
        aiReportPending: false,
        aiReportPendingSince: deleteField(),
        meetingRecordingUrl: deleteField(),
        transcriptUrl: deleteField(),
        candidateJoined: deleteField(),
        attendanceMarkedAt: deleteField(),
        partialCompletionReason: deleteField(),
        updatedAt: now,
      });
    });
    await batch.commit();
  }

  await setDoc(markerRef, { completedAt: now, count: targets.length });
}

// One-time, self-guarding backfill so interviews whose feedback was saved
// BEFORE materializeFeedback started baking descriptor text onto
// feedback.domains (see attachDescriptors in templateEngine.js) get it too.
// Needed because at least one downstream consumer (Academy Nexus) reads
// feedback.domains straight off Firestore via its own service account,
// bypassing our API entirely — descriptors have to live on the document
// itself for every interview, not just ones submitted after this shipped.
// Same settings-marker-doc guard as the backfills above — runs its
// (potentially large) completed/partially_completed query exactly once
// total, not once per admin session. Only rewrites feedback.domains (via
// attachDescriptors, which is purely additive) — leaves every other
// feedback field, and any interview whose template can no longer be found
// (deleted/renamed since), untouched.
export async function backfillFeedbackDescriptorsOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "feedbackDescriptorsBackfill");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const [templates, integrity] = await Promise.all([getTemplates(), getInterviewIntegrity()]);
  const templateById = new Map(
    templates.map(t => [t.id, withIntegrityDomain(t, integrity.domainFields)])
  );

  const snap = await getDocs(
    query(collection(db, "interviews"), where("status", "in", ["completed", "partially_completed"]))
  );
  const targets = snap.docs.filter(d => !!(d.data() as Interview).feedback?.domains);

  let updated = 0;
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    let batchHasWrites = false;

    for (const d of targets.slice(i, i + 450)) {
      const data = d.data() as Interview;
      const template = templateById.get(data.templateId || "");
      if (!template) continue;

      const domains = data.feedback!.domains!;
      const merged = { ...domains };
      let changed = false;
      for (const domain of template.domains) {
        const domainData = domains[domain.id];
        if (!domainData) continue;
        const withDescriptors = attachDescriptors(domainData, domain);
        if (withDescriptors !== domainData) {
          merged[domain.id] = withDescriptors;
          changed = true;
        }
      }
      if (!changed) continue;

      batch.update(d.ref, { "feedback.domains": merged });
      batchHasWrites = true;
      updated++;
    }

    if (batchHasWrites) await batch.commit();
  }

  await setDoc(markerRef, { completedAt: new Date().toISOString(), count: updated });
}

// One-time, self-guarding backfill so interviews created BEFORE
// withCandidateUid (above) started snapshotting Candidate.uid onto the
// interview doc get it too — same reasoning as
// backfillFeedbackDescriptorsOnce just above: Academy Nexus reads
// interview docs straight off Firestore via its own service account, so a
// field only present on newly-created interviews never reaches historical
// ones on its own. Same settings-marker-doc guard, runs once total.
export async function backfillCandidateUidOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "candidateUidBackfill");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const candidates = await getCandidates();
  const uidByCandidateId = new Map<string, string>(
    candidates.filter(c => !!c.uid).map(c => [c.id, c.uid as string])
  );

  const snap = await getDocs(collection(db, "interviews"));
  const targets = snap.docs.filter(d => {
    const data = d.data() as Interview;
    return !data.candidateUid && !!data.candidateId && uidByCandidateId.has(data.candidateId);
  });

  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of targets.slice(i, i + 450)) {
      const data = d.data() as Interview;
      batch.update(d.ref, { candidateUid: uidByCandidateId.get(data.candidateId) });
    }
    await batch.commit();
  }

  await setDoc(markerRef, { completedAt: new Date().toISOString(), count: targets.length });
}

// One-time, self-guarding backfill so interviews created BEFORE
// withProgramInfo (above) started snapshotting the template's Program
// assignment onto the interview doc get it too — same reasoning as the two
// backfills above. Same settings-marker-doc guard, runs once total.
export async function backfillProgramInfoOnce(): Promise<void> {
  const markerRef = doc(db, "settings", "programInfoBackfill");
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists()) return;

  const [templates, programs] = await Promise.all([getTemplates(), getPrograms()]);
  const programById = new Map(programs.map(p => [p.id, p]));
  const programByTemplateId = new Map(
    templates
      .filter(t => t.program && programById.has(t.program))
      .map(t => [t.id, programById.get(t.program as string) as Program])
  );

  const snap = await getDocs(collection(db, "interviews"));
  const targets = snap.docs.filter(d => {
    const data = d.data() as Interview;
    return !data.programId && !!data.templateId && programByTemplateId.has(data.templateId);
  });

  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of targets.slice(i, i + 450)) {
      const data = d.data() as Interview;
      const program = programByTemplateId.get(data.templateId as string) as Program;
      batch.update(d.ref, { programId: program.id, programName: program.name });
    }
    await batch.commit();
  }

  await setDoc(markerRef, { completedAt: new Date().toISOString(), count: targets.length });
}

export async function importScheduledInterview(
  data: Omit<Interview, "id" | "status" | "feedback" | "candidateJoined" | "attendanceMarkedAt" | "questionsAsked" | "questionRemarks" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "interviews"), {
    ...(await withProgramInfo(await withCandidateUid(data))),
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
    ...(await withProgramInfo(await withCandidateUid(data))),
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

// Scoped to [dateFrom, dateTo] (inclusive, "YYYY-MM-DD") — the admin
// Interviews page's default live subscription, so it only ever reads the
// selected date window instead of the whole collection. scheduledDate is a
// plain string field, so a range query on it needs no composite index (a
// single inequality/orderBy on the SAME field is covered by the automatic
// single-field index). Callers needing full history for something specific
// (e.g. CSV-import duplicate detection) should use a one-off getAllInterviews()
// call instead of widening this subscription.
export function subscribeToInterviewsInDateRange(
  dateFrom: string,
  dateTo: string,
  callback: (interviews: Interview[]) => void
): () => void {
  const q = query(
    collection(db, "interviews"),
    where("scheduledDate", ">=", dateFrom),
    where("scheduledDate", "<=", dateTo),
    orderBy("scheduledDate", "desc")
  );
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
