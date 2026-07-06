import { useState, useEffect } from "react";
import { subscribeToInterviews } from "../../api/firestore";
import type { Interview } from "../../types";

export function useInterviews(): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => subscribeToInterviews(setInterviews), []);
  return interviews;
}
