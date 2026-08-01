// ── Users & Auth ──────────────────────────────────────────────────────────────

export type UserRole = "admin" | "interviewer" | "interviewer_content" | "content_team";
export type UserStatus = "active" | "inactive" | "pending";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  templateIds?: string[];
  skills?: string[];
  phoneNumber?: string;
  createdAt?: string;
}

export interface Invite {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role: UserRole;
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
  templateId?: string;
  status?: string;
  archived?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  createdBy?: string;
}

// ── Skills & Programs ─────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Program {
  id: string;
  name: string;
  order: number;
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

export interface InviteHistoryEntry {
  id: string;
  status: string;
  at: string;
  note?: string;
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

export type FieldType = "text" | "scored_dropdown" | "dropdown" | "number" | "boolean";

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
  program?: string;
  domains: Domain[];
  skills?: string[];
  questionBank?: QuestionBank;
  questionIds?: string[];
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
  finalVerdict?: number;
  integrityScore?: number; // 0–5, see computeIntegrityScore in utils/templateEngine.js
  [key: string]: unknown;
}

export type InterviewStatus =
  | "pending_acceptance"
  | "scheduled"
  | "completed"
  | "no_show"
  | "cancelled";

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
  interviewerId: string;
  interviewerEmail: string;
  templateId?: string;
  templateName?: string;
  scheduledDate: string;
  scheduledTime: string;
  round?: string;
  status: InterviewStatus;
  candidateJoined?: boolean;
  attendanceMarkedAt?: string;
  questionsAsked?: (string | { questionId: string })[];
  questionRemarks?: Record<string, string>;
  feedback?: Feedback;
  feedbackDraft?: (Record<string, unknown> & { savedAt: string }) | null;
  meetLink?: string;
  eventId?: string;
  transcriptUrl?: string;
  meetingRecordingUrl?: string;
  recallBotId?: string;
  aiReport?: AiCandidateReport;
  reminder24hSentAt?: string;
  reminder1hSentAt?: string;
  nextNudgeAt?: string | null;
  nudgeCount?: number;
  importedFromSheet?: boolean;
  archived?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
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
