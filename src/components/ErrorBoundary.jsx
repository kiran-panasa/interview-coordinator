import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { logError } from "../utils/logger";
import Button from "./Button";

// After a new deploy, the previously-loaded page still references the old
// build's hashed chunk filenames — any route the user hasn't visited yet
// tries to lazy-import a file that no longer exists on the server, and
// fails with one of these messages (wording varies slightly by browser).
// Resetting local error state (the old "Try again" behavior) re-attempts
// the exact same stale URL and fails again; only a full reload fetches the
// current index.html/asset manifest and actually fixes it.
const CHUNK_LOAD_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

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
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      const isChunkLoadError = CHUNK_LOAD_ERROR_RE.test(this.state.error.message || "");
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-fade-in">
          <div className="w-full max-w-sm flex flex-col items-center bg-white border border-gray-100 rounded-2xl shadow-card px-8 py-10">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.8} />
            </div>
            <p className="text-gray-900 font-semibold mb-1">
              {isChunkLoadError ? "A new version is available" : "Something went wrong"}
            </p>
            <p className="text-sm text-gray-400 mb-6 max-w-xs">
              {isChunkLoadError
                ? "This page was open during an app update. Reload to get the latest version."
                : (this.state.error.message || "An unexpected error occurred.")}
            </p>
            <Button
              variant="primary"
              icon={RotateCcw}
              onClick={() => isChunkLoadError
                ? window.location.reload()
                : this.setState({ error: null })}
            >
              {isChunkLoadError ? "Reload" : "Try again"}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
