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
}

export type DomainType = "theory" | "coding" | "project" | "resume" | "overall_feedback";

export interface Domain {
  id: string;
  label: string;
  type: DomainType | string;
  enabled?: boolean;
  order?: number;
  domainFields?: Field[];
  cardFields?: Field[];
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
  domains: Domain[];
  questionBank?: QuestionBank;
  questionIds?: string[];
  program?: string;
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
  | "pending"
  | "pending_confirmation"
  | "confirmed"
  | "expired"
  | "cancelled";

export interface ScheduleInvite {
  id: string;
  candidateEmail: string;
  candidateName?: string;
  templateId?: string;
  round?: string;
  programName?: string;
  inviteToken: string;
  status: ScheduleInviteStatus;
  bookedSlotId?: string;
  bookedInterviewerId?: string;
  bookedDate?: string;
  bookedTime?: string;
  bookedAt?: string;
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
