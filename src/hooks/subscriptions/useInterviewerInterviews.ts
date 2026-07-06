import { useState, useEffect } from "react";
import { subscribeToInterviewerInterviews } from "../../api/firestore";
import type { Interview } from "../../types";

export function useInterviewerInterviews(email: string | undefined): Interview[] {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  useEffect(() => {
    if (!email) return;
    return subscribeToInterviewerInterviews(email, setInterviews);
  }, [email]);
  return interviews;
}
