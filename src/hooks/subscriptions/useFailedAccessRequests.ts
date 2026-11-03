import { useState, useEffect } from "react";
import { subscribeToFailedAccessRequests } from "../../api/accessRequests";
import type { AccessRequestLog } from "../../api/accessRequests";

export function useFailedAccessRequests(): AccessRequestLog[] {
  const [logs, setLogs] = useState<AccessRequestLog[]>([]);
  useEffect(() => subscribeToFailedAccessRequests(setLogs), []);
  return logs;
}
