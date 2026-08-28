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

// All interview times are scheduled and displayed in IST — parsed with an
// explicit +05:30 offset so the resulting instant is correct regardless of
// the viewer's own machine/browser timezone. Without this, a device whose
// OS timezone isn't IST would compare against the wrong moment (e.g. the
// "past interview time" gate on the Interviewer Portal's "Mark as Completed"
// button silently staying wrong for hours).
export function toInterviewDateTime(scheduledDate: string, hour: number, minute: number): Date {
  return new Date(
    `${scheduledDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`
  );
}

export function isPast(dateOrIso: string | Date): boolean {
  return new Date(dateOrIso) < new Date();
}

// Converts a "9:00 AM" / "09:00 PM" style label to minutes-since-midnight so
// 12-hour time labels sort chronologically instead of alphabetically (plain
// string sort puts "10:00 AM" before "9:00 AM" and "1:00 PM" before "12:00 PM").
export function timeToMinutes(label: string | null | undefined): number {
  if (!label) return 0;
  const m = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + parseInt(m[2], 10);
}

export function compareTimeLabels(a: string, b: string): number {
  return timeToMinutes(a) - timeToMinutes(b);
}

// "3:00 PM" + 90 -> "4:30 PM" — used to show an interview's end time
// alongside its start time and duration.
export function addMinutesToTimeLabel(label: string, minutesToAdd: number): string {
  const total = timeToMinutes(label) + minutesToAdd;
  const wrapped = ((total % 1440) + 1440) % 1440;
  let h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function parseInterviewStart(scheduledDate: string, scheduledTime: string): Date | null {
  if (!scheduledDate || !scheduledTime) return null;
  try {
    const match = scheduledTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const min = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return toInterviewDateTime(scheduledDate, h, min);
  } catch { return null; }
}
