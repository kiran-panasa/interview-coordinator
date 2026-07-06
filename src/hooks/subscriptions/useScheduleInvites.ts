import { useState, useEffect } from "react";
import { subscribeToScheduleInvites } from "../../api/firestore";
import type { ScheduleInvite } from "../../types";

export function useScheduleInvites(): ScheduleInvite[] {
  const [invites, setInvites] = useState<ScheduleInvite[]>([]);
  useEffect(() => subscribeToScheduleInvites(setInvites), []);
  return invites;
}
