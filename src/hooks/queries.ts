import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { getSkills } from "../api/skills";
import { getPrograms } from "../api/programs";
import { getTemplates } from "../api/templates";
import { getAllUsers } from "../api/users";
import { getCandidates } from "../api/candidates";
import { getQuestions } from "../api/questions";
import { getAllInterviews } from "../api/interviews";
import type { Skill, Program, Template, User, Candidate, Question, Interview } from "../types";

export const QK = {
  skills:     ["skills"],
  programs:   ["programs"],
  templates:  ["templates"],
  users:      ["users"],
  candidates: ["candidates"],
  questions:  ["questions"],
  interviews: ["interviews"],
} as const;

const MIN = 60 * 1000;

export function useSkills():     UseQueryResult<Skill[]>     { return useQuery({ queryKey: QK.skills,    queryFn: getSkills,    staleTime: 30 * MIN }); }
export function usePrograms():   UseQueryResult<Program[]>   { return useQuery({ queryKey: QK.programs,  queryFn: getPrograms,  staleTime: 30 * MIN }); }
export function useTemplates():  UseQueryResult<Template[]>  { return useQuery({ queryKey: QK.templates, queryFn: getTemplates, staleTime: 10 * MIN }); }
export function useUsers():      UseQueryResult<User[]>      { return useQuery({ queryKey: QK.users,     queryFn: getAllUsers,  staleTime:  5 * MIN }); }
export function useCandidates(): UseQueryResult<Candidate[]> { return useQuery({ queryKey: QK.candidates,queryFn: getCandidates,staleTime:  2 * MIN }); }
export function useQuestions():  UseQueryResult<Question[]>  { return useQuery({ queryKey: QK.questions, queryFn: () => getQuestions(), staleTime:  5 * MIN }); }

// One-time fetch, cached and shared across pages via React Query — for
// summary/stat views (Dashboard, Templates usage stats) that don't need
// live updates. Pages that actively manage interview state and benefit from
// seeing interviewer actions immediately (InterviewsPage, NudgePage) keep
// using the real-time useInterviews() from hooks/subscriptions instead.
export function useAllInterviews(): UseQueryResult<Interview[]> { return useQuery({ queryKey: QK.interviews, queryFn: getAllInterviews, staleTime: 2 * MIN }); }
