import type { Candidate } from "../types";

// A candidate can now belong to more than one Program (e.g. both "Edge 2.0"
// and "Academy" at once) — stored as Candidate.programs: string[]. Existing
// documents only have the old single Candidate.program string and are
// deliberately NOT bulk-migrated (too risky to rewrite the whole live
// collection at once); every read goes through this instead, so an
// unmigrated doc still behaves exactly as it did before. New writes should
// set `programs`; see CandidatesPage.jsx and api/sync/edge-candidates.js for
// the write sites that also still set the legacy `program` field (to the
// first program in the list) so the handful of read sites not yet migrated
// to `programs` — Nudge's campaign filters, Settings' delete-program
// cleanup, Inbound's move-to-nudge, and the SSO backend's profile/interview
// resolution — keep working for multi-program candidates too, just seeing
// one of their programs until those are migrated.
export function getCandidateProgramIds(candidate: Pick<Candidate, "programs" | "program"> | null | undefined): string[] {
  if (!candidate) return [];
  if (Array.isArray(candidate.programs) && candidate.programs.length > 0) return candidate.programs;
  return candidate.program ? [candidate.program] : [];
}

export function candidateHasProgram(candidate: Pick<Candidate, "programs" | "program"> | null | undefined, programId: string): boolean {
  return getCandidateProgramIds(candidate).includes(programId);
}
