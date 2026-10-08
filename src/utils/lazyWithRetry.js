import { lazy } from "react";

// A route's lazy chunk filename is content-hashed — after a new deploy, a
// browser that still has the OLD page shell cached will ask for a chunk
// hash that no longer exists on the server. That import() rejects, and
// since nothing catches it, the route's Suspense fallback ("Loading…")
// just sits there forever — this is "panelists reporting the app stuck on
// Loading, but incognito (no cache) works fine." One reload fetches the
// current index.html and its matching chunk manifest, fixing every route
// at once, not just the one that happened to fail first.
const RELOAD_FLAG = "app-chunk-reload-attempted";

export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const mod = await importer();
      // A later real failure (e.g. after a NEXT deploy) should still get
      // its own reload attempt, not be silently skipped because of a flag
      // left over from a successful load earlier in the session.
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* storage blocked — fall through to reload once */ }
      if (!alreadyReloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* ignore */ }
        window.location.reload();
        // The reload is already underway — never resolve, so React doesn't
        // try to render an error in the instant before the page unloads.
        return new Promise(() => {});
      }
      // Already reloaded once this session and it's still failing — a real
      // error (bad chunk, network down), not just a stale cache. Let it
      // surface normally instead of reload-looping forever.
      throw err;
    }
  });
}
