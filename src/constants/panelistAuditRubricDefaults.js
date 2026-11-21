// Default/seed text for each Panelist Audit Rubric — transcribed from the
// Nov 13, 2026 "AI Interview Auditor – Guidelines & Templates" doc (Omkar).
// This is the FALLBACK content only: the live, admin-editable version of
// each rubric lives in Firestore (panelistAuditRubrics/{key}, see
// src/api/panelistAuditRubrics.ts) once an admin has saved it at least
// once — see the "Audit Rubrics" tab on the Templates page, which is also
// where these defaults get seeded in on first visit.
//
// Frontend-safe (just text, no secrets) — also read server-side
// (api/_lib/panelistAuditRubrics.js imports this same file) so the
// default content can never drift between what an admin previews/edits
// and what actually gets sent to Claude when no Firestore override exists.
export const DEFAULT_RUBRICS = {
  edge_60_fullstack: {
    label: "Edge 60 min — Full Stack (MERN / Java FS / Python FS)",
    text: `EDGE 60 — FULL STACK (MERN / Java FS / Python FS), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-18, weight 20: code opened, built vs team, most complex function line by line, what to rebuild, "what did AI write".
Practical task 18-30, weight = in skill areas: own repo or bank starter snippet, core + stretch read, AI off, silent, time calls at 8 and 3 min, not improvised.
Skill areas FE + BE 30-42, weight 20+20: 3 Qs each (Easy/Med/Hard), "what prints" over definitions, both areas covered, rated separately.
Gen AI 42-50, weight 10: one question about something they built, not theory.
Scenario 50-57, weight 15: one real problem on their stack (CORS, slow endpoint, stale data).
Fundamentals + deployment 57-60, weight 10+5: OOPS/DBMS/CN/OS asked practically, "has it run outside your laptop, what broke first".
Compulsory: slow query / indexing question — MERN = index question, Java = N+1, Python = select_related vs prefetch_related. Missing = Critical.
Track red flags: Java/JPA questions in a MERN round; frontend or backend area not asked; sub-track mismatch not re-routed.`,
  },
  edge_60_data: {
    label: "Edge 60 min — Data Family (DSML / Gen AI / Data Analyst)",
    text: `EDGE 60 — DATA FAMILY (DSML / Gen AI / Data Analyst), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-18, weight 20: code opened, built vs team, complex function, what to rebuild, "what did AI write".
Practical task 18-30, weight = in skill areas: own repo or bank starter, core + stretch, silent, time calls at 8 and 3 min.
Skill areas 1 + 2 30-42, weight 20+20: 3 Qs each (Easy/Med/Hard) inside the sub-track, rated separately.
Gen AI 42-50, weight 10: one question about something they built.
Scenario 50-57, weight 15: DSML = model degrades at 97% accuracy; Gen AI = cost triples / out-of-scope answers; DA = two teams, two numbers.
Fundamentals + deployment 57-60, weight 10+5: DSML = stats+Python; Gen AI = Python+data; DA = stats+Excel; "has it produced an answer for someone else?".
Compulsory: DSML = leakage ("scale, then split — what's wrong?"); Gen AI = "confidently wrong — where do you look first?" (retrieval before prompt); DA = "which BI tool have you built in — show it" (nothing built caps Skill Area 2 at 2).
Track red flags: questions from another sub-track (RAG to DSML, regularisation to DA); wrong stats answers accepted.`,
  },
  edge_90_fullstack: {
    label: "Edge 90 min — Full Stack (MERN / Java FS / Python FS, + DSA)",
    text: `EDGE 90 — FULL STACK (MERN / Java FS / Python FS), titled "... FullStack + DSA" in the calendar, 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-13, weight 10: code opened, ownership boundary, flags ticked (Deployed, RAG+vector DB, BI dashboard).
CS fundamentals 13-23, weight 10: 4 questions pulled from their own project.
Coding block (DSA) 23-53, weight 30: pre-picked, rotated problem (Codeforces 1300-1500 difficulty); brute force running by 00:35; optimal by 00:48; dry run; follow-up change; Hint L1 at 00:35, L2 recorded; stops at 00:53.
Skill areas FE + BE 53-1:10, weight 15+15: 2 Qs + 1 hands-on task per area (not optional); BE: N+1, ownership check, pagination.
Gen AI 1:10-1:20, weight 10: built with a model, not just used one.
Scenario 1:20-1:28, weight 10: matched to stack, credits clarifying questions.
Track red flags: coding overruns into skill areas; hands-on or follow-up change skipped; an unreached section rated (must stay blank); Java/JPA questions in MERN.`,
  },
  edge_90_data: {
    label: "Edge 90 min — Data Family (DSML / Gen AI / Data Analyst)",
    text: `EDGE 90 — DATA FAMILY (DSML / Gen AI / Data Analyst), 7 ratings.
Intro 00:00-03 (plan set, code open, proctoring done).
Project deep-dive 03-13, weight 10: code opened, ownership boundary, flags ticked (Deployed, RAG+vector DB, BI dashboard).
CS fundamentals 13-23, weight 10: 4 questions pulled from their own project.
Coding block 23-53, weight 30: pre-picked problem, brute force -> optimal -> follow-up change, Hint L1 at 00:35, L2 recorded, stops at 00:53. DA = SQL & BI task instead.
Skill areas 1 + 2 53-1:10, weight 15+15: 2 Qs + 1 hands-on task per area (hands-on not optional).
Gen AI 1:10-1:20, weight 10: built with a model, not just used one.
Scenario 1:20-1:28, weight 10: matched to stack, credits clarifying questions.
Sub-track skill areas: DSML = Data & SQL / Machine Learning, must-check leakage question (scale before split). Gen AI = Applied AI & RAG / Python & Engineering, must-check "assistant answers confidently and wrongly — where do you look first?" (retrieval before prompt). Data Analyst = SQL & Data Modelling / BI & Business Analysis, must-check "which BI tool have you built something in — show it".
Track red flags: web-dev project probed in a DA round instead of a data/BI project; wrong stats answers accepted; section not reached but rated (must stay blank).`,
  },
  academy_c1_dsa: {
    label: "Academy C1 — Programming with Problem Solving (DSA)",
    text: `ACADEMY C1 — PROGRAMMING WITH PROBLEM SOLVING (DSA), 90 min.
Intro & setup 00-05: "think out loud, hints are allowed, ask questions", editor that runs code.
Problem 1 (Easy) 05-25, weight 22%: paste -> read -> restate -> 60 sec -> brute force + complexity -> improve -> code -> walkthrough -> "one input that breaks it"; finish time recorded.
Problem 2 (Medium, or Hard if P1 < 12 min) 25-1:00, weight 34%: same protocol, order Easy -> Medium/Hard (never end on Easy).
Theory rapid fire 1:00-1:17, weight 12+12+10%: ~14 Qs, 5 L2 / 5 L3 / 4 L4, 90 sec each, follow-up on clean answers, no "Correct!".
Communication throughout, weight 10%.
Red flags: self-rating asked; problem parked and never returned to; 30+ rapid questions; wrong theory answers passed.
Hint ladder applies throughout: L0 Nudge (no cap), L1 Direction (caps segment at 4), L2 Structure/names the technique (caps at 3), L3 Rescue/walks through the answer (caps at 2, level not certified); 60 sec of silence required before any hint.`,
  },
  academy_c2_frontend: {
    label: "Academy C2 — Frontend Development",
    text: `ACADEMY C2 — FRONTEND DEVELOPMENT, 90 min.
Project deep-dive 00-08, weight 7%: 5-7 probes on one project, code opened, complex function.
L1 HTML & CSS 08-20, weight 11%: 6-8 Qs, one snippet.
L2 JavaScript 20-35, weight 15%: 6-8 Qs, one output-prediction, one async.
L3 React 35-47, weight 14%: 6-8 Qs, one rendering, one hooks-behaviour.
L3 Machine coding 47-1:12, weight 24%: core + stretch aloud, AI off, silent, time calls at 15 and 5 min, not dropped when candidate stalls.
Debug / code reading 1:12-1:20, weight 7%: predict before run, asks the cause.
L4 Production 1:20-1:30, weight 12%: only if L3 cleared.
Hint ladder applies throughout (L0 Nudge, L1 Direction, L2 Structure, L3 Rescue — see academy_c1_dsa).
A level counts only if every level below it is cleared — a skipped/cut-short section directly changes the certified level.`,
  },
  academy_c3_swe: {
    label: "Academy C3 — Software Engineering Fundamentals (max L3)",
    text: `ACADEMY C3 — SOFTWARE ENGINEERING FUNDAMENTALS (max L3), 90 min.
Intro & setup 00-05.
L1 Core CS (DBMS, OS, CN) 05-20, weight 14%: ~7 Qs.
L1 SQL task 20-35, weight 18%: tables given in writing, easy-medium, "cost on 5M rows", candidate writes it alone.
L2 OOP concepts 35-50, weight 16%: ~7 Qs.
L2 OOP design task 50-1:05, weight 18%: no code needed, "why inheritance vs composition", changes a requirement.
L3 Software design & clean code 1:05-1:17, weight 14%: DRY/KISS/YAGNI with nuance.
L3 Code review 1:17-1:27, weight 12%: framed as a teammate's PR, candidate finds issues first, security issue spotted?
Hint ladder applies throughout. A level counts only if every level below it is cleared.`,
  },
  academy_c4_backend: {
    label: "Academy C4 — Backend Development",
    text: `ACADEMY C4 — BACKEND DEVELOPMENT, 90 min.
Intro & setup 00-04: shared editor works.
Project / API deep-dive 04-11, weight 7%: code opened.
L1 Backend foundations 11-23, weight 11%: HTTP, REST, Express, middleware.
L1 CRUD endpoint task 23-38, weight 16%: requirements read, "done" defined, silent except halfway + 5 min, code runs.
L2 Database & Auth 38-51, weight 13%: MongoDB/Mongoose, JWT, bcrypt, validation.
L2 Debug / fix task 51-1:04, weight 15%: predict before run, asks the cause, counts defects found unprompted.
L3 Backend advanced 1:04-1:16, weight 14%: caching, queues, event loop, security, rate limiting.
L4 Production backend 1:16-1:26, weight 12%: only if L3 cleared.
Non-Node candidates: Spring Boot / Django equivalents — judge the concept, not the exact syntax.
Hint ladder applies throughout. A level counts only if every level below it is cleared.`,
  },
  academy_marks_fullstack: {
    label: "Academy — FE (Next.js+TS) / Python Full Stack (marks /100)",
    text: `ACADEMY — FE (NEXT.JS + TYPESCRIPT) OR PYTHON FULL STACK, 90 min, scored out of 100 (not level-based).
Project deep-dive: T1(Next.js) 00-07/7 marks, T2(Python FS) 00-07/7 marks — built vs team, architecture, complex function; if LLM used: what is sent, how output is checked.
Stack: T1 07-19/13 marks (Next.js + TS), T2 07-17/10 marks (FastAPI/Django) — scenarios over definitions.
SQL & DBMS: T1 19-29/12 marks, T2 17-29/13 marks — schema pasted, 2 query tasks written, ties/NULLs probed.
Gen AI: T1 29-41/13 marks, T2 29-41/13 marks — T1: where the LLM call lives; T2: one agent/tool-calling question; both: hallucination/eval.
Machine coding: T1 41-1:06/25 marks, T2 41-1:06/25 marks — core + stretch, silent, time calls at 15 and 5 min.
Debug: T1 1:06-1:12/5 marks, T2 1:06-1:12/5 marks — predict before run, asks for cause.
System design & deploy: T1 1:12-1:27/15 marks, T2 1:12-1:27/17 marks — candidate drives 8-10 min, 2-3 deployment probes.
Identify T1 vs T2 from the title/transcript stack (Next.js+TS vs FastAPI/Django) and score against the matching column.`,
  },
  irp_l1_frontend: {
    label: "IRP L1 Frontend TR",
    text: `IRP L1 FRONTEND TR (separate program), 60 min.
FE project (take-home), 15 min, 20 marks: app flow, 2 design choices, one small live change; AI used on the take-home = integrity flag, not "fine".
Concepts, 15 min, 30 marks: 10 questions at L1, in syllabus.
Live coding, 25 min, 40 marks: Counter / Todo / Login form / Search filter / Fetch users — full 25 min, one follow-up change.
Communication throughout, 10 marks.`,
  },
};

export const RUBRIC_OPTIONS = Object.entries(DEFAULT_RUBRICS).map(([key, { label }]) => ({ key, label }));
