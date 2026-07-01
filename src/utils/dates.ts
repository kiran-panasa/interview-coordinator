export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = String(dateStr).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function formatDateShort(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString("en-GB");
}

export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function toInterviewDateTime(scheduledDate: string, hour: number, minute: number): Date {
  return new Date(
    `${scheduledDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}

export function isPast(dateOrIso: string | Date): boolean {
  return new Date(dateOrIso) < new Date();
}
