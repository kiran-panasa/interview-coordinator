import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";

const LoginPage     = lazy(() => import("./pages/auth/LoginPage"));
const PendingPage   = lazy(() => import("./pages/auth/PendingPage"));

const AdminLayout        = lazy(() => import("./components/AdminLayout"));
const AdminDashboard     = lazy(() => import("./pages/admin/Dashboard"));
const InterviewsPage     = lazy(() => import("./pages/admin/InterviewsPage"));
const CandidatesPage     = lazy(() => import("./pages/admin/CandidatesPage"));
const InterviewersPage   = lazy(() => import("./pages/admin/InterviewersPage"));
const TemplatesPage      = lazy(() => import("./pages/admin/TemplatesPage"));
const SettingsPage       = lazy(() => import("./pages/admin/SettingsPage"));
const NudgePage          = lazy(() => import("./pages/admin/NudgePage"));
const AdminAboutPage     = lazy(() => import("./pages/admin/AboutPage"));
const QuestionsPage      = lazy(() => import("./pages/admin/QuestionsPage"));

const InterviewerLayout    = lazy(() => import("./components/InterviewerLayout"));
const InterviewerDashboard = lazy(() => import("./pages/interviewer/Dashboard"));
const MyInterviewsPage     = lazy(() => import("./pages/interviewer/MyInterviewsPage"));
const InterviewDetail      = lazy(() => import("./pages/interviewer/InterviewDetail"));
const AvailabilityPage     = lazy(() => import("./pages/interviewer/AvailabilityPage"));
const ProfilePage          = lazy(() => import("./pages/interviewer/ProfilePage"));
const NotificationsPage    = lazy(() => import("./pages/interviewer/NotificationsPage"));
const InterviewerAboutPage = lazy(() => import("./pages/interviewer/AboutPage"));
const SchedulePage         = lazy(() => import("./pages/student/SchedulePage"));
const CandidatePortal      = lazy(() => import("./pages/student/CandidatePortal"));

import { ADMIN_ROLES } from "./constants/roles";

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
);

function RootRedirect() {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <PageFallback />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (userProfile.role === "content_team") return <Navigate to="/admin/templates" replace />;
  if (userProfile.role === "interviewer_content") return <Navigate to="/interviewer/dashboard" replace />;
  return <Navigate to="/interviewer/dashboard" replace />;
}

function AdminGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <PageFallback />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (!ADMIN_ROLES.includes(userProfile.role)) return <Navigate to="/interviewer/dashboard" replace />;
  return children;
}

function InterviewerGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <PageFallback />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role !== "interviewer" && userProfile.role !== "interviewer_content") return <Navigate to="/admin/templates" replace />;
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
          <Route path="nudge"       element={<NudgePage />} />
          <Route path="questions"   element={<QuestionsPage />} />
          <Route path="about"       element={<AdminAboutPage />} />
        </Route>

        {/* Interviewer */}
        <Route path="/interviewer" element={<InterviewerGuard><InterviewerLayout /></InterviewerGuard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"    element={<InterviewerDashboard />} />
          <Route path="interviews"   element={<MyInterviewsPage />} />
          <Route path="interviews/:id" element={<InterviewDetail />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="profile"        element={<ProfilePage />} />
          <Route path="notifications"  element={<NotificationsPage />} />
          <Route path="about"          element={<InterviewerAboutPage />} />
        </Route>

        {/* Public student pages — no auth required */}
        <Route path="/student/schedule" element={<SchedulePage />} />
        <Route path="/student/portal"   element={<CandidatePortal />} />

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
