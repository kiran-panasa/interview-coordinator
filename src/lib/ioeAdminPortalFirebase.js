// Secondary Firebase connection — reads/writes ioe-admin-portal's own
// Firestore project directly, separate from this app's own Firebase project
// (src/firebase.js). Given a distinct name so it doesn't collide with the
// default app instance; only Firestore is needed here, not Auth/Storage.
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const IOE_ADMIN_PORTAL_APP_NAME = "ioeAdminPortal";

const ioeAdminPortalConfig = {
  apiKey:        import.meta.env.VITE_IOE_ADMIN_PORTAL_API_KEY,
  authDomain:    import.meta.env.VITE_IOE_ADMIN_PORTAL_AUTH_DOMAIN,
  projectId:     import.meta.env.VITE_IOE_ADMIN_PORTAL_PROJECT_ID,
  storageBucket: import.meta.env.VITE_IOE_ADMIN_PORTAL_STORAGE_BUCKET,
};

// getApps()/getApp() guard against Vite's HMR re-running this module and
// throwing "app already exists" on hot reload during local dev.
const ioeAdminPortalApp = getApps().some(a => a.name === IOE_ADMIN_PORTAL_APP_NAME)
  ? getApp(IOE_ADMIN_PORTAL_APP_NAME)
  : initializeApp(ioeAdminPortalConfig, IOE_ADMIN_PORTAL_APP_NAME);

export const ioeAdminPortalDb = getFirestore(ioeAdminPortalApp);
