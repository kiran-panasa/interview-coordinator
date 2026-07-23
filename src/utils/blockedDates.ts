import type { BlockedDate } from "../types";

/** Returns the blocked-date range covering `dateStr` (YYYY-MM-DD), if any. */
export function findBlockedDate(dateStr: string, blockedDates: BlockedDate[]): BlockedDate | undefined {
  return blockedDates.find(b => dateStr >= b.startDate && dateStr <= b.endDate);
}

export function isDateBlocked(dateStr: string, blockedDates: BlockedDate[]): boolean {
  return !!findBlockedDate(dateStr, blockedDates);
}
