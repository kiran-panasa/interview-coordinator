// Shared between the client (TemplateLifecycleTab.jsx, as a placeholder/
// preview) and the server (api/sso-handler.js, as the real fallback used
// whenever a template has a maxAttempts cap but no custom message set) —
// kept in one place so the two never drift apart.
export const DEFAULT_ATTEMPT_LIMIT_MESSAGE =
  "You've reached the maximum number of attempts for this interview. Kindly contact your program support team for any concerns.";
