// Generates a panelist (interviewer) conduct audit — completely separate
// from claudeReport.js, which assesses the CANDIDATE. Shared by the
// automatic sweep (panelistAuditSweep.js, runs alongside the existing
// candidate-report sweep on the same already-fetched transcript) and the
// manual "safety side" single-interview endpoint
// (generate-panelist-audit.js).
//
// Mirrors claudeReport.js's own shape deliberately (same model, same
// tool-forced structured-output pattern) so the two paths never drift.

import { UNIVERSAL_CHECKLIST, SEVERITY_AND_VERDICT, OUTPUT_INSTRUCTIONS, TONE_INTERNAL, TONE_EXTERNAL, RUBRICS } from "./panelistAuditRubrics.js";

const ANTHROPIC_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MAX_TRANSCRIPT_CHARS = 400_000;

const VERDICTS = ["good_to_continue", "continue_after_feedback", "not_yet_pause_solo"];
const SEVERITIES = ["good", "fix", "critical"];

const AUDIT_TOOL = {
  name: "submit_panelist_audit",
  description: "Submit the structured panelist conduct audit for this interview.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: VERDICTS },
      verdictReason: { type: "string", description: "One-line reason for the verdict, e.g. '1 Critical, 2 Fix'." },
      criticalFindings: {
        type: "array",
        description: "Every Critical-severity issue found. Empty array if none.",
        items: {
          type: "object",
          properties: {
            issue: { type: "string" },
            quote: { type: "string", description: "A short, exact line from the transcript as evidence." },
            timestamp: { type: "string" },
          },
          required: ["issue", "quote", "timestamp"],
        },
      },
      checkRecordingItems: {
        type: "array",
        items: { type: "string" },
        description: "Things that need a human to verify against the actual recording (unclear transcript, profanity, odd lines). Empty array if none.",
      },
      remarks: {
        type: "array",
        description: "One row per section of the track's rubric that was actually reached.",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            whatHappened: { type: "string", description: "Facts, with a timestamp." },
            severity: { type: "string", enum: SEVERITIES },
            remark: { type: "string" },
          },
          required: ["area", "whatHappened", "severity", "remark"],
        },
      },
      wrongAnswersPassed: {
        type: "array",
        items: { type: "string" },
        description: "Each as 'question — candidate said X, correct is Y'. Empty array if none.",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "2-3 specific, real strengths for the final message — required even on a poor verdict.",
      },
      nextSteps: {
        type: "array",
        description: "Max 7, ordered by severity. Each is an action plus one example from THIS round.",
        items: {
          type: "object",
          properties: { action: { type: "string" }, example: { type: "string" } },
          required: ["action", "example"],
        },
      },
      finalMessage: {
        type: "string",
        description: "The complete, ready-to-send message to the panelist — greeting through sign-off, tone exactly as instructed, strengths first then next steps, no score/result/other-panelist mentions.",
      },
    },
    required: ["verdict", "verdictReason", "criticalFindings", "checkRecordingItems", "remarks", "wrongAnswersPassed", "strengths", "nextSteps", "finalMessage"],
  },
};

/**
 * @param {string} transcriptText
 * @param {object} ctx
 * @param {string} ctx.rubricKey - one of panelistAuditRubrics.js's RUBRICS keys
 * @param {string} ctx.panelistName
 * @param {string} ctx.panelistEmail
 * @param {string} ctx.round
 * @param {string} ctx.templateName
 * @param {string[]} [ctx.priorFindings] - short strings summarizing this SAME panelist's recent Critical/Fix findings, oldest first, for repeat-issue escalation
 */
export async function generatePanelistAuditWithClaude(transcriptText, ctx = {}) {
  const { rubricKey, panelistName, panelistEmail, round, templateName, priorFindings = [] } = ctx;
  if (!transcriptText || !String(transcriptText).trim()) {
    throw new Error("transcriptText is required.");
  }
  const rubric = RUBRICS[rubricKey];
  if (!rubric) {
    throw new Error(`No panelist audit rubric configured for key "${rubricKey}" — assign one on this interview's template first.`);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

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
    `Base every finding strictly on what's actually in the transcript below — do not invent details. ` +
    `Call submit_panelist_audit with your completed audit.\n\n--- TRANSCRIPT START ---\n${transcript}\n--- TRANSCRIPT END ---`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      tools: [AUDIT_TOOL],
      tool_choice: { type: "tool", name: "submit_panelist_audit" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const anthropicJson = await anthropicRes.json();
  if (!anthropicRes.ok) {
    throw new Error(anthropicJson?.error?.message || `Anthropic API returned HTTP ${anthropicRes.status}.`);
  }

  const toolUse = (anthropicJson.content || []).find(b => b.type === "tool_use" && b.name === "submit_panelist_audit");
  if (!toolUse) throw new Error("Claude didn't return a structured audit.");

  const parsed = toolUse.input || {};
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
