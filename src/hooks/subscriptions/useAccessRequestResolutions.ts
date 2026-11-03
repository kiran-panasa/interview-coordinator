import { useState, useEffect } from "react";
import { subscribeToAccessRequestResolutions } from "../../api/accessRequests";
import type { AccessRequestResolution } from "../../api/accessRequests";

export function useAccessRequestResolutions(): AccessRequestResolution[] {
  const [resolutions, setResolutions] = useState<AccessRequestResolution[]>([]);
  useEffect(() => subscribeToAccessRequestResolutions(setResolutions), []);
  return resolutions;
}
