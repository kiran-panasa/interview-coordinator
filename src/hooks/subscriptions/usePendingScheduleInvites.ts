import { useState, useEffect } from "react";
import { subscribeToPendingScheduleInvites } from "../../api/firestore";
import type { ScheduleInvite } from "../../types";

export function usePendingScheduleInvites(): ScheduleInvite[] {
  const [invites, setInvites] = useState<ScheduleInvite[]>([]);
  useEffect(() => subscribeToPendingScheduleInvites(setInvites), []);
  return invites;
}
