// Shared between the client (TemplateLifecycleTab.jsx, as a placeholder/
// preview) and the server (api/sso-handler.js, as the real fallback used
// whenever a template has a maxAttempts cap but no custom message set) —
// kept in one place so the two never drift apart.
export const DEFAULT_ATTEMPT_LIMIT_MESSAGE =
  "You've reached the maximum number of attempts for this interview. Kindly contact your program support team for any concerns.";

// Shown in place of the AI Report / Final Score on a completed interview
// when a template has showScoreToStudent set to false and no custom
// hiddenScoreMessage of its own.
export const DEFAULT_HIDDEN_SCORE_MESSAGE =
  "Check with program support for completing scoring details.";
