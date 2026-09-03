import { useState, useEffect } from "react";
import { subscribeToPendingInboundRequests } from "../../api/firestore";
import type { InboundRequest } from "../../types";

export function usePendingInboundRequests(): InboundRequest[] {
  const [requests, setRequests] = useState<InboundRequest[]>([]);
  useEffect(() => subscribeToPendingInboundRequests(setRequests), []);
  return requests;
}
