import { useEffect, useRef, useState } from "react";

/**
 * Debounced autosave: calls save(data) `delay`ms after the last change to `data`.
 * Skips the initial mount so loading existing data doesn't trigger an immediate write.
 */
export function useAutosaveDraft(data, save, { delay = 2500, enabled = true } = {}) {
  const [status, setStatus] = useState("idle"); // idle | pending | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const timerRef = useRef(null);
  const firstRun = useRef(true);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) { firstRun.current = false; return; }

    setStatus("pending");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await save(dataRef.current);
        setStatus("saved");
        setLastSavedAt(Date.now());
      } catch {
        setStatus("error");
      }
    }, delay);

    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, enabled]);

  return { status, lastSavedAt };
}
