import { logError } from "./logger";

// Every onSnapshot() listener in this app previously had no error callback —
// when a listener's stream dies (most commonly: the tab sat backgrounded
// long enough for the auth token to go stale, or a genuine network drop),
// it fails silently. No error, no state update, nothing. Whatever `loading`
// flag was gating that page's UI never flips, so the page is frozen forever
// with no way to recover short of a full reload + re-login. This is the
// single choke point every onSnapshot call routes its error through, so the
// app can actually notice and react instead of going quietly unresponsive.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to be notified whenever any Firestore listener in the app errors out. */
export function onFirestoreListenerError(handler: Listener): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Call from the error callback of every onSnapshot(). */
export function reportFirestoreListenerError(label: string, error: unknown): void {
  logError(error, { label: `onSnapshot:${label}` });
  listeners.forEach(fn => fn());
}
