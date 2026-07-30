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
      setCurrentUser(user);
      if (user) await loadProfile(user);
      else setUserProfile(null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Firebase ID tokens expire hourly and normally auto-refresh on a timer —
  // but browsers throttle timers in backgrounded tabs, so a tab left idle
  // for a while can come back with a stale token. Every Firestore call then
  // silently fails until the token refreshes on its own. Force a refresh
  // the moment the tab becomes visible again, before that has a chance to
  // bite.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(e => logError(e, { label: "forceTokenRefresh" }));
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

  const ctxValue = useMemo(
    () => ({ currentUser, userProfile, authLoading, refreshProfile }),
    [currentUser, userProfile, authLoading, refreshProfile]
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
