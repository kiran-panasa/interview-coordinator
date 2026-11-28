import { useState, useEffect } from "react";
import { subscribeToInterviewsInDateRange } from "../../api/firestore";
import type { Interview } from "../../types";

// Re-subscribes whenever dateFrom/dateTo change, so the admin Interviews
// page only ever reads the currently-selected date window instead of the
// full collection. See subscribeToInterviewsInDateRange in api/interviews.ts.
//
// Deliberately does NOT clear to [] the moment dateFrom/dateTo changes —
// that used to flash every KPI/table/count to zero on every switch (e.g.
// VendorAnalyticsPage's Day/Week/Month quick-picks) until the new range's
// snapshot arrived, which read as "stuck"/"not loading" even though a fresh
// query was already in flight. Left as the PREVIOUS range's rows until the
// new ones actually land is a brief, harmless overlap (onSnapshot still
// replaces them the moment real data for the new range arrives) and feels
// far more responsive than an empty flash on every click.
export function useInterviewsInDateRange(dateFrom: string, dateTo: string): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => {
    return subscribeToInterviewsInDateRange(dateFrom, dateTo, setInterviews);
  }, [dateFrom, dateTo]);
  return interviews;
}
