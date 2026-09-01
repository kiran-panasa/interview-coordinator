import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { getSkills } from "../api/skills";
import { getPrograms } from "../api/programs";
import { getTemplates } from "../api/templates";
import { getAllUsers, getActiveAdmins, getUsersByStatus, getInterviewerCounts } from "../api/users";
import { getCandidates, getCandidateCounts } from "../api/candidates";
import type { CandidateCounts } from "../api/candidates";
import { getQuestions, getQuestionCounts } from "../api/questions";
import type { QuestionCounts } from "../api/questions";
import { getAllInterviews } from "../api/interviews";
import type { Skill, Program, Template, User, Candidate, Question, Interview } from "../types";

export const QK = {
  skills:           ["skills"],
  programs:         ["programs"],
  templates:        ["templates"],
  users:            ["users"],
  activeAdmins:     ["activeAdmins"],
  pendingUsers:     ["pendingUsers"],
  interviewerCounts:["interviewerCounts"],
  candidates:       ["candidates"],
  candidateCounts:  ["candidateCounts"],
  questions:        ["questions"],
  questionCounts:   ["questionCounts"],
  interviews:       ["interviews"],
} as const;

const MIN = 60 * 1000;

export function useSkills():     UseQueryResult<Skill[]>     { return useQuery({ queryKey: QK.skills,    queryFn: getSkills,    staleTime: 30 * MIN }); }
export function usePrograms():   UseQueryResult<Program[]>   { return useQuery({ queryKey: QK.programs,  queryFn: getPrograms,  staleTime: 30 * MIN }); }
export function useTemplates():  UseQueryResult<Template[]>  { return useQuery({ queryKey: QK.templates, queryFn: getTemplates, staleTime: 10 * MIN }); }
// `enabled` defaults to true for existing callers that need the full roster
// (NudgePage, InterviewsPage, InterviewerStatsPage). InterviewersPage passes
// false by default so it doesn't read the whole users collection just to
// show its default (search/filter-less) view — see getInterviewersPage.
export function useUsers(enabled: boolean = true): UseQueryResult<User[]> { return useQuery({ queryKey: QK.users, queryFn: getAllUsers, staleTime: 5 * MIN, enabled }); }
// Targeted equality-only fetches — cheap alternatives to useUsers() for
// callers that only need a slice of the roster (AdminLayout's admin
// notification loop, Dashboard's pending-approvals widget).
export function useActiveAdmins(): UseQueryResult<User[]> { return useQuery({ queryKey: QK.activeAdmins, queryFn: getActiveAdmins, staleTime: 5 * MIN }); }
export function usePendingUsers(): UseQueryResult<User[]> { return useQuery({ queryKey: QK.pendingUsers, queryFn: () => getUsersByStatus("pending"), staleTime: 2 * MIN }); }
// Cheap aggregation-based counts (Active/Archived tab badges) — see getInterviewerCounts.
export function useInterviewerCounts(): UseQueryResult<{ active: number; archived: number }> {
  return useQuery({ queryKey: QK.interviewerCounts, queryFn: getInterviewerCounts, staleTime: 2 * MIN });
}

export function useCandidates(enabled: boolean = true): UseQueryResult<Candidate[]> { return useQuery({ queryKey: QK.candidates, queryFn: getCandidates, staleTime: 2 * MIN, enabled }); }
// Cheap aggregation-based counts (header "N active" + per-Program tab
// badges) that stay accurate without ever reading full candidate docs —
// see getCandidateCounts.
export function useCandidateCounts(programIds: string[]): UseQueryResult<CandidateCounts> {
  return useQuery({
    queryKey: [...QK.candidateCounts, ...programIds],
    queryFn: () => getCandidateCounts(programIds),
    staleTime: 2 * MIN,
  });
}

// Same `enabled` pattern as useCandidates — QuestionsPage passes false by
// default so it doesn't read the whole questions collection up front; see
// getQuestionsPage in api/questions.ts.
export function useQuestions(enabled: boolean = true): UseQueryResult<Question[]> { return useQuery({ queryKey: QK.questions, queryFn: () => getQuestions(), staleTime: 5 * MIN, enabled }); }
export function useQuestionCounts(): UseQueryResult<QuestionCounts> {
  return useQuery({ queryKey: QK.questionCounts, queryFn: getQuestionCounts, staleTime: 2 * MIN });
}

// One-time fetch, cached and shared across pages via React Query — for
// summary/stat views (Dashboard, Templates usage stats) that don't need
// live updates. Pages that actively manage interview state and benefit from
// seeing interviewer actions immediately (InterviewsPage, NudgePage) keep
// using the real-time useInterviews() from hooks/subscriptions instead.
export function useAllInterviews(): UseQueryResult<Interview[]> { return useQuery({ queryKey: QK.interviews, queryFn: getAllInterviews, staleTime: 2 * MIN }); }
