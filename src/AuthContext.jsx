import { createContext, useContext, useEffect, useMemo, useCallback, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { getMyProfile, createUserProfile, updateUser, getInviteByEmail, getAnyInviteByEmail, updateInvite } from "./api/firestore";
import { logError } from "./utils/logger";
import { onFirestoreListenerError } from "./utils/firestoreSubscribe";
import { BOOTSTRAP_EMAIL } from "./constants/roles";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [userProfile,  setUserProfile]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  // Set if loadProfile() is still pending after a long timeout — normally
  // this resolves in well under a second, but a corrupted local Firestore
  // cache in one specific browser profile can make the very first read
  // hang forever with no error, no timeout, nothing to click: the app just
  // sits on "Loading…" indefinitely (confirmed via a real report — stuck
  // for days in one profile, works immediately in incognito). This turns
  // that silent infinite hang into a visible, actionable state.
  const [authStuck,    setAuthStuck]    = useState(false);

  const loadProfile = async (user) => {
    let profile = await getMyProfile(user.uid).catch(e => { logError(e, { label: "getMyProfile" }); return null; });

    if (!profile) {
      // New account — check invite to assign correct role/status immediately
      const isBootstrap = user.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase();
      const invite = !isBootstrap ? await getInviteByEmail(user.email).catch(e => { logError(e, { label: "getInviteByEmail" }); return null; }) : null;
      await createUserProfile(user.uid, {
        email:       user.email,
        displayName: invite?.name || user.displayName || user.email.split("@")[0],
        phone:       invite?.phone || null,
        role:        isBootstrap ? "admin"      : (invite ? (invite.role || "interviewer") : null),
        status:      isBootstrap ? "active"     : (invite ? "active"      : "pending"),
        // Only ever present on a "vendor"-role invite (see the Settings ->
        // Invite modal's "Which Vendor?" picker) — carries straight over so
        // a brand-new vendor-only account lands with Vendor Dashboard
        // access already in place, no separate admin step needed after signup.
        vendorContactFor: invite?.vendorId || null,
        createdAt:   new Date().toISOString(),
      }).catch(e => logError(e, { label: "createUserProfile", uid: user.uid }));
      if (invite) {
        await updateInvite(invite.id, { status: "registered", registeredAt: new Date().toISOString() })
          .catch(e => logError(e, { label: "updateInvite:registered", inviteId: invite.id }));
      }
      profile = await getMyProfile(user.uid).catch(e => { logError(e, { label: "getMyProfile:post-create" }); return null; });
    } else if (profile.status === "pending") {
      // Profile stuck as pending — check ANY invite (pending or already registered)
      // to recover accounts where the race condition created a pending profile
      const invite = await getAnyInviteByEmail(user.email).catch(e => { logError(e, { label: "getAnyInviteByEmail" }); return null; });
      if (invite) {
        await updateUser(user.uid, {
          role:        "interviewer",
          status:      "active",
          displayName: profile.displayName || invite.name,
          phone:       profile.phone       || invite.phone || null,
        }).catch(e => logError(e, { label: "updateUser:pending-recovery", uid: user.uid }));
        if (invite.status === "pending") {
          await updateInvite(invite.id, { status: "registered", registeredAt: new Date().toISOString() })
            .catch(e => logError(e, { label: "updateInvite:recovery", inviteId: invite.id }));
        }
        profile = await getMyProfile(user.uid).catch(e => { logError(e, { label: "getMyProfile:post-recovery" }); return null; });
      }
    }

    setUserProfile(profile);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // Phone-only sign-in means OTP identity verification on the login page.
      // Don't update auth state — sign out immediately and let the login page handle it.
      const phoneOnly = user?.providerData?.length === 1
        && user.providerData[0].providerId === "phone";
      if (phoneOnly) {
        signOut(auth);
        return;
      }

      setAuthLoading(true);
      setAuthStuck(false);
      setCurrentUser(user);
      let settled = false;
      const stuckTimer = setTimeout(() => {
        if (!settled) {
          logError(new Error("Auth profile load timed out"), { label: "authLoadingTimeout", uid: user?.uid });
          setAuthStuck(true);
        }
      }, 15000);
      if (user) await loadProfile(user);
      else setUserProfile(null);
      settled = true;
      clearTimeout(stuckTimer);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Firebase ID tokens expire hourly and normally auto-refresh on a timer —
  // but browsers throttle timers in backgrounded tabs, so a tab left idle
  // for a while can come back with a stale token. Every Firestore call then
  // silently fails until the token refreshes on its own, so this checks on
  // every tab-focus — but only actually FORCES a refresh (getIdToken(true),
  // a real round-trip to Google's auth servers) when the cached token is
  // genuinely close to expiring. Doing that unconditionally on every single
  // tab switch — not just after a long idle stretch — meant a transient
  // failure on any one of those frequent calls (a network blip, a laptop
  // still reconnecting WiFi after waking up) could read to the Firebase SDK
  // as an invalid session and sign the user out for real, which is a much
  // worse outcome than the stale-token problem this was meant to prevent.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || !auth.currentUser) return;
      try {
        const { expirationTime } = await auth.currentUser.getIdTokenResult();
        const msUntilExpiry = new Date(expirationTime).getTime() - Date.now();
        if (msUntilExpiry < 5 * 60 * 1000) await auth.currentUser.getIdToken(true);
      } catch (e) {
        logError(e, { label: "forceTokenRefresh" });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Safety net for the cases the proactive refresh above doesn't catch
  // (a genuine network drop, not just a stale token) — every onSnapshot()
  // listener in the app reports here when its stream dies. Previously that
  // failure was completely silent: no error, whatever "loading" flag was
  // gating the page just never flipped again, and the only way out was a
  // hard reload + re-login.
  const [connectionLost, setConnectionLost] = useState(false);
  useEffect(() => onFirestoreListenerError(() => setConnectionLost(true)), []);

  const refreshProfile = useCallback(() => {
    if (currentUser) loadProfile(currentUser);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Best-effort nuke of this origin's local storage/IndexedDB (where a
  // corrupted Firestore cache would live) before reloading — a plain
  // reload alone often isn't enough if the stuck read is caused by
  // genuinely corrupted local persistence, not just an in-memory hang.
  const clearCacheAndReload = useCallback(async () => {
    try {
      if (window.indexedDB?.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all(dbs.map(d => d.name && new Promise(resolve => {
          const req = indexedDB.deleteDatabase(d.name);
          req.onsuccess = req.onerror = req.onblocked = resolve;
        })));
      }
    } catch { /* best effort */ }
    try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
    window.location.reload();
  }, []);

  const ctxValue = useMemo(
    () => ({ currentUser, userProfile, authLoading, authStuck, refreshProfile, clearCacheAndReload }),
    [currentUser, userProfile, authLoading, authStuck, refreshProfile, clearCacheAndReload]
  );

  return (
    <AuthContext.Provider value={ctxValue}>
      {children}
      {connectionLost && (
        <div className="fixed bottom-0 inset-x-0 z-[9999] bg-amber-600 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-3 shadow-lg">
          <span>Connection to the server was lost — some data may be out of date.</span>
          <button
            onClick={() => window.location.reload()}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Reload
          </button>
          <button
            onClick={() => setConnectionLost(false)}
            className="text-white/70 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
}
