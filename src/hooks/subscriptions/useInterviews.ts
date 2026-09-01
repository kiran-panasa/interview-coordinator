import { useState, useEffect } from "react";
import { subscribeToInterviews } from "../../api/firestore";
import type { Interview } from "../../types";

// `enabled` lets a consumer with multiple tabs (e.g. NudgePage's Analytics
// tab) only pay for this unscoped, whole-collection live listener while a
// tab that actually needs it is active.
export function useInterviews(enabled: boolean = true): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => {
    if (!enabled) { setInterviews([]); return; }
    return subscribeToInterviews(setInterviews);
  }, [enabled]);
  return interviews;
}
