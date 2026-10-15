import { useState, useEffect } from "react";
import { subscribeToRescheduleApprovedInterviews } from "../../api/firestore";
import type { Interview } from "../../types";

export function useRescheduleApprovedInterviews(): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => subscribeToRescheduleApprovedInterviews(setInterviews), []);
  return interviews;
}
