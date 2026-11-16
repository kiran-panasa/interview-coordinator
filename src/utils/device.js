// A soft signal based on the browser's own user-agent — not a hard security
// boundary, and easily spoofed by anyone who actually wants to get around
// it (e.g. "Request Desktop Site"). Used only to gate the in-app "Join
// Meet" action so interviewers are nudged toward a laptop for the actual
// call; it has no effect on joining directly through Google Calendar or
// the Meet app, which this app has no way to reach into.
export function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || "";
  if (/android|iphone|ipod|mobile|iemobile|opera mini/i.test(ua)) return true;
  if (/ipad/i.test(ua)) return true;
  // Modern iPadOS Safari reports a desktop "Macintosh" user-agent by
  // default — a real Mac has no multi-touch, so that's the tell.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}
