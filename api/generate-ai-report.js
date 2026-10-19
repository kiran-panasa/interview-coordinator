import { getDb } from "./_lib/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

// POST /api/generate-ai-report
// Body: { transcriptText: string, candidateName: string, round: string, templateName?: string }
// Auth: "Authorization: Bearer <caller's Firebase ID token>" — the caller's
// own users/{uid} Firestore doc must have role === "admin".
//
// Alternate AI Report generator, alongside the existing Gemini path in the
// Apps Script project (Code.gs's "generateAiReport" action, triggered from
// InterviewsPage.jsx's handleViewAiReport). The transcript's actual TEXT
// content has to be fetched client-side first (Apps Script already has read
// access to the Google Doc transcript; this function has no Google
// credentials at all) and sent in the request body — this endpoint only
// turns that transcript into the same AiCandidateReport shape (src/types.ts)
// the UI already renders, so AiReportModal needs no changes either way.
//
// Returns the report WITHOUT generatedAt — the caller stamps that itself
// (matching the existing Gemini path's `{ ...result.report, generatedAt }`)
// right before writing interviews/{id}.aiReport.

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  try {
    const db = getDb();

    const header = req.headers.authorization || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ success: false, error: "unauthorized" });

    let callerUid;
    try {
      ({ uid: callerUid } = await getAuth().verifyIdToken(idToken));
    } catch {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      return res.status(403).json({ success: false, error: "forbidden", message: "Only an admin can generate AI reports." });
    }

    const { transcriptText, candidateName, round, templateName } = req.body || {};
    if (!transcriptText || !String(transcriptText).trim()) {
      return res.status(400).json({ success: false, error: "invalid_parameter", message: "transcriptText is required." });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "not_configured", message: "ANTHROPIC_API_KEY is not set." });
    }

    // Anthropic's Messages API currently allows roughly 170-200k input
    // tokens depending on the model; a transcript this long would still
    // likely blow the single-interview time budget, so this is a sanity
    // cap, not a precise token count.
    const MAX_TRANSCRIPT_CHARS = 400_000;
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
      return res.status(502).json({
        success: false, error: "anthropic_error",
        message: anthropicJson?.error?.message || `Anthropic API returned HTTP ${anthropicRes.status}.`,
      });
    }

    const toolUse = (anthropicJson.content || []).find(b => b.type === "tool_use" && b.name === "submit_interview_report");
    if (!toolUse) {
      return res.status(502).json({ success: false, error: "no_structured_output", message: "Claude didn't return a structured report." });
    }

    const parsed = toolUse.input || {};
    const report = {
      decision: parsed.decision,
      decisionLabel: DECISION_LABELS[parsed.decision] || parsed.decision,
      summary: parsed.summary || "",
      competencies: Array.isArray(parsed.competencies) ? parsed.competencies : [],
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      positiveObservations: Array.isArray(parsed.positiveObservations) ? parsed.positiveObservations : [],
      recommendation: parsed.recommendation || "",
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    };

    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error("generate-ai-report error:", err);
    return res.status(500).json({ success: false, error: "internal_error", message: err?.message || "Unexpected error." });
  }
}
