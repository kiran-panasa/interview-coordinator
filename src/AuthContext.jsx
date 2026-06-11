import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getMyProfile, createUserProfile } from "./api/firestore";

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
      // Document missing — create it now (handles accounts created outside the signup flow)
      const isBootstrap = user.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase();
      await createUserProfile(user.uid, {
        email:       user.email,
        displayName: user.displayName || user.email.split("@")[0],
        role:        isBootstrap ? "admin"  : null,
        status:      isBootstrap ? "active" : "pending",
        createdAt:   new Date().toISOString(),
      }).catch(() => {});
      profile = await getMyProfile(user.uid).catch(() => null);
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
