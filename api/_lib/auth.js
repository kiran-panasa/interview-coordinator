import { timingSafeEqual } from "node:crypto";

// Constant-time comparison so a wrong token can't be brute-forced faster by
// timing how quickly the comparison fails (early-exit string ===  would leak
// how many leading characters matched).
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates the Authorization: Bearer <token> header against
 * ACADEMY_SYNC_API_TOKEN. Returns null if valid, or an { status, body }
 * pair to send back if not.
 */
export function checkBearerAuth(req) {
  const expected = process.env.ACADEMY_SYNC_API_TOKEN;
  if (!expected) {
    return { status: 500, body: { success: false, error: "server_misconfigured", message: "ACADEMY_SYNC_API_TOKEN is not configured." } };
  }

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { status: 401, body: { success: false, error: "unauthorized", message: "Missing or malformed Authorization header. Expected: Bearer <token>." } };
  }

  const provided = match[1].trim();
  if (!safeEqual(provided, expected)) {
    return { status: 401, body: { success: false, error: "unauthorized", message: "Invalid bearer token." } };
  }

  return null;
}
