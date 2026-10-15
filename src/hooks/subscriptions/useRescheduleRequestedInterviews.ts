import { useState, useEffect } from "react";
import { subscribeToRescheduleRequestedInterviews } from "../../api/firestore";
import type { Interview } from "../../types";

export function useRescheduleRequestedInterviews(): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => subscribeToRescheduleRequestedInterviews(setInterviews), []);
  return interviews;
}
