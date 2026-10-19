// Shared by the manual single-interview endpoint (generate-ai-report.js,
// called from InterviewsPage.jsx's "Generate with Claude" button) and the
// scheduled sweep (cron/generate-ai-reports.js) — one place for the actual
// Claude prompt/schema, so the two paths can never silently drift into
// producing different-quality or differently-shaped reports.

const ANTHROPIC_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_API_VERSION = "2023-06-01";

// Matches ASSESSMENT_CLS in src/features/interviews/AiReportModal.jsx — any
// other string renders with its default (gray) color, so the model is
// constrained to exactly these four.
const ASSESSMENT_LABELS = ["Needs Improvement", "Average", "Good", "Excellent"];

// decisionLabel mirrors DECISION_META in AiReportModal.jsx so a report from
// this path reads identically to one from the Gemini path — though the UI
// actually keys its badge text/color off `decision` alone, this is kept in
// sync for any other reader (exports, etc.) that might use the label field
// directly.
const DECISION_LABELS = {
  retake_tests:     "Needs Improvement — Retake Tests",
  retake_interview: "Average — Retake Interview",
  move_forward:     "Good — Move Forward",
};

const REPORT_TOOL = {
  name: "submit_interview_report",
  description: "Submit the structured candidate interview assessment report.",
  input_schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: Object.keys(DECISION_LABELS) },
      summary: { type: "string", description: "2-4 sentence overview of how the interview went." },
      competencies: {
        type: "array",
        description: "Per-skill-area assessment actually discussed in the transcript (e.g. Problem Solving, Communication, Technical Depth).",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            assessment: { type: "string", enum: ASSESSMENT_LABELS },
            observations: { type: "string", description: "1-2 sentences of specific, transcript-grounded evidence." },
          },
          required: ["name", "assessment", "observations"],
        },
      },
      reasons: { type: "array", items: { type: "string" }, description: "Specific reasons behind the decision, grounded in the transcript." },
      positiveObservations: { type: "array", items: { type: "string" }, description: "What the candidate did well, even if the overall decision wasn't 'move forward'." },
      recommendation: { type: "string", description: "1-2 sentence actionable recommendation for what happens next." },
      nextSteps: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, description: { type: "string" } },
          required: ["title", "description"],
        },
      },
    },
    required: ["decision", "summary", "competencies", "reasons", "positiveObservations", "recommendation", "nextSteps"],
  },
};

// Anthropic's Messages API currently allows roughly 170-200k input tokens
// depending on the model; a transcript this long would still likely blow
// a single invocation's time budget, so this is a sanity cap, not a
// precise token count.
const MAX_TRANSCRIPT_CHARS = 400_000;

// Throws on any failure (missing key, HTTP error, no structured output) —
// callers decide how that becomes an HTTP response (manual path) or a
// per-interview "failed" count (cron sweep). Returns the report WITHOUT
// generatedAt — the caller stamps that itself right before writing
// interviews/{id}.aiReport, matching the existing Gemini path's convention.
export async function generateReportWithClaude(transcriptText, { candidateName, round, templateName } = {}) {
  if (!transcriptText || !String(transcriptText).trim()) {
    throw new Error("transcriptText is required.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const transcript = String(transcriptText).slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt =
    `You are assessing a candidate's technical interview for "${round || templateName || "an interview round"}". ` +
    `The candidate's name is ${candidateName || "the candidate"}. Below is the raw interview transcript. ` +
    `Base every observation strictly on what's actually in the transcript — do not invent details. ` +
    `Call submit_interview_report with your assessment.\n\n--- TRANSCRIPT START ---\n${transcript}\n--- TRANSCRIPT END ---`;

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
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "submit_interview_report" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const anthropicJson = await anthropicRes.json();
  if (!anthropicRes.ok) {
    throw new Error(anthropicJson?.error?.message || `Anthropic API returned HTTP ${anthropicRes.status}.`);
  }

  const toolUse = (anthropicJson.content || []).find(b => b.type === "tool_use" && b.name === "submit_interview_report");
  if (!toolUse) throw new Error("Claude didn't return a structured report.");

  const parsed = toolUse.input || {};
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
