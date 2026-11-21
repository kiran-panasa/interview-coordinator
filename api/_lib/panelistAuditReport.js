// Generates a panelist (interviewer) conduct audit — completely separate
// from claudeReport.js, which assesses the CANDIDATE. Shared by the
// automatic sweep (aiReportSweep.js, runs alongside the existing
// candidate-report sweep on the same already-fetched transcript) and the
// manual "safety net" single-interview trigger (generate-ai-report.js's
// reportType: "panelist" branch).
//
// Mirrors claudeReport.js's own shape deliberately (same model, same
// JSON-extraction pattern) so the two paths never drift.

import { UNIVERSAL_CHECKLIST, SEVERITY_AND_VERDICT, OUTPUT_INSTRUCTIONS, TONE_INTERNAL, TONE_EXTERNAL } from "./panelistAuditRubrics.js";
import { callGeminiJson } from "./geminiClient.js";

const MAX_TRANSCRIPT_CHARS = 400_000;

const VERDICTS = ["good_to_continue", "continue_after_feedback", "not_yet_pause_solo"];

/**
 * @param {string} transcriptText
 * @param {object} ctx
 * @param {string} ctx.rubricKey - which rubric this audit is FOR (stored on the result, not looked up internally)
 * @param {string} ctx.rubricLabel - resolved by the caller (resolveRubricText in panelistAuditRubrics.js — Firestore override or default)
 * @param {string} ctx.rubricText - resolved by the caller, same as rubricLabel
 * @param {string} ctx.panelistName
 * @param {string} ctx.panelistEmail
 * @param {string} ctx.round
 * @param {string} ctx.templateName
 * @param {string[]} [ctx.priorFindings] - short strings summarizing this SAME panelist's recent Critical/Fix findings, oldest first, for repeat-issue escalation
 */
export async function generatePanelistAudit(transcriptText, ctx = {}) {
  const { rubricKey, rubricLabel, rubricText, panelistName, panelistEmail, round, templateName, priorFindings = [] } = ctx;
  if (!transcriptText || !String(transcriptText).trim()) {
    throw new Error("transcriptText is required.");
  }
  if (!rubricText) {
    throw new Error("No panelist audit rubric text resolved — assign/configure one on this interview's template first.");
  }
  const rubric = { label: rubricLabel || rubricKey, text: rubricText };

  const isInternal = /@nxtwave\.co\.in$/i.test(String(panelistEmail || ""));
  const toneBlock = isInternal ? TONE_INTERNAL : TONE_EXTERNAL;

  const priorFindingsBlock = priorFindings.length
    ? `\n\nPRIOR FINDINGS FOR THIS SAME PANELIST (oldest first — check for repeats; a repeated issue escalates Fix to Critical):\n${priorFindings.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
    : "";

  const transcript = String(transcriptText).slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt =
    `You are auditing a PANELIST'S CONDUCT of a technical interview — never the candidate's performance. ` +
    `Panelist: ${panelistName || "the panelist"}. Round: "${round || templateName || "an interview round"}".\n\n` +
    `${UNIVERSAL_CHECKLIST}\n\n` +
    `TRACK-SPECIFIC RUBRIC (${rubric.label}):\n${rubric.text}\n\n` +
    `${SEVERITY_AND_VERDICT}\n\n` +
    `${OUTPUT_INSTRUCTIONS}\n\n` +
    `${toneBlock}` +
    `${priorFindingsBlock}\n\n` +
    `Base every finding strictly on what's actually in the transcript below — do not invent details.\n\n` +
    `Respond with ONLY raw JSON (no markdown fences, no extra text) matching this exact shape:\n` +
    `{\n` +
    `  "verdict": "good_to_continue" | "continue_after_feedback" | "not_yet_pause_solo",\n` +
    `  "verdictReason": "One-line reason for the verdict, e.g. '1 Critical, 2 Fix'",\n` +
    `  "criticalFindings": [ { "issue": "...", "quote": "a short, exact line from the transcript as evidence", "timestamp": "..." } ],\n` +
    `  "checkRecordingItems": ["things that need a human to verify against the actual recording — unclear transcript, profanity, odd lines"],\n` +
    `  "remarks": [ { "area": "...", "whatHappened": "facts, with a timestamp", "severity": "good"|"fix"|"critical", "remark": "..." } ],\n` +
    `  "wrongAnswersPassed": ["each as 'question — candidate said X, correct is Y'"],\n` +
    `  "strengths": ["2-3 specific, real strengths for the final message — required even on a poor verdict"],\n` +
    `  "nextSteps": [ { "action": "...", "example": "one example from THIS round" } ],\n` +
    `  "finalMessage": "the complete, ready-to-send message to the panelist — greeting through sign-off, tone exactly as instructed, strengths first then next steps, no score/result/other-panelist mentions"\n` +
    `}\n` +
    `One remark per section of the track's rubric that was actually reached. Use an empty array for any list with nothing to report — never omit a field.\n\n` +
    `--- TRANSCRIPT START ---\n${transcript}\n--- TRANSCRIPT END ---`;

  const parsed = await callGeminiJson(prompt);

  return {
    rubricKey,
    rubricLabel: rubric.label,
    verdict: VERDICTS.includes(parsed.verdict) ? parsed.verdict : "continue_after_feedback",
    verdictReason: parsed.verdictReason || "",
    criticalFindings: Array.isArray(parsed.criticalFindings) ? parsed.criticalFindings : [],
    checkRecordingItems: Array.isArray(parsed.checkRecordingItems) ? parsed.checkRecordingItems : [],
    remarks: Array.isArray(parsed.remarks) ? parsed.remarks : [],
    wrongAnswersPassed: Array.isArray(parsed.wrongAnswersPassed) ? parsed.wrongAnswersPassed : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    finalMessage: parsed.finalMessage || "",
  };
}
