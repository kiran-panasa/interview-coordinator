// ── Users & Auth ──────────────────────────────────────────────────────────────

// "vendor" is a standalone role for someone with no other access at all —
// e.g. a vendor-side point of contact who isn't also an admin/interviewer.
// An EXISTING admin/interviewer instead gets Vendor Dashboard access
// additively via vendorContactFor below, without their own role ever
// changing — see ROLE.VENDOR in constants/roles.js.
export type UserRole = "admin" | "interviewer" | "interviewer_content" | "content_team" | "vendor";
export type UserStatus = "active" | "inactive" | "pending";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  templateIds?: string[];
  skills?: string[];
  phone?: string;
  // Which outsourcing vendor this interviewer belongs to (see api/vendors.ts)
  // — admin-managed grouping used to filter/report Interviews and
  // Interviewer Stats by vendor. Absent for in-house interviewers and for
  // any non-interviewer account. Does NOT by itself grant Vendor Dashboard
  // access — that's vendorContactFor below, a separate concept (an
  // interviewer can belong to a vendor without being that vendor's contact,
  // and a vendor's contact doesn't have to also be one of its interviewers).
  vendorId?: string | null;
  // Set when this person is a designated point of contact for a vendor —
  // grants access to the Vendor Dashboard (/vendor/dashboard), scoped to
  // that one vendor's interviewers/interviews/slots. Additive: an admin or
  // interviewer with this set keeps their normal role's access too, they
  // just also get a Vendor Dashboard link in their nav. A brand-new person
  // with role "vendor" and no other role has ONLY this access.
  vendorContactFor?: string | null;
  createdAt?: string;
}

// An outsourcing vendor an interviewer can be grouped under (Settings →
// General → Vendors) — purely a label for filtering/reporting; membership
// (User.vendorId) grants no access of its own. A vendor CAN have a login
// via a designated contact (User.vendorContactFor), which is a separate,
// admin-assigned concept from membership — see User above.
export interface Vendor {
  id: string;
  name: string;
  createdAt: string;
}

// ── Student Queries ───────────────────────────────────────────────────────────
// Support queries a candidate raises from the Student Dashboard ("AI report
// not generated", "panelist didn't join the call", "slot doubt", or
// anything else) — written/replied-to on the student side via the SSO
// session-authenticated backend (api/sso-handler.js's queries/create and
// queries/reply, never a direct client Firestore write from an anonymous
// session), and read/replied-to on the admin side via plain Firestore
// (src/api/studentQueries.ts, src/pages/admin/QueriesPage.jsx).
export type QueryCategory = "ai_report" | "panelist_no_show" | "slot_doubt" | "other";
export type QueryStatus = "open" | "replied" | "closed";

export interface QueryMessage {
  from: "student" | "admin";
  text: string;
  at: string;
  byName?: string; // set on admin messages — who replied
}

export interface StudentQuery {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateUid?: string;
  category: QueryCategory;
  interviewId?: string | null;
  status: QueryStatus;
  messages: QueryMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role: UserRole;
  // Only meaningful when role === "vendor" — which vendor this brand-new
  // account is the contact for, carried over onto the new User doc's own
  // vendorContactFor on signup (see AuthContext.jsx's invite-consuming
  // loadProfile). Irrelevant for every other role.
  vendorId?: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

// ── Candidates ────────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  uid?: string;
  program?: string;
  templateIds?: string[];
  resumeLink?: string;
  notes?: string;
  source?: string; // e.g. "ioe-portal" — set when materialized from an InboundRequest
  status?: string;
  // Set to "pending_nudge" when a candidate is moved from Inbound, so they
  // surface in Nudge's "Pending Nudge" tab distinct from the full candidate
  // list; flipped to "nudged" the moment the first invite is actually sent.
  // Absent entirely for candidates added any other way (manual/CSV) — they
  // only ever appear in the regular Candidates tab.
  nudgeStatus?: "pending_nudge" | "nudged";
  archived?: boolean;
  archivedAt?: string | null;
  // Per-candidate exceptions to a template's own attempt cap (Candidates →
  // kebab → "Manage Attempts") — map of templateId -> override. No entry
  // means "use the template's own maxAttempts"; 0 means unlimited for just
  // this candidate; a positive integer replaces the template's cap with
  // this candidate's own. See effectiveMaxAttempts in api/sso-handler.js.
  attemptOverrides?: Record<string, number>;
  createdAt: string;
  createdBy?: string;
}

// ── Inbound requests (e.g. from IOE Admin Portal) ───────────────────────────────

export type InboundRequestStatus = "pending" | "moved_to_nudge" | "dismissed";

export interface InboundRequest {
  id: string;
  uid: string;
  candidateName: string;
  candidateEmail: string;
  phase: string;
  batch: string;
  week: string;
  requestedDate: string; // "YYYY-MM-DD"
  status: InboundRequestStatus;
  requestedAt: string;
  requestedBy: string;
  source: string; // e.g. "ioe-portal" — see src/utils/inboundProgramMapping.js
  program?: string; // explicit Program id/name, if the source system ever sends one directly
  notifiedAt?: string | null;
  candidateId?: string | null;
  movedAt?: string | null;
  movedBy?: string;
}

// ── Skills & Programs ─────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  createdAt?: string;
}

// Admin-managed round names offered wherever a round is picked (Schedule
// Interview, Nudge → Candidates, a Program's default round) — replaces the
// old hardcoded DEFAULT_ROUNDS / NUDGE_ROUND_OPTIONS constant lists so a
// name saved once (or typed as "Other…" and used) shows up everywhere,
// with no per-page rework needed to keep multiple lists in sync.
export interface Round {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Program {
  id: string;
  name: string;
  order: number;
  // Auto-filled into Nudge's Template/Round fields when this Program is
  // selected as the filter — still overridable per campaign. Solves having
  // to manually pick a template every time (see src/features/settings/GeneralTab.jsx).
  defaultTemplateId?: string;
  defaultRound?: string;
  createdAt?: string;
}

export interface BlockedDate {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD — same as startDate for a single blocked day
  reason: string;
  createdBy?: string;
  createdAt?: string;
}

export interface NudgeReminderSettings {
  reminder1DelayDays: number;
  reminder2DelayDays: number;
  sendTime: string; // "HH:mm", 24-hour, Asia/Kolkata
  updatedAt?: string;
  updatedBy?: string;
}

// Self-book/reschedule booking window — same-day booking is never allowed
// (enforced unconditionally, not configurable); cutoffTime decides whether
// tomorrow is still bookable (before it) or closed (at/after it), pushing
// the earliest bookable day to the day after instead. See
// src/utils/selfBookWindow.js (computeSelfBookWindow) for the actual
// date math, shared between client and api/sso-handler.js.
export interface SelfBookCutoffSettings {
  cutoffTime: string; // "HH:mm", 24-hour, Asia/Kolkata
  updatedAt?: string;
  updatedBy?: string;
}

export interface InviteHistoryEntry {
  id: string;
  status: string;
  at: string;
  note?: string;
}

// One entry per admin edit to an already-scheduled Interview — logged to
// interviews/{id}/history. `changes` covers every field touched by that
// single save action (a reschedule that also swaps the panelist is one
// entry with two changes, not two entries).
export interface InterviewFieldChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

export interface InterviewHistoryEntry {
  id: string;
  changes: InterviewFieldChange[];
  changedBy: string;
  changedByName: string;
  changedAt: string;
  calendarSyncStatus: "synced" | "failed" | "not_applicable";
  calendarSyncError?: string;
  notificationStatus: "sent" | "failed" | "not_applicable";
}

export interface PreInterviewResourceLink {
  id: string;
  label: string;
  url: string;
  type: "instruction" | "reference";
}

export interface PreInterviewResourcesSettings {
  videoGuideLabel?: string;
  videoGuideUrl?: string;
  documents: PreInterviewResourceLink[];
  updatedAt?: string;
  updatedBy?: string;
}

// ── Templates ─────────────────────────────────────────────────────────────────

// "multi_dropdown" is a checkbox-list variant of "dropdown" — same raw
// string[] `options` shape, but the stored/submitted value is a string[]
// (the picked options) instead of a single string.
export type FieldType = "text" | "scored_dropdown" | "dropdown" | "multi_dropdown" | "number" | "boolean";

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  required?: boolean;
  weight?: number; // scored_dropdown only — % of 100 for card fields, relative points for domain-level checklists
  placeholder?: string;
}

export type DomainType = "theory" | "coding" | "project" | "resume" | "overall_feedback" | "integrity";

export interface Domain {
  id: string;
  label: string;
  type: DomainType | string;
  enabled?: boolean;
  order?: number;
  domainFields?: Field[];
  cardFields?: Field[];
  weightInVerdict?: number; // % share of the Final Interview Verdict; 0 = excluded (e.g. Interview Integrity)
  defaultCardCount?: number;
}

export interface QuestionBank {
  theory?: string[];
  coding?: string[];
  project?: string[];
  resume?: string[];
}

export interface Template {
  id: string;
  name: string;
  // Lifecycle — controls student-facing visibility only. "active" (or
  // unset, for every template that existed before this field did) is
  // bookable and shows in a candidate's Eligible Interviews / Self Book
  // list; "draft" and "archived" both hide it from students (see me() and
  // resolveSelfBookTarget in api/sso-handler.js) without touching any
  // interview already scheduled/completed on it, or admin-side visibility
  // (Templates page, Nudge, Interviews) — none of that reads this field.
  // "draft" vs "archived" is purely organizational for admins (still being
  // built vs retired); both behave identically to students.
  status?: "active" | "draft" | "archived";
  // Attempt cap (Templates → Lifecycle) — null/unset means unlimited. Only
  // a COMPLETED interview counts toward it (same rule as the attempt-number
  // badges elsewhere; a cancelled/declined retry doesn't burn an attempt).
  // Once reached, the template stops accepting new Self Book bookings
  // (resolveSelfBookTarget in api/sso-handler.js) but existing interviews
  // are untouched. attemptLimitMessage is shown to the candidate in place
  // of the normal "Find Slots" card; falls back to
  // DEFAULT_ATTEMPT_LIMIT_MESSAGE (src/constants/templateAttempts.js) when
  // blank.
  maxAttempts?: number | null;
  attemptLimitMessage?: string;
  // Whether a completed interview on this template shows its AI Report and
  // its Final Score to the candidate (Templates → Lifecycle) — independent
  // toggles, so a template can hide one without the other (e.g. show the
  // score but keep the AI report back). Unset/true means visible on both —
  // the default, and what every template behaved like before this existed.
  // hiddenScoreMessage is shown in place of whichever is hidden (same note
  // for both, shown once even if both are off) — falls back to
  // DEFAULT_HIDDEN_SCORE_MESSAGE (src/constants/templateAttempts.js) when
  // blank. Never affects the Integrity Score, which is a separate,
  // always-visible feature. See me() in api/sso-handler.js.
  showAiReportToStudent?: boolean;
  showFinalScoreToStudent?: boolean;
  hiddenScoreMessage?: string;
  program?: string;
  domains: Domain[];
  skills?: string[];
  // Hand-picked eligible-interviewer list (Settings → Skill Mapping) —
  // mutually exclusive with `skills` above (picking one clears the other).
  // When set, Self Book restricts to exactly these interviewers instead of
  // skill-matching; see resolveSelfBookTarget in api/sso-handler.js.
  interviewerIds?: string[];
  // Default interview length for this template, in minutes — pre-fills the
  // Duration field wherever an invite/interview is created on this template
  // (still overridable per-booking). Absent on templates created before
  // this existed; every read site falls back to 60.
  durationMinutes?: number;
  questionBank?: QuestionBank;
  questionIds?: string[];
  // Link to this template's Interview Guidelines / Format doc (e.g. a Google
  // Drive link) — shown to the interviewer above Questions Asked on the
  // interview they're running. Always read live from the template at render
  // time (never snapshotted onto the interview), so editing/removing it here
  // applies immediately to every interview already scheduled on this template.
  guidelinesDocUrl?: string;
  guidelinesDocLabel?: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Questions ─────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  text: string;
  suggestedAnswer?: string;
  domainType: DomainType[];
  difficulty?: Difficulty;
  topic?: string;
  skills?: string[];
  templateIds?: string[];
  status: "active" | "archived";
  usageCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AdhocQuestion {
  id: string;
  text: string;
  suggestedAnswer?: string;
  domainType?: DomainType[];
  difficulty?: Difficulty;
  topic?: string;
  skills?: string[];
  status: "pending" | "approved" | "rejected";
  promotedQuestionId?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  interviewId?: string;
  candidateId?: string;
  interviewerId?: string;
  // Snapshotted from the source interview at submission time — see
  // createAdhocQuestion's caller in InterviewQuestions.jsx. Absent on
  // ad-hoc questions submitted before this existed.
  interviewerName?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  round?: string | null;
}

export interface QuestionFilters {
  domainType?: string;
  difficulty?: string;
  skill?: string;
  status?: string;
}

// ── Interviews ────────────────────────────────────────────────────────────────

export interface FeedbackDomainState {
  cards?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface Feedback {
  domains?: Record<string, FeedbackDomainState>;
  overallRecommendation?: string;
  comments?: string;
  submittedAt?: string;
  importedFromSheet?: boolean;
  finalVerdict?: number | null;
  scoreIncomplete?: boolean;   // partially completed with unrated verdict sections (in-app or sheet import), so finalVerdict is left null
  missingSections?: string[];  // labels of those sections
  integrityScore?: number; // 0–5, see computeIntegrityScore in utils/templateEngine.js
  [key: string]: unknown;
}

export type InterviewStatus =
  | "pending_acceptance"
  | "scheduled"
  | "completed"
  | "partially_completed"
  | "no_show"
  | "cancelled"
  | "declined";

export interface AiReportCompetency {
  name: string;
  assessment: string;
  observations: string;
}

export interface AiReportNextStep {
  title: string;
  description: string;
}

export interface AiCandidateReport {
  decision: "retake_tests" | "retake_interview" | "move_forward";
  decisionLabel: string;
  summary: string;
  competencies: AiReportCompetency[];
  reasons: string[];
  positiveObservations: string[];
  recommendation: string;
  nextSteps: AiReportNextStep[];
  generatedAt: string;
}

export interface Interview {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  // Snapshotted from Candidate.uid (Academy's own student identifier, e.g.
  // "STU-2024-001") at creation time — same denormalization as
  // candidateName/candidateEmail above, added later so it's absent on
  // interviews created before this existed. See withCandidateUid in
  // api/interviews.ts and backfillCandidateUidOnce for historical rows.
  candidateUid?: string;
  interviewerId: string;
  interviewerEmail: string;
  interviewerName?: string;
  // Snapshotted from the interviewer's own vendor membership (User.vendorId)
  // at write time — lets the Vendor Dashboard's Firestore security rules
  // check this directly against a vendor contact's own vendorContactFor
  // without a second cross-document lookup in the rule itself. See
  // withVendorId in api/interviews.ts and backfillVendorIdOnce for
  // historical rows; null/absent for in-house (non-vendor) interviewers.
  vendorId?: string | null;
  templateId?: string;
  templateName?: string;
  // Set to "self_book" when this interview was created by confirmSelfBooking
  // (src/services/booking.service.js) — i.e. the candidate booked and
  // auto-confirmed it themselves from the Student Dashboard, with no admin
  // review step. Absent for admin-scheduled and admin-confirmed Nudge
  // bookings. Used by the Interviews page's "Booked via" filter/badge.
  bookingSource?: "self_book";
  // Snapshotted from the template's own Program assignment (Template.program
  // -> Program.id/name, see src/api/programs.ts) at creation time — lets a
  // direct-Firestore reader (e.g. Academy Nexus) filter on an exact program
  // name instead of guessing "is this an Academy interview" from the
  // template's own display name, which templates aren't required to match
  // (e.g. "Frontend Development" belongs to the Academy program without
  // being named "Academy ..."). See withProgramInfo in api/interviews.ts
  // and backfillProgramInfoOnce for historical rows.
  programId?: string;
  programName?: string;
  scheduledDate: string;
  scheduledTime: string;
  // Minutes. Absent on interviews created before this field existed —
  // every read site falls back to 60 (iv.duration || 60), which matches
  // what those interviews were actually run at.
  duration?: number;
  round?: string;
  status: InterviewStatus;
  // Mandatory whenever status is "partially_completed" (see
  // markInterviewPartiallyCompleted in api/interviews.ts) — the
  // interviewer-supplied reason the interview wasn't fully completed,
  // carried through to admin views and the Download Feedback export for
  // payment reconciliation / audit purposes.
  partialCompletionReason?: string;
  // Set when an admin overrides the status after auditing the recording/
  // transcript — e.g. a panelist marked "Completed" but the call only ran
  // a few minutes before the candidate dropped (see correctInterviewStatus
  // in api/interviews.ts). Distinct from partialCompletionReason/
  // declineReason, which are set by the interviewer themselves in the
  // normal flow — this one is always an after-the-fact admin correction.
  auditCorrectionReason?: string;
  auditCorrectedAt?: string;
  // Set whenever an interviewer declines an admin-scheduled interview (see
  // handleDecline in InterviewDetail.jsx) — shown to admins on the
  // Interviews page so a decline isn't just a silent status flip with no
  // context, and to guide reassigning a different interviewer.
  declineReason?: string;
  // Set on a declined interview once an admin reassigns it to someone else
  // via "Reassign Interviewer" (InterviewsPage.jsx) — points at the NEW
  // interview doc created for the new interviewer. The declined doc itself
  // is otherwise left untouched (status/declineReason stay exactly as the
  // original interviewer left them), so their own decline stays a
  // permanent, accurate record rather than being overwritten in place.
  reassignedTo?: string;
  // The inverse — set on the newly-created interview, pointing back at the
  // declined one it was reassigned from.
  reassignedFrom?: string;
  // Set whenever an interview is cancelled with a reason attached — either
  // the interviewer cancelling their own scheduled interview directly (see
  // handleCancelInterview in InterviewDetail.jsx) or an admin cancelling
  // from the Interviews page (see handleCancel there). Shown next to the
  // status badge once status is "cancelled", same as partialCompletionReason/
  // declineReason are for their own statuses.
  cancelReason?: string;
  cancelledBy?: "interviewer" | "admin" | "candidate";
  // Set by the student themselves via "Request Reschedule" on the Student
  // Dashboard (POST /api/sso/interviews/request-reschedule in
  // api/sso-handler.js) — surfaced on the Interviews page next to the
  // status badge and via the "Reschedule Requested" quick filter/sidebar
  // badge (see useRescheduleRequestedInterviews). An admin flips
  // rescheduleRequested back to false via "Approve Reschedule"
  // (handleApproveReschedule in InterviewsPage.jsx), which sets
  // rescheduleApproved below — the reason/requestedAt are deliberately left
  // in place (not cleared) so the row keeps showing that this interview was
  // once flagged, in whatever status it's in by then, instead of that
  // history disappearing the moment it's approved.
  rescheduleRequested?: boolean;
  rescheduleRequestReason?: string | null;
  rescheduleRequestedAt?: string | null;
  rescheduleRequestResolvedAt?: string | null;
  // Set once an admin approves a reschedule request — the interview is
  // actually cancelled at that point (Calendar event removed, slot freed,
  // interviewer notified; see handleApproveReschedule in InterviewsPage.jsx),
  // with this flag + cancelReason left in place so it's clearly
  // distinguishable from a plain admin/interviewer cancellation.
  rescheduleApproved?: boolean;
  rescheduleApprovedAt?: string | null;
  // Set on the OLD cancelled interview once the candidate actually books
  // their new slot (see linkRescheduledInterview in api/interviews.ts,
  // called from handleConfirmBooking in CandidateSchedulingTab.jsx) —
  // points at the NEW interview doc. No reciprocal field on the new one:
  // it never happened, so there's nothing for the new record to reference
  // back to.
  rescheduledTo?: string;
  candidateJoined?: boolean;
  attendanceMarkedAt?: string;
  questionsAsked?: (string | { questionId: string })[];
  questionRemarks?: Record<string, string>;
  feedback?: Feedback;
  feedbackDraft?: (Record<string, unknown> & { savedAt: string }) | null;
  meetLink?: string;
  eventId?: string;
  // Set whenever scheduleInterviewMeet's Apps Script call reports it
  // couldn't grant the interviewer co-host/host-management access on the
  // Calendar event — surfaced on the Interviews page's Meet column so an
  // admin can go grant it by hand, since nothing retries this automatically.
  hostManagementWarning?: string;
  transcriptUrl?: string;
  meetingRecordingUrl?: string;
  recallBotId?: string;
  aiReport?: AiCandidateReport;
  // Set true whenever an interview is marked completed (see
  // markInterviewCompleted in api/interviews.ts); the Apps Script sweep
  // queries on this instead of scanning every completed interview, and
  // flips it back to false once a report is generated or it gives up after
  // a few days with no recording/transcript ever showing up.
  aiReportPending?: boolean;
  aiReportPendingSince?: string;
  // Snapshotted from the candidate at scheduling time — stale once the
  // candidate record changes. The Interviewer Portal prefers a live lookup
  // via candidateId instead (see InterviewDetail.jsx); these remain as a
  // fallback for legacy/imported interviews with no resolvable candidateId.
  roleAppliedFor?: string;
  resumeLink?: string;
  // Admin-managed, editable any time after scheduling — shown to the
  // interviewer alongside the Meet link and Resume, in order (Assignment 1,
  // Assignment 2, ...). Plain URLs; display order IS the label.
  assignmentLinks?: string[];
  reminder24hSentAt?: string;
  reminder1hSentAt?: string;
  nextNudgeAt?: string | null;
  nudgeCount?: number;
  importedFromSheet?: boolean;
  archived?: boolean;
  archivedAt?: string | null;
  // Admin who created this interview (uid) — used to route admin-facing
  // email notifications (e.g. "interviewer accepted") to just that admin
  // instead of every admin. Absent for legacy/imported interviews.
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;

  // ── Partial completion → Reschedule & Resume ──────────────────────────────
  // Set on the NEW interview record created by "Reschedule & Resume" (see
  // resumePartiallyCompletedInterview in api/interviews.ts) — true whenever
  // this record picks up where an earlier Partially Completed interview
  // left off, so every view can tell this apart from an ordinary interview
  // — most importantly so a finished "Completed" here is never confused
  // with a normal full interview for payment purposes.
  resumedFromPartial?: boolean;
  // Points back at the Partially Completed interview this one continues.
  // That original record is left completely untouched (status, feedback,
  // partialCompletionReason all stay exactly as the first panelist left
  // them, as its own permanent row) — this is purely a cross-link so either
  // side can be navigated to from the other, same pattern as
  // reassignedFrom/reassignedTo above.
  resumedFromInterviewId?: string;
  // The inverse — set on the ORIGINAL Partially Completed interview once
  // it's resumed, pointing forward at the new record that continued it.
  resumedAsInterviewId?: string;
  // Legacy — interviews resumed before Reschedule & Resume was changed to
  // create a new record instead of overwriting this one in place hold their
  // prior sessions' history here (oldest first: interviewer, schedule,
  // Meet/recording links, the reason it stopped). No longer written by new
  // resumes (see resumedFromInterviewId instead), kept only so old records
  // still render correctly.
  priorSessions?: PriorInterviewSession[];
  // Domain ids that already had data in the interview this one resumed —
  // DynamicFeedbackForm renders exactly these read-only, so a later
  // panelist can't edit what an earlier one already submitted, while still
  // filling in the remaining sections on the same form. Cleared (or simply
  // absent) on a normal, never-resumed interview.
  feedbackLockedDomains?: string[];
}

export interface PriorInterviewSession {
  interviewerId: string;
  interviewerName?: string;
  interviewerEmail?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  duration?: number;
  meetLink?: string;
  eventId?: string;
  meetingRecordingUrl?: string;
  transcriptUrl?: string;
  // Why THIS session ended without finishing — the same value that was on
  // partialCompletionReason at the time it was archived.
  partialCompletionReason?: string;
  // When this session was archived (i.e. when the NEXT resume happened).
  endedAt: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  recipientId: string;
  recipientEmail: string;
  interviewId?: string;
  candidateName?: string;
  message?: string;
  status: "unread" | "read";
  createdAt: string;
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  id: string;
  date: string;
  time: string;
  isBooked: boolean;
  interviewId?: string | null;
  inviteId?: string;
  // Set on every raw slot a candidate's booking consumed (a longer
  // interview can span more than one), so rejecting/resending/deleting
  // that invite can find and free all of them, not just the one clicked —
  // see bookSlotForCandidate / freeSlotsHeldByInvite in api/scheduling.ts
  // and api/availability.ts.
  heldByInviteId?: string | null;
  bookedAt?: string;
  flagged?: boolean;
}

export interface AvailableSlot {
  slotId: string;
  interviewerId: string;
  interviewerName: string;
  interviewerEmail: string;
  date: string;
  time: string;
  isBooked: boolean;
}

// A block of real, current time an interviewer is committed to, computed
// live from their actual interviews (see getInterviewerBusyWindows in
// api/availability.ts) rather than a flag any scheduling path has to
// remember to set — so it's correct no matter how the interview was
// created (manual, nudge, import) or later changed (reschedule/cancel).
export interface BusyWindow {
  date: string;
  startMin: number;
  endMin: number;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export type ScheduleInviteStatus =
  | "sent"
  | "otp_verified"
  | "pending_confirmation"
  | "confirmed"
  | "cancelled";

export interface ScheduleInvite {
  id: string;
  candidateId?: string;
  candidateUid?: string;
  candidateEmail: string;
  candidateName?: string;
  templateId?: string;
  templateName?: string;
  round?: string;
  program?: string;
  programName?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  // Minutes — chosen by the admin when sending the nudge (30/60/90/custom),
  // carried into the invite email, and applied to the Interview created once
  // the candidate's booking is confirmed. Absent on invites sent before this
  // field existed; every read site falls back to 60.
  duration?: number;
  // Optional "HH:MM" (24-hour) bounds — when set, the candidate scheduling
  // page only offers a panelist's slots whose start time falls within this
  // window, even if the panelist submitted availability outside it (e.g. an
  // admin restricting bookings to business hours while a panelist happens
  // to have late-evening slots on file). Unset means no restriction.
  timeRangeStart?: string;
  timeRangeEnd?: string;
  // Optional explicit panelist restriction — when set (non-empty), the
  // candidate scheduling page only ever shows slots from these interviewers,
  // regardless of their profile's Skills or anything else. When absent, every
  // active interviewer's slots are eligible. Replaces the old model where an
  // interviewer's own templateIds field silently gated their eligibility per
  // campaign — that was error-prone (an interviewer with no templates
  // assigned meant zero candidates ever saw their availability, with no
  // visible reason why) and is no longer consulted for this at all.
  interviewerIds?: string[] | null;
  // Set once an admin has been emailed that this candidate had zero
  // bookable slots after duration/time-window filtering — guards against
  // re-notifying every time the candidate reloads the scheduling page.
  noSlotsNotifiedAt?: string | null;
  inviteToken: string;
  expiryHours?: number;
  status: ScheduleInviteStatus;
  sentAt?: string;
  expiresAt?: string;
  sentBy?: string;
  bookedSlotId?: string;
  bookedInterviewerId?: string;
  bookedDate?: string;
  bookedTime?: string;
  bookedAt?: string;
  interviewId?: string;
  // Set when this invite is a candidate-initiated reschedule (see
  // handleRequestReschedule in StudentDashboardPage.jsx / resolveSelfBookTarget
  // in api/sso-handler.js) — points at the OLD interview being replaced, so
  // confirming this booking knows to cancel that one and link the two
  // together (see confirmSelfBooking in src/services/booking.service.js).
  replacingInterviewId?: string | null;
  // Set when an admin rejects a candidate's booked slot (see Pending
  // Confirmations on the Nudge > Candidates tab) — the reason they typed,
  // also emailed to the candidate verbatim inside a fixed template.
  rejectionReason?: string;
  // Automated reminder tracking
  nudgeCount?: number;
  reminder1SentAt?: string | null;
  reminder2SentAt?: string | null;
  noResponseFlaggedAt?: string | null;
  updatedAt?: string;
  createdAt: string;
}

export interface OtpVerification {
  id: string;
  inviteToken: string;
  otp: string;
  used: boolean;
  createdAt: string;
}
