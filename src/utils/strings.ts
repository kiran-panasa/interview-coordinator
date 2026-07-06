/**
 * Shared string utilities.
 * Import from here — do not define local copies in components or pages.
 */

/** Mask an email address for display: "ab***z@domain.com" */
export function maskEmail(email = ""): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.slice(0, 2) + "***" + (local.length > 4 ? local.slice(-1) : "");
  return `${masked}@${domain}`;
}

/** Returns true if the string looks like a UUID v4. */
export const isUUID = (s?: string | null): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");

/** Convert a label string to a lowercase_underscore slug (max 40 chars). */
export function slugify(label: string): string {
  return (label || "")
    .toLowerCase()
    .replace(/[–—]/g, "_")
    .replace(/[^a-z0-9\s_]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "field";
}

/** Extract up to 2 initials from a display name, falling back to email. */
export function initials(name?: string, email?: string): string {
  return (name || email || "?")
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

/** Deterministic Tailwind colour class derived from a user ID. */
export function avatarColor(id?: string): string {
  let n = 0;
  for (const ch of (id || "")) n += ch.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
