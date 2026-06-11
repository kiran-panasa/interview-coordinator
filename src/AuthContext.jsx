import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getMyProfile, createUserProfile, updateUser, getInviteByEmail, getAnyInviteByEmail, updateInvite } from "./api/firestore";

const BOOTSTRAP_EMAIL = "kiran.p@nxtwave.tech";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [userProfile,  setUserProfile]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);

  const loadProfile = async (user) => {
    let profile = await getMyProfile(user.uid).catch(() => null);

    if (!profile) {
      // New account — check invite to assign correct role/status immediately
      const isBootstrap = user.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase();
      const invite = !isBootstrap ? await getInviteByEmail(user.email).catch(() => null) : null;
      await createUserProfile(user.uid, {
        email:       user.email,
        displayName: invite?.name || user.displayName || user.email.split("@")[0],
        phone:       invite?.phone || null,
        role:        isBootstrap ? "admin"      : (invite ? "interviewer" : null),
        status:      isBootstrap ? "active"     : (invite ? "active"      : "pending"),
        createdAt:   new Date().toISOString(),
      }).catch(() => {});
      if (invite) {
        await updateInvite(invite.id, { status: "registered", registeredAt: new Date().toISOString() }).catch(() => {});
      }
      profile = await getMyProfile(user.uid).catch(() => null);
    } else if (profile.status === "pending") {
      // Profile stuck as pending — check ANY invite (pending or already registered)
      // to recover accounts where the race condition created a pending profile
      const invite = await getAnyInviteByEmail(user.email).catch(() => null);
      if (invite) {
        await updateUser(user.uid, {
          role:        "interviewer",
          status:      "active",
          displayName: profile.displayName || invite.name,
          phone:       profile.phone       || invite.phone || null,
        }).catch(() => {});
        if (invite.status === "pending") {
          await updateInvite(invite.id, { status: "registered", registeredAt: new Date().toISOString() }).catch(() => {});
        }
        profile = await getMyProfile(user.uid).catch(() => null);
      }
    }

    setUserProfile(profile);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) await loadProfile(user);
      else setUserProfile(null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const refreshProfile = () => currentUser && loadProfile(currentUser);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, authLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
