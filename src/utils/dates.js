// YYYY-MM-DD → DD/MM/YYYY
export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = String(dateStr).split("-");
  return `${d}/${m}/${y}`;
}

// YYYY-MM-DD → "Wednesday, 1 July 2026"
export function formatDateLong(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ISO string → "01/07/2026"
export function formatDateShort(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString("en-GB");
}

// ISO string → "01/07/2026, 10:30"
export function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Combine interview scheduledDate (YYYY-MM-DD) + hour + minute into a Date object
export function toInterviewDateTime(scheduledDate, hour, minute) {
  return new Date(
    `${scheduledDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}

// True if the given date/ISO string is in the past
export function isPast(dateOrIso) {
  return new Date(dateOrIso) < new Date();
}
