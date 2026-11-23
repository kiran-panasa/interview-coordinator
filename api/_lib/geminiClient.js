// Shared Gemini call for both server-side report generators (candidateReport.js,
// panelistAuditReport.js) — same REST endpoint and JSON-extraction pattern
// Code.gs's own callGemini_ already uses successfully for the original
// candidate AI report, so this reuses a free-tier-friendly model instead of
// a paid Anthropic key. GEMINI_API_KEY is a server-side Vercel env var (no
// VITE_ prefix) — get one free at aistudio.google.com/apikey, or reuse the
// value already stored in the Apps Script project's Script Properties.

const GEMINI_MODEL = "gemini-3.6-flash";

export async function callGeminiJson(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Gemini API returned HTTP ${res.status}.`);
    // Free-tier daily request cap (429 RESOURCE_EXHAUSTED) — distinguished
    // from a real failure so callers can stop burning through the rest of
    // a batch hitting the same wall and just let tomorrow's sweep pick the
    // rest up automatically, instead of logging every remaining interview
    // as individually "failed".
    if (res.status === 429) err.quotaExceeded = true;
    throw err;
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content returned from Gemini.");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from Gemini's response.");
  return JSON.parse(jsonMatch[0]);
}
