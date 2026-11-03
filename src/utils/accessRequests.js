// Collapses the raw per-attempt ssoTokenRequestLog rows (one per retry —
// Forms re-tries on its own, so the same student can show up dozens of
// times) into one row per userId, cross-referenced against which of those
// an admin has already marked resolved (accessRequestResolutions).
export function groupAccessRequests(logs, resolutions) {
  const resolvedByUserId = new Map(resolutions.map(r => [r.id, r]));
  const byUserId = new Map();

  logs.forEach(log => {
    if (!log.userId) return;
    const extra = parseRawBody(log.rawBody);
    const existing = byUserId.get(log.userId);
    if (!existing) {
      byUserId.set(log.userId, {
        userId:       log.userId,
        phone:        extra.phone || "",
        extra,
        firstAt:      log.at || "",
        lastAt:       log.at || "",
        attemptCount: 1,
      });
      return;
    }
    existing.attemptCount += 1;
    if (!existing.phone && extra.phone) existing.phone = extra.phone;
    if ((log.at || "") > existing.lastAt) existing.lastAt = log.at || "";
    if ((log.at || "") < existing.firstAt || !existing.firstAt) existing.firstAt = log.at || "";
  });

  return Array.from(byUserId.values())
    .map(entry => {
      const resolution = resolvedByUserId.get(entry.userId);
      return { ...entry, resolved: !!resolution, resolution: resolution || null };
    })
    .sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
}

// Forms' request body isn't documented beyond user_id, so this is a
// best-effort scrape of whatever else it happened to send (phone/mobile,
// occasionally name/email) — purely to help an admin recognize WHO this is
// without needing Firebase console access. Never throws on malformed JSON.
function parseRawBody(rawBody) {
  if (!rawBody) return {};
  try {
    const body = JSON.parse(rawBody);
    const phone = body.phone || body.mobile || body.phone_number || body.mobile_number || "";
    const name  = body.name || body.full_name || body.student_name || "";
    const email = body.email || body.student_email || "";
    return { phone, name, email };
  } catch {
    return {};
  }
}
