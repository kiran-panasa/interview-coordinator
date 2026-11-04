// A Partially Completed interview that's since been resumed
// (resumedAsInterviewId set — see resumePartiallyCompletedInterview in
// api/interviews.ts) is NOT still "partially completed" in any count —
// the resumed session is a separate interview doc that already counts
// under its own status (usually "completed", via the completedResumed
// bucket). Counting both the stale original partial AND its resumed
// continuation double-counted every resumed interview across every
// stats/leaderboard view and the vendor invoice count those feed.
export function isSupersededPartial(iv) {
  return iv.status === "partially_completed" && !!iv.resumedAsInterviewId;
}

// "Did real interview work happen here" — for leaderboard/ranking-style
// tallies that lump completed + still-partial together into one count.
export function countsAsCompletedWork(iv) {
  if (iv.status === "completed") return true;
  if (iv.status === "partially_completed") return !iv.resumedAsInterviewId;
  return false;
}
