import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { getSkills } from "../api/skills";
import { getPrograms } from "../api/programs";
import { getTemplates } from "../api/templates";
import { getAllUsers } from "../api/users";
import { getCandidates, getCandidateCounts } from "../api/candidates";
import type { CandidateCounts } from "../api/candidates";
import { getQuestions } from "../api/questions";
import { getAllInterviews } from "../api/interviews";
import type { Skill, Program, Template, User, Candidate, Question, Interview } from "../types";

export const QK = {
  skills:          ["skills"],
  programs:        ["programs"],
  templates:       ["templates"],
  users:           ["users"],
  candidates:      ["candidates"],
  candidateCounts: ["candidateCounts"],
  questions:       ["questions"],
  interviews:      ["interviews"],
} as const;

const MIN = 60 * 1000;

export function useSkills():     UseQueryResult<Skill[]>     { return useQuery({ queryKey: QK.skills,    queryFn: getSkills,    staleTime: 30 * MIN }); }
export function usePrograms():   UseQueryResult<Program[]>   { return useQuery({ queryKey: QK.programs,  queryFn: getPrograms,  staleTime: 30 * MIN }); }
export function useTemplates():  UseQueryResult<Template[]>  { return useQuery({ queryKey: QK.templates, queryFn: getTemplates, staleTime: 10 * MIN }); }
export function useUsers():      UseQueryResult<User[]>      { return useQuery({ queryKey: QK.users,     queryFn: getAllUsers,  staleTime:  5 * MIN }); }
// `enabled` defaults to true for existing callers that need the full list
// (NudgePage, InboundPage, InterviewsPage). CandidatesPage passes false by
// default so it doesn't read the whole collection just to show its
// default (search-less, non-archived) view — see getCandidatesPage.
export function useCandidates(enabled: boolean = true): UseQueryResult<Candidate[]> { return useQuery({ queryKey: QK.candidates, queryFn: getCandidates, staleTime: 2 * MIN, enabled }); }
export function useQuestions():  UseQueryResult<Question[]>  { return useQuery({ queryKey: QK.questions, queryFn: () => getQuestions(), staleTime:  5 * MIN }); }

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

// One-time fetch, cached and shared across pages via React Query — for
// summary/stat views (Dashboard, Templates usage stats) that don't need
// live updates. Pages that actively manage interview state and benefit from
// seeing interviewer actions immediately (InterviewsPage, NudgePage) keep
// using the real-time useInterviews() from hooks/subscriptions instead.
export function useAllInterviews(): UseQueryResult<Interview[]> { return useQuery({ queryKey: QK.interviews, queryFn: getAllInterviews, staleTime: 2 * MIN }); }
