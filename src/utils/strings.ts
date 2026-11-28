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

// Candidate add/edit and CSV import previously accepted any text at all into
// the email field with zero validation — not even the browser's native
// type="email" check, since both save paths call handleSave from a plain
// button click, never a real <form> submit. A candidate record ended up
// with the literal 4-character string "null" stored as its email (likely
// typed by hand, or pasted from a spreadsheet cell whose missing value
// exported as that literal text) — truthy, so it silently passed every
// "is an email present" check downstream, including the self-book
// confirmSelfBooking guard, and got snapshotted onto an interview as
// candidateEmail: "null" forever (snapshots are never retroactively
// corrected when the candidate's own record is fixed later — same as
// candidateName/candidateUid elsewhere in this app). Blank is still valid
// (email is optional) — this only rejects a NON-BLANK value that isn't a
// real email shape, these placeholder words specifically included.
const EMAIL_PLACEHOLDER_WORDS = new Set(["null", "undefined", "n/a", "na", "none", "nil", "-"]);
export function looksLikeValidEmail(value?: string | null): boolean {
  const v = (value || "").trim();
  if (!v) return true;
  if (EMAIL_PLACEHOLDER_WORDS.has(v.toLowerCase())) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

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
  "bg-brand-100 text-brand-700",
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

/** "1st Attempt", "2nd Attempt", "3rd Attempt", "4th Attempt", ... — pass a
 *  different `label` (e.g. "Try") for contexts that count differently than
 *  the formal attempt-limit number (completed interviews only). */
export function ordinalLabel(n: number, label = "Attempt"): string {
  const v = n % 100;
  const suffix = (v >= 11 && v <= 13) ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th");
  return `${n}${suffix} ${label}`;
}
