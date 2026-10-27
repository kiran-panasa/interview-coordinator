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

// Unlike DEFAULT_ATTEMPT_LIMIT_MESSAGE above (opt-in — a template with no
// maxAttempts set has no cap at all), the no-show limit is on by default —
// a template that's never had maxNoShows touched still enforces this count,
// so every template is protected out of the box rather than needing an
// admin to remember to turn it on. See effectiveMaxNoShows in
// api/sso-handler.js.
export const DEFAULT_NO_SHOW_LIMIT = 2;
export const DEFAULT_NO_SHOW_BLOCKED_MESSAGE =
  "You've been blocked from booking this interview after repeatedly not showing up for it. Kindly contact your program support team for any concerns.";
