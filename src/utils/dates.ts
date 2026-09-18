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

// Converts a "9:00 AM" / "09:00 PM" style label OR a 24-hour "HH:MM" label
// (scheduledTime is stored in whichever format the flow that set it used —
// an availability-slot pick stores 12-hour AM/PM, a native <input
// type="time"> stores 24-hour) to minutes-since-midnight. Silently returning
// 0 for an unrecognized format used to make a 24-hour input parse as
// midnight — e.g. addMinutesToTimeLabel("15:35", 60) came out "1:00 AM"
// instead of "4:35 PM" — so both formats are matched explicitly now instead
// of just one with a silent fallback.
export function timeToMinutes(label: string | null | undefined): number {
  if (!label) return 0;
  const ampm = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (ampm[3].toUpperCase() === "PM") h += 12;
    return h * 60 + parseInt(ampm[2], 10);
  }
  const hhmm = label.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
  return 0;
}

export function compareTimeLabels(a: string, b: string): number {
  return timeToMinutes(a) - timeToMinutes(b);
}

// "18:00" -> 1080 — for 24-hour "HH:MM" <input type="time"> values (as
// opposed to timeToMinutes above, which parses "3:00 PM" style labels).
export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// "3:00 PM" + 90 -> "4:30 PM", "15:35" + 60 -> "16:35" — used to show an
// interview's end time alongside its start time and duration. Output
// matches the input's own format (24-hour in, 24-hour out) so a "Start –
// End" range never mixes styles.
export function addMinutesToTimeLabel(label: string, minutesToAdd: number): string {
  const is24Hour = /^\d{1,2}:\d{2}$/.test((label || "").trim());
  const total = timeToMinutes(label) + minutesToAdd;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  if (is24Hour) {
    return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12; if (h === 0) h = 12;
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
