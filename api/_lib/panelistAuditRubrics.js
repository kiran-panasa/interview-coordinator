// "AI Interview Auditor" rubric content — transcribed from the Nov 13, 2026
// "AI Interview Auditor – Guidelines & Templates" doc (Omkar). This audits
// the PANELIST's conduct of an interview, never the candidate's performance
// — a completely separate concern from interviews/{id}.aiReport, which
// assesses the candidate.
//
// Keys/labels are the single shared source at src/constants/
// panelistAuditRubrics.js (frontend-safe — just key+label, no prompt text)
// so the Templates page dropdown and this file's actual rubric text can
// never drift apart on what a key means.
//
// Each interview's Template carries an `auditRubricKey` (set once by an
// admin on the Templates page, Templates → Lifecycle) pointing at exactly
// one of the RUBRICS keys below — chosen deterministically from data we
// already have (program + track + duration), not guessed by Claude from a
// free-text title. A template with no key set simply never gets an audit
// generated (see panelistAuditSweep.js).
//
// SHARED content (identical on every single call, so it's the one marked
// for Anthropic prompt caching in panelistAuditReport.js) vs. the ONE
// rubric-specific block actually relevant to a given interview — splitting
// these keeps each call's real prompt small and keeps the cached portion
// stable across every interview/template, maximizing cache hit rate.

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

// Each rubric below is the ONE Section 5/6 template matching a given
// Template's assigned auditRubricKey — only this block (plus the shared
// content above) is sent for that interview, not the full library.
export const RUBRICS = {
  edge_60_fullstack: {
    label: "Edge 60 min — Full Stack (MERN / Java FS / Python FS)",
    text: `
EDGE 60 — FULL STACK (MERN / Java FS / Python FS), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-18, weight 20: code opened, built vs team, most complex function line by line, what to rebuild, "what did AI write".
Practical task 18-30, weight = in skill areas: own repo or bank starter snippet, core + stretch read, AI off, silent, time calls at 8 and 3 min, not improvised.
Skill areas FE + BE 30-42, weight 20+20: 3 Qs each (Easy/Med/Hard), "what prints" over definitions, both areas covered, rated separately.
Gen AI 42-50, weight 10: one question about something they built, not theory.
Scenario 50-57, weight 15: one real problem on their stack (CORS, slow endpoint, stale data).
Fundamentals + deployment 57-60, weight 10+5: OOPS/DBMS/CN/OS asked practically, "has it run outside your laptop, what broke first".
Compulsory: slow query / indexing question — MERN = index question, Java = N+1, Python = select_related vs prefetch_related. Missing = Critical.
Track red flags: Java/JPA questions in a MERN round; frontend or backend area not asked; sub-track mismatch not re-routed.`.trim(),
  },
  edge_60_data: {
    label: "Edge 60 min — Data Family (DSML / Gen AI / Data Analyst)",
    text: `
EDGE 60 — DATA FAMILY (DSML / Gen AI / Data Analyst), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-18, weight 20: code opened, built vs team, complex function, what to rebuild, "what did AI write".
Practical task 18-30, weight = in skill areas: own repo or bank starter, core + stretch, silent, time calls at 8 and 3 min.
Skill areas 1 + 2 30-42, weight 20+20: 3 Qs each (Easy/Med/Hard) inside the sub-track, rated separately.
Gen AI 42-50, weight 10: one question about something they built.
Scenario 50-57, weight 15: DSML = model degrades at 97% accuracy; Gen AI = cost triples / out-of-scope answers; DA = two teams, two numbers.
Fundamentals + deployment 57-60, weight 10+5: DSML = stats+Python; Gen AI = Python+data; DA = stats+Excel; "has it produced an answer for someone else?".
Compulsory: DSML = leakage ("scale, then split — what's wrong?"); Gen AI = "confidently wrong — where do you look first?" (retrieval before prompt); DA = "which BI tool have you built in — show it" (nothing built caps Skill Area 2 at 2).
Track red flags: questions from another sub-track (RAG to DSML, regularisation to DA); wrong stats answers accepted.`.trim(),
  },
  edge_90_fullstack: {
    label: "Edge 90 min — Full Stack (MERN / Java FS / Python FS, + DSA)",
    text: `
EDGE 90 — FULL STACK (MERN / Java FS / Python FS), titled "... FullStack + DSA" in the calendar, 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-13, weight 10: code opened, ownership boundary, flags ticked (Deployed, RAG+vector DB, BI dashboard).
CS fundamentals 13-23, weight 10: 4 questions pulled from their own project.
Coding block (DSA) 23-53, weight 30: pre-picked, rotated problem (Codeforces 1300-1500 difficulty); brute force running by 00:35; optimal by 00:48; dry run; follow-up change; Hint L1 at 00:35, L2 recorded; stops at 00:53.
Skill areas FE + BE 53-1:10, weight 15+15: 2 Qs + 1 hands-on task per area (not optional); BE: N+1, ownership check, pagination.
Gen AI 1:10-1:20, weight 10: built with a model, not just used one.
Scenario 1:20-1:28, weight 10: matched to stack, credits clarifying questions.
Track red flags: coding overruns into skill areas; hands-on or follow-up change skipped; an unreached section rated (must stay blank); Java/JPA questions in MERN.`.trim(),
  },
  edge_90_data: {
    label: "Edge 90 min — Data Family (DSML / Gen AI / Data Analyst)",
    text: `
EDGE 90 — DATA FAMILY (DSML / Gen AI / Data Analyst), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-13, weight 10: code opened, ownership boundary, flags ticked (Deployed, RAG+vector DB, BI dashboard).
CS fundamentals 13-23, weight 10: 4 questions pulled from their own project.
Coding block 23-53, weight 30: pre-picked problem, brute force -> optimal -> follow-up change, Hint L1 at 00:35, L2 recorded, stops at 00:53. DA = SQL & BI task instead.
Skill areas 1 + 2 53-1:10, weight 15+15: 2 Qs + 1 hands-on task per area (hands-on not optional).
Gen AI 1:10-1:20, weight 10: built with a model, not just used one.
Scenario 1:20-1:28, weight 10: matched to stack, credits clarifying questions.
Sub-track skill areas: DSML = Data & SQL / Machine Learning, must-check leakage question (scale before split). Gen AI = Applied AI & RAG / Python & Engineering, must-check "assistant answers confidently and wrongly — where do you look first?" (retrieval before prompt). Data Analyst = SQL & Data Modelling / BI & Business Analysis, must-check "which BI tool have you built something in — show it".
Track red flags: web-dev project probed in a DA round instead of a data/BI project; wrong stats answers accepted; section not reached but rated (must stay blank).`.trim(),
  },
  academy_c1_dsa: {
    label: "Academy C1 — Programming with Problem Solving (DSA), 90 min",
    text: `
ACADEMY C1 — PROGRAMMING WITH PROBLEM SOLVING (DSA), 90 min.
Intro & setup 00-05: "think out loud, hints are allowed, ask questions", editor that runs code.
Problem 1 (Easy) 05-25, weight 22%: paste -> read -> restate -> 60 sec -> brute force + complexity -> improve -> code -> walkthrough -> "one input that breaks it"; finish time recorded.
Problem 2 (Medium, or Hard if P1 < 12 min) 25-1:00, weight 34%: same protocol, order Easy -> Medium/Hard (never end on Easy).
Theory rapid fire 1:00-1:17, weight 12+12+10%: ~14 Qs, 5 L2 / 5 L3 / 4 L4, 90 sec each, follow-up on clean answers, no "Correct!".
Communication throughout, weight 10%.
Red flags: self-rating asked; problem parked and never returned to; 30+ rapid questions; wrong theory answers passed.
Hint ladder applies throughout: L0 Nudge (no cap), L1 Direction (caps segment at 4), L2 Structure/names the technique (caps at 3), L3 Rescue/walks through the answer (caps at 2, level not certified); 60 sec of silence required before any hint.`.trim(),
  },
  academy_c2_frontend: {
    label: "Academy C2 — Frontend Development, 90 min",
    text: `
ACADEMY C2 — FRONTEND DEVELOPMENT, 90 min.
Project deep-dive 00-08, weight 7%: 5-7 probes on one project, code opened, complex function.
L1 HTML & CSS 08-20, weight 11%: 6-8 Qs, one snippet.
L2 JavaScript 20-35, weight 15%: 6-8 Qs, one output-prediction, one async.
L3 React 35-47, weight 14%: 6-8 Qs, one rendering, one hooks-behaviour.
L3 Machine coding 47-1:12, weight 24%: core + stretch aloud, AI off, silent, time calls at 15 and 5 min, not dropped when candidate stalls.
Debug / code reading 1:12-1:20, weight 7%: predict before run, asks the cause.
L4 Production 1:20-1:30, weight 12%: only if L3 cleared.
Hint ladder applies throughout (see academy_c1_dsa rubric for the 4 levels).
A level counts only if every level below it is cleared — a skipped/cut-short section directly changes the certified level.`.trim(),
  },
  academy_c3_swe: {
    label: "Academy C3 — Software Engineering Fundamentals (max L3), 90 min",
    text: `
ACADEMY C3 — SOFTWARE ENGINEERING FUNDAMENTALS (max L3), 90 min.
Intro & setup 00-05.
L1 Core CS (DBMS, OS, CN) 05-20, weight 14%: ~7 Qs.
L1 SQL task 20-35, weight 18%: tables given in writing, easy-medium, "cost on 5M rows", candidate writes it alone.
L2 OOP concepts 35-50, weight 16%: ~7 Qs.
L2 OOP design task 50-1:05, weight 18%: no code needed, "why inheritance vs composition", changes a requirement.
L3 Software design & clean code 1:05-1:17, weight 14%: DRY/KISS/YAGNI with nuance.
L3 Code review 1:17-1:27, weight 12%: framed as a teammate's PR, candidate finds issues first, security issue spotted?
Hint ladder applies throughout. A level counts only if every level below it is cleared.`.trim(),
  },
  academy_c4_backend: {
    label: "Academy C4 — Backend Development, 90 min",
    text: `
ACADEMY C4 — BACKEND DEVELOPMENT, 90 min.
Intro & setup 00-04: shared editor works.
Project / API deep-dive 04-11, weight 7%: code opened.
L1 Backend foundations 11-23, weight 11%: HTTP, REST, Express, middleware.
L1 CRUD endpoint task 23-38, weight 16%: requirements read, "done" defined, silent except halfway + 5 min, code runs.
L2 Database & Auth 38-51, weight 13%: MongoDB/Mongoose, JWT, bcrypt, validation.
L2 Debug / fix task 51-1:04, weight 15%: predict before run, asks the cause, counts defects found unprompted.
L3 Backend advanced 1:04-1:16, weight 14%: caching, queues, event loop, security, rate limiting.
L4 Production backend 1:16-1:26, weight 12%: only if L3 cleared.
Non-Node candidates: Spring Boot / Django equivalents — judge the concept, not the exact syntax.
Hint ladder applies throughout. A level counts only if every level below it is cleared.`.trim(),
  },
  academy_marks_fullstack: {
    label: "Academy — FE (Next.js+TS) / Python Full Stack, marks /100, 90 min",
    text: `
ACADEMY — FE (NEXT.JS + TYPESCRIPT) OR PYTHON FULL STACK, 90 min, scored out of 100 (not level-based).
Project deep-dive: T1(Next.js) 00-07/7 marks, T2(Python FS) 00-07/7 marks — built vs team, architecture, complex function; if LLM used: what is sent, how output is checked.
Stack: T1 07-19/13 marks (Next.js + TS), T2 07-17/10 marks (FastAPI/Django) — scenarios over definitions.
SQL & DBMS: T1 19-29/12 marks, T2 17-29/13 marks — schema pasted, 2 query tasks written, ties/NULLs probed.
Gen AI: T1 29-41/13 marks, T2 29-41/13 marks — T1: where the LLM call lives; T2: one agent/tool-calling question; both: hallucination/eval.
Machine coding: T1 41-1:06/25 marks, T2 41-1:06/25 marks — core + stretch, silent, time calls at 15 and 5 min.
Debug: T1 1:06-1:12/5 marks, T2 1:06-1:12/5 marks — predict before run, asks for cause.
System design & deploy: T1 1:12-1:27/15 marks, T2 1:12-1:27/17 marks — candidate drives 8-10 min, 2-3 deployment probes.
Identify T1 vs T2 from the title/transcript stack (Next.js+TS vs FastAPI/Django) and score against the matching column.`.trim(),
  },
  irp_l1_frontend: {
    label: "IRP L1 Frontend TR, 60 min",
    text: `
IRP L1 FRONTEND TR (separate program), 60 min.
FE project (take-home), 15 min, 20 marks: app flow, 2 design choices, one small live change; AI used on the take-home = integrity flag, not "fine".
Concepts, 15 min, 30 marks: 10 questions at L1, in syllabus.
Live coding, 25 min, 40 marks: Counter / Todo / Login form / Search filter / Fetch users — full 25 min, one follow-up change.
Communication throughout, 10 marks.`.trim(),
  },
};

export { RUBRIC_OPTIONS } from "../../src/constants/panelistAuditRubrics.js";
