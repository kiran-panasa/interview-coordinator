import { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { lazyWithRetry as lazy } from "./utils/lazyWithRetry";

// Lazy like every other component below — a static top-level import here
// pulled ErrorBoundary (and its Button/lucide-react/Sentry logger deps)
// into the main eagerly-loaded entry bundle for every single visitor
// (~130KB extra on first paint, before login, for everyone — not just
// students), which defeats the whole "fix slow page load" point. Lazy
// keeps it out of the eager bundle exactly like AdminLayout/InterviewerLayout
// below, at the cost of a brief moment without crash protection while its
// chunk downloads — a non-issue in practice since Suspense's PageFallback
// is already showing during that same window.
const ErrorBoundary = lazy(() => import("./components/ErrorBoundary"));

const LoginPage     = lazy(() => import("./pages/auth/LoginPage"));
const PendingPage   = lazy(() => import("./pages/auth/PendingPage"));

const AdminLayout        = lazy(() => import("./components/AdminLayout"));
const AdminDashboard     = lazy(() => import("./pages/admin/Dashboard"));
const InterviewsPage     = lazy(() => import("./pages/admin/InterviewsPage"));
const CandidatesPage     = lazy(() => import("./pages/admin/CandidatesPage"));
const InterviewersPage   = lazy(() => import("./pages/admin/InterviewersPage"));
const TemplatesPage      = lazy(() => import("./pages/admin/TemplatesPage"));
const SettingsPage       = lazy(() => import("./pages/admin/SettingsPage"));
const InboundPage        = lazy(() => import("./pages/admin/InboundPage"));
const NudgePage          = lazy(() => import("./pages/admin/NudgePage"));
const AdminAboutPage     = lazy(() => import("./pages/admin/AboutPage"));
const QuestionsPage      = lazy(() => import("./pages/admin/QuestionsPage"));
const InterviewerStatsPage = lazy(() => import("./pages/admin/InterviewerStatsPage"));

const InterviewerLayout    = lazy(() => import("./components/InterviewerLayout"));
const InterviewerDashboard = lazy(() => import("./pages/interviewer/Dashboard"));
const MyInterviewsPage     = lazy(() => import("./pages/interviewer/MyInterviewsPage"));
const InterviewDetail      = lazy(() => import("./pages/interviewer/InterviewDetail"));
const InterviewQuestions   = lazy(() => import("./pages/interviewer/InterviewQuestions"));
const AvailabilityPage     = lazy(() => import("./pages/interviewer/AvailabilityPage"));
const InterviewerLeaderboardPage = lazy(() => import("./pages/interviewer/LeaderboardPage"));
const ProfilePage          = lazy(() => import("./pages/interviewer/ProfilePage"));
const NotificationsPage    = lazy(() => import("./pages/interviewer/NotificationsPage"));
const InterviewerAboutPage = lazy(() => import("./pages/interviewer/AboutPage"));
const SchedulePage         = lazy(() => import("./pages/student/SchedulePage"));
const CandidatePortal      = lazy(() => import("./pages/student/CandidatePortal"));
const SsoCallbackPage      = lazy(() => import("./pages/student/SsoCallbackPage"));
const StudentDashboardPage = lazy(() => import("./pages/student/StudentDashboardPage"));

const VendorDashboardPage  = lazy(() => import("./pages/vendor/VendorDashboardPage"));

import { ADMIN_ROLES } from "./constants/roles";

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
);

// Shown instead of the plain spinner once AuthContext's 15s timeout fires —
// a stuck local Firestore cache leaves authLoading true forever with no
// error of its own, so without this the page just spins indefinitely with
// nothing to click (see AuthContext.jsx's authStuck).
function AuthStuckFallback() {
  const { clearCacheAndReload } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3">
        <p className="text-sm font-semibold text-gray-700">This is taking longer than it should.</p>
        <p className="text-xs text-gray-400">
          Your browser's local cache for this site may be stuck. Clearing it usually fixes this.
        </p>
        <button
          onClick={clearCacheAndReload}
          className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition-colors"
        >
          Clear Cache &amp; Reload
        </button>
      </div>
    </div>
  );
}

function AuthGate() {
  const { authStuck } = useAuth();
  return authStuck ? <AuthStuckFallback /> : <PageFallback />;
}

function RootRedirect() {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <AuthGate />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (userProfile.role === "content_team") return <Navigate to="/admin/templates" replace />;
  if (userProfile.role === "interviewer_content") return <Navigate to="/interviewer/dashboard" replace />;
  // Standalone vendor-only account (no other role) — an existing
  // admin/interviewer who's ALSO a vendor contact keeps landing on their
  // normal dashboard above; this only applies to role === "vendor" itself.
  if (userProfile.role === "vendor") return <Navigate to="/vendor/dashboard" replace />;
  return <Navigate to="/interviewer/dashboard" replace />;
}

function AdminGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <AuthGate />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (!ADMIN_ROLES.includes(userProfile.role)) return <Navigate to="/interviewer/dashboard" replace />;
  return children;
}

function InterviewerGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <AuthGate />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role !== "interviewer" && userProfile.role !== "interviewer_content") return <Navigate to="/admin/templates" replace />;
  return children;
}

// Additive, not role-exclusive — allows role === "vendor" (the standalone
// vendor-only account) OR anyone with vendorContactFor set (an existing
// admin/interviewer also designated a vendor's contact, see
// setVendorContact in SettingsPage.jsx), on top of whatever their own role
// already grants them.
function VendorGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <AuthGate />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role !== "vendor" && !userProfile.vendorContactFor) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/"       element={<RootRedirect />} />
        <Route path="/login"   element={<LoginPage />} />
        <Route path="/pending" element={<PendingPage />} />

        {/* Admin */}
        <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<AdminDashboard />} />
          <Route path="interviews"  element={<InterviewsPage />} />
          <Route path="candidates"  element={<CandidatesPage />} />
          <Route path="interviewers" element={<InterviewersPage />} />
          <Route path="templates"   element={<TemplatesPage />} />
          <Route path="settings"    element={<SettingsPage />} />
          <Route path="panel"       element={<Navigate to="/admin/settings" replace />} />
          <Route path="inbound"     element={<InboundPage />} />
          <Route path="nudge"       element={<NudgePage />} />
          <Route path="questions"   element={<QuestionsPage />} />
          <Route path="interviewer-stats" element={<InterviewerStatsPage />} />
          <Route path="about"       element={<AdminAboutPage />} />
        </Route>

        {/* Interviewer */}
        <Route path="/interviewer" element={<InterviewerGuard><InterviewerLayout /></InterviewerGuard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"    element={<InterviewerDashboard />} />
          <Route path="interviews"   element={<MyInterviewsPage />} />
          <Route path="interviews/:id" element={<InterviewDetail />} />
          <Route path="interviews/:id/questions" element={<InterviewQuestions />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="leaderboard"    element={<InterviewerLeaderboardPage />} />
          <Route path="profile"        element={<ProfilePage />} />
          <Route path="notifications"  element={<NotificationsPage />} />
          <Route path="about"          element={<InterviewerAboutPage />} />
        </Route>

        {/* Vendor — self-contained single page (builds its own sidebar/tabs
           inline), same pattern as StudentDashboardPage, so no separate
           layout component is needed for what's currently 3 small scoped
           views (Panelists, Interview Stats, Slot Overview). */}
        <Route path="/vendor/dashboard" element={<VendorGuard><ErrorBoundary><VendorDashboardPage /></ErrorBoundary></VendorGuard>} />

        {/* Public student pages — no auth required. Unlike Admin/Interviewer,
           these have no shared layout component to hang a boundary off of
           (AdminLayout/InterviewerLayout wrap their own <Outlet/>), so each
           route is wrapped directly here instead — otherwise a throw in a
           page's own render-body code (before its JSX return) has nothing
           above it in the tree to catch it and white-screens the tab. */}
        <Route path="/student/schedule"  element={<ErrorBoundary><SchedulePage /></ErrorBoundary>} />
        <Route path="/student/portal"    element={<ErrorBoundary><CandidatePortal /></ErrorBoundary>} />
        <Route path="/student/dashboard" element={<ErrorBoundary><StudentDashboardPage /></ErrorBoundary>} />
        <Route path="/sso/callback"      element={<ErrorBoundary><SsoCallbackPage /></ErrorBoundary>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
