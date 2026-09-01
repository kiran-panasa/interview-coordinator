import { useState, useEffect } from "react";
import { subscribeToInterviewsInDateRange } from "../../api/firestore";
import type { Interview } from "../../types";

// Re-subscribes whenever dateFrom/dateTo change, so the admin Interviews
// page only ever reads the currently-selected date window instead of the
// full collection. See subscribeToInterviewsInDateRange in api/interviews.ts.
export function useInterviewsInDateRange(dateFrom: string, dateTo: string): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => {
    setInterviews([]); // avoid a flash of the previous range's stale rows
    return subscribeToInterviewsInDateRange(dateFrom, dateTo, setInterviews);
  }, [dateFrom, dateTo]);
  return interviews;
}
