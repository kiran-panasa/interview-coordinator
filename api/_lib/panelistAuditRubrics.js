// "AI Interview Auditor" — fixed policy content, shared/identical across
// EVERY panelist audit call regardless of template. Transcribed from the
// Nov 13, 2026 "AI Interview Auditor – Guidelines & Templates" doc (Omkar).
// This audits the PANELIST's conduct of an interview, never the
// candidate's performance — a completely separate concern from
// interviews/{id}.aiReport, which assesses the candidate.
//
// The TRACK-SPECIFIC rubric (which section/time/weight breakdown applies)
// is NOT here — it's admin-editable, stored in Firestore
// (panelistAuditRubrics/{key}), with src/constants/panelistAuditRubricDefaults.js
// as the fallback seed content. See resolveRubricText below.

export const UNIVERSAL_CHECKLIST = `
UNIVERSAL CHECKLIST (every Edge and Academy round):

U1 On time — Good: joins before candidate, starts at T-0. Red flag: starts 5+ min late, asks candidate to wait.
U2 Proctoring at start — Good: screen share, phone camera showing laptop + candidate, extensions/extra desktops closed, AI tools off, room check. Red flag: any skipped, or dropped mid-round ("leave the phone").
U3 Intro — Good: name, role, "part of NxtWave's interview panel", round name, sections and time. Red flag: long personal details (college/year/branch/company pitch/hobbies).
U4 Run sheet followed — Good: sections in the guide's order and time split, practical task gets full time. Red flag: theory overruns and squeezes coding, sections skipped/out of order.
U5 Questions at right level — Good: from the question bank, inside the track, matching the level. Red flag: off-track questions (e.g. JPA in MERN, LLM in Frontend), above level, 30+ rapid questions.
U6 Project / code ownership — Good: code opened, "what did you build vs team", "walk me through the most complex function", "what would you rebuild", "what did AI write — explain it". Red flag: demo/narration only, AI-written code never checked.
U7 Practical task run correctly — Good: core + stretch read aloud, timer, silence, time calls, code actually runs, one follow-up change. Red flag: task dropped when candidate stalls, panelist co-solves, code never run.
U8 Hints follow the hint ladder — Good: waits 60 sec, L0 nudge first, every hint noted. Red flag: dictates fixes, names the technique, walks through the answer.
U9 No teaching — Good: wrong answer → one follow-up, then move on and note it. Red flag: explains the answer, confirms "correct!", corrects with the right answer.
U10 Wrong answers caught — Good: probes before accepting. Red flag: wrong answers pass with "Okay" (scoring risk).
U11 Neutral conduct — Good: calm, no pressure, no side talk, muted when not speaking. Red flag: scolding ("why so slow?"), praise ("great project"), side conversations.
U12 Neutral close — Good: "The team will share the result and next steps." Stops recording. Red flag: any feedback, score, advice, "keep practising", "all the best for your future", company talk.
`.trim();

export const SEVERITY_AND_VERDICT = `
SEVERITY LEVELS:
- Critical (breaks the result, the round's integrity, or the candidate experience): outcome hint/feedback/score at close, AI allowed, proctoring skipped or dropped, practical task co-solved/dictated/dropped, answers taught, scolding or pressure, wrong track/guide used, side conversations.
- Fix (weakens scoring but the round still counts): wrong answers passed, too many or off-level questions, section short or out of order, no stretch goal, code not opened, long personal intro, mild praise, self-rating asked.
- Good (matches the guide): name it specifically so the panelist keeps doing it.
- Check recording (transcript is unclear): profanity, odd lines, other voices, setup before the transcript starts.

VERDICT RULES:
- "Good to continue": 0 Critical and up to 4 Fix -> send feedback.
- "Continue after feedback": 1-2 Critical, or 5+ Fix -> feedback + audit the next round.
- "Not yet / pause solo": 3+ Critical, or any of (AI allowed, outcome/score shared, scolding) -> feedback, then 1 shadow + 1 audited round before solo.
- A repeat issue from an earlier audit of the SAME panelist is raised one severity level (Fix -> Critical). Use the "PRIOR FINDINGS FOR THIS PANELIST" context below, if provided, to check for repeats.
`.trim();

export const OUTPUT_INSTRUCTIONS = `
Judge only what is in the transcript. Quote short lines with a timestamp as evidence for every Critical or Fix finding.
Do not trust a transcript-provided summary for correctness — it often marks wrong candidate answers as correct; verify from the raw dialogue.
Transcripts mis-hear words. Profanity, odd lines, or side talk -> flag "check on recording", never conclude from it.
If the transcript starts late (e.g. 00:02:00), note the setup may have happened before it, don't penalize U1/U2 on that basis alone.
Run the Universal checklist first, then the track-specific rubric below. Each rubric row becomes one row in the remarks table.
Never mention the candidate's score, result, or any other panelist's name in the final message.
The final message always: starts with 2-3 real strengths, then fixes ordered by severity, each fix = an action + one example from this round + the exact line to use instead (max 7 steps), and leaves out anything that still needs a recording check.
`.trim();

// Message tone — resolved server-side from the panelist's own email domain
// (nxtwave.co.in = internal) rather than asked of Claude, since we already
// know this with certainty; passed into the prompt as a plain instruction.
export const TONE_INTERNAL = `This panelist is INTERNAL (nxtwave.co.in email). Use very simple words, short lines, and "What went well / What to change next time" headings in the final message.`;
export const TONE_EXTERNAL = `This panelist is EXTERNAL (non-nxtwave.co.in email). Use a professional, short tone with "What's working / Next steps" headings in the final message.`;

export { RUBRIC_OPTIONS, DEFAULT_RUBRICS } from "../../src/constants/panelistAuditRubricDefaults.js";

// The ONE rubric-specific block actually relevant to a given interview —
// Firestore (admin-edited, via the Templates page's "Audit Rubrics" tab)
// if it exists, else the default seed text above. Never throws for a
// missing Firestore doc — only for a genuinely unknown key (a template
// pointing at a rubric that was renamed/removed).
export async function resolveRubricText(db, key) {
  const { DEFAULT_RUBRICS } = await import("../../src/constants/panelistAuditRubricDefaults.js");
  const fallback = DEFAULT_RUBRICS[key];
  const snap = await db.collection("panelistAuditRubrics").doc(key).get();
  if (snap.exists) {
    const data = snap.data();
    return { label: data.label || fallback?.label || key, text: data.text || fallback?.text || "" };
  }
  if (!fallback) throw new Error(`No panelist audit rubric found for key "${key}".`);
  return fallback;
}
