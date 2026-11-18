import { Component } from "react";
import { terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { logError } from "../utils/logger";
import { db } from "../firebase";
import Button from "./Button";

// After a new deploy, the previously-loaded page still references the old
// build's hashed chunk filenames — any route the user hasn't visited yet
// tries to lazy-import a file that no longer exists on the server, and
// fails with one of these messages (wording varies slightly by browser).
// Resetting local error state (the old "Try again" behavior) re-attempts
// the exact same stale URL and fails again; only a full reload fetches the
// current index.html/asset manifest and actually fixes it.
const CHUNK_LOAD_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

// A known, rare firebase-js-sdk bug class: the persistent IndexedDB cache
// this app uses (see src/firebase.js, persistentLocalCache) gets into a
// state the SDK itself can't recover from, and every further Firestore call
// in that tab throws this same internal assertion forever — a plain reload
// re-opens the SAME corrupted local database and can hit it again
// immediately, which is why retrying "so many times" sometimes doesn't help.
// The documented recovery is to actually wipe that local cache (not just
// reload), so the next load starts from a clean one.
const FIRESTORE_INTERNAL_ERROR_RE = /FIRESTORE.*INTERNAL ASSERTION FAILED/i;

async function recoverFromFirestoreCorruption() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Best-effort — even if termination or the clear itself fails (e.g.
    // other listeners still attached), the reload below is still worth
    // doing on its own.
  } finally {
    window.location.reload();
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError(error, { label: "ErrorBoundary", componentStack: info.componentStack });
    const isChunkLoadError = CHUNK_LOAD_ERROR_RE.test(error?.message || "");
    // One auto-reload attempt per tab session — avoids a reload loop if the
    // failure turns out to be something else (e.g. a real network outage).
    if (isChunkLoadError && !sessionStorage.getItem("chunkReloadAttempted")) {
      sessionStorage.setItem("chunkReloadAttempted", "1");
      window.location.reload();
      return;
    }
    const isFirestoreInternalError = FIRESTORE_INTERNAL_ERROR_RE.test(error?.message || "");
    if (isFirestoreInternalError && !sessionStorage.getItem("firestoreRecoveryAttempted")) {
      sessionStorage.setItem("firestoreRecoveryAttempted", "1");
      recoverFromFirestoreCorruption();
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      const isChunkLoadError = CHUNK_LOAD_ERROR_RE.test(this.state.error.message || "");
      const isFirestoreInternalError = FIRESTORE_INTERNAL_ERROR_RE.test(this.state.error.message || "");
      // The reload above already fires from componentDidCatch the first time
      // this is seen this session, so reaching render with it still set
      // means that auto-recovery attempt itself didn't resolve it — offer a
      // manual retry of the same clear-cache-and-reload instead of a plain
      // "Try again" that would just hit the same corrupted local cache again.
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-fade-in">
          <div className="w-full max-w-sm flex flex-col items-center bg-white border border-gray-100 rounded-[1.75rem] shadow-card px-8 py-10">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.8} />
            </div>
            <p className="text-gray-900 font-semibold mb-1">
              {isChunkLoadError ? "A new version is available"
                : isFirestoreInternalError ? "Local data needs a reset"
                : "Something went wrong"}
            </p>
            <p className="text-sm text-gray-400 mb-6 max-w-xs">
              {isChunkLoadError
                ? "This page was open during an app update. Reload to get the latest version."
                : isFirestoreInternalError
                ? "This device's offline cache got into a bad state. Clearing it should fix this."
                : (this.state.error.message || "An unexpected error occurred.")}
            </p>
            <Button
              variant="primary"
              icon={RotateCcw}
              onClick={() => isChunkLoadError ? window.location.reload()
                : isFirestoreInternalError ? recoverFromFirestoreCorruption()
                : this.setState({ error: null })}
            >
              {isChunkLoadError ? "Reload" : isFirestoreInternalError ? "Clear cache & reload" : "Try again"}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
