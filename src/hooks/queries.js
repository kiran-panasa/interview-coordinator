import { useQuery } from "@tanstack/react-query";
import { getSkills } from "../api/skills";
import { getPrograms } from "../api/programs";
import { getTemplates } from "../api/templates";
import { getAllUsers } from "../api/users";
import { getCandidates } from "../api/candidates";
import { getQuestions } from "../api/questions";

// Shared query keys — use these when calling queryClient.invalidateQueries or setQueryData
export const QK = {
  skills:     ["skills"],
  programs:   ["programs"],
  templates:  ["templates"],
  users:      ["users"],
  candidates: ["candidates"],
  questions:  ["questions"],
};

const MIN  = 60 * 1000;

// Skills and programs change rarely (admin adds them infrequently) — long TTL
export function useSkills()    { return useQuery({ queryKey: QK.skills,    queryFn: getSkills,    staleTime: 30 * MIN }); }
export function usePrograms()  { return useQuery({ queryKey: QK.programs,  queryFn: getPrograms,  staleTime: 30 * MIN }); }

// Templates change occasionally — moderate TTL
export function useTemplates() { return useQuery({ queryKey: QK.templates, queryFn: getTemplates, staleTime: 10 * MIN }); }

// Users change when admin modifies roles — short TTL
export function useUsers()     { return useQuery({ queryKey: QK.users,     queryFn: getAllUsers,  staleTime:  5 * MIN }); }

// Candidates change during data entry sessions — short TTL
export function useCandidates(){ return useQuery({ queryKey: QK.candidates,queryFn: getCandidates,staleTime:  2 * MIN }); }

// Questions change when content team adds/edits — moderate TTL
export function useQuestions() { return useQuery({ queryKey: QK.questions, queryFn: getQuestions, staleTime:  5 * MIN }); }
