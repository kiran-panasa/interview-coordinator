import { useState, useEffect } from "react";
import { subscribeToInboundRequests } from "../../api/firestore";
import type { InboundRequest } from "../../types";

export function useInboundRequests(): InboundRequest[] {
  const [requests, setRequests] = useState<InboundRequest[]>([]);
  useEffect(() => subscribeToInboundRequests(setRequests), []);
  return requests;
}
