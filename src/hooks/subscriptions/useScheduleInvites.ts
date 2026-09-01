import { useState, useEffect } from "react";
import { subscribeToScheduleInvites } from "../../api/firestore";
import type { ScheduleInvite } from "../../types";

// `enabled` lets a consumer with multiple tabs (e.g. NudgePage) only pay for
// this unscoped, whole-collection live listener while a tab that actually
// needs it is active, instead of reading the entire scheduleInvites
// collection on every page mount regardless of which tab is showing.
export function useScheduleInvites(enabled: boolean = true): ScheduleInvite[] {
  const [invites, setInvites] = useState<ScheduleInvite[]>([]);
  useEffect(() => {
    if (!enabled) { setInvites([]); return; }
    return subscribeToScheduleInvites(setInvites);
  }, [enabled]);
  return invites;
}
