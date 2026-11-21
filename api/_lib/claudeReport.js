// Shared by the manual single-interview endpoint (generate-ai-report.js,
// called from InterviewsPage.jsx's "Generate with Claude" button) and the
// scheduled sweep (cron/generate-ai-reports.js) — one place for the actual
// prompt/schema, so the two paths can never silently drift into producing
// different-quality or differently-shaped reports.

import { callGeminiJson } from "./geminiClient.js";

// Matches ASSESSMENT_CLS in src/features/interviews/AiReportModal.jsx — any
// other string renders with its default (gray) color, so the model is
// constrained to exactly these four.
const ASSESSMENT_LABELS = ["Needs Improvement", "Average", "Good", "Excellent"];

// decisionLabel mirrors DECISION_META in AiReportModal.jsx so a report from
// this path reads identically to one from the other Gemini path — though
// the UI actually keys its badge text/color off `decision` alone, this is
// kept in sync for any other reader (exports, etc.) that might use the
// label field directly.
const DECISION_LABELS = {
  retake_tests:     "Needs Improvement — Retake Tests",
  retake_interview: "Average — Retake Interview",
  move_forward:     "Good — Move Forward",
};

// Gemini's own context window handles far more than this, but a transcript
// this long would still likely blow a single invocation's time budget, so
// this is a sanity cap, not a precise token count.
const MAX_TRANSCRIPT_CHARS = 400_000;

// Throws on any failure (missing key, HTTP error, no parseable JSON) —
// callers decide how that becomes an HTTP response (manual path) or a
// per-interview "failed" count (cron sweep). Returns the report WITHOUT
// generatedAt — the caller stamps that itself right before writing
// interviews/{id}.aiReport, matching the existing Gemini path's convention.
export async function generateCandidateReport(transcriptText, { candidateName, round, templateName } = {}) {
  if (!transcriptText || !String(transcriptText).trim()) {
    throw new Error("transcriptText is required.");
  }

  const transcript = String(transcriptText).slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt =
    `You are an expert technical interview evaluator. Analyze the interview transcript below for candidate "${candidateName || "the candidate"}" ` +
    `(Round: ${round || templateName || "an interview round"}).\n\n` +
    `Base every observation strictly on what's actually in the transcript — do not invent details.\n\n` +
    `Respond with ONLY raw JSON (no markdown fences, no extra text) matching this exact shape:\n` +
    `{\n` +
    `  "decision": "retake_tests" | "retake_interview" | "move_forward",\n` +
    `  "summary": "2-4 sentence overview of how the interview went",\n` +
    `  "competencies": [ { "name": "...", "assessment": "Needs Improvement"|"Average"|"Good"|"Excellent", "observations": "1-2 sentences of specific, transcript-grounded evidence" } ],\n` +
    `  "reasons": ["specific reasons behind the decision, grounded in the transcript"],\n` +
    `  "positiveObservations": ["what the candidate did well, even if the overall decision wasn't move forward"],\n` +
    `  "recommendation": "1-2 sentence actionable recommendation for what happens next",\n` +
    `  "nextSteps": [ { "title": "...", "description": "..." } ]\n` +
    `}\n` +
    `Use an empty array for any list with nothing to report — never omit a field.\n\n` +
    `--- TRANSCRIPT START ---\n${transcript}\n--- TRANSCRIPT END ---`;

  const parsed = await callGeminiJson(prompt);

  return {
    decision: parsed.decision,
    decisionLabel: DECISION_LABELS[parsed.decision] || parsed.decision,
    summary: parsed.summary || "",
    competencies: Array.isArray(parsed.competencies) ? parsed.competencies : [],
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    positiveObservations: Array.isArray(parsed.positiveObservations) ? parsed.positiveObservations : [],
    recommendation: parsed.recommendation || "",
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
  };
}
