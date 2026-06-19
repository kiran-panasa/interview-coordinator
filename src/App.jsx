import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";

import LoginPage     from "./pages/auth/LoginPage";
import PendingPage   from "./pages/auth/PendingPage";

import AdminLayout        from "./components/AdminLayout";
import AdminDashboard     from "./pages/admin/Dashboard";
import InterviewsPage     from "./pages/admin/InterviewsPage";
import CandidatesPage     from "./pages/admin/CandidatesPage";
import InterviewersPage   from "./pages/admin/InterviewersPage";
import TemplatesPage      from "./pages/admin/TemplatesPage";
import AdminPanelPage     from "./pages/admin/AdminPanelPage";
import NudgePage          from "./pages/admin/NudgePage";
import AdminAboutPage     from "./pages/admin/AboutPage";
import QuestionsPage      from "./pages/admin/QuestionsPage";

import InterviewerLayout    from "./components/InterviewerLayout";
import InterviewerDashboard from "./pages/interviewer/Dashboard";
import MyInterviewsPage     from "./pages/interviewer/MyInterviewsPage";
import InterviewDetail      from "./pages/interviewer/InterviewDetail";
import AvailabilityPage     from "./pages/interviewer/AvailabilityPage";
import ProfilePage          from "./pages/interviewer/ProfilePage";
import NotificationsPage    from "./pages/interviewer/NotificationsPage";
import InterviewerAboutPage from "./pages/interviewer/AboutPage";
import SchedulePage         from "./pages/student/SchedulePage";
import CandidatePortal      from "./pages/student/CandidatePortal";

const ADMIN_ROLES = ["admin", "content_team", "interviewer_content"];

function RootRedirect() {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (userProfile.role === "content_team") return <Navigate to="/admin/templates" replace />;
  if (userProfile.role === "interviewer_content") return <Navigate to="/interviewer/dashboard" replace />;
  return <Navigate to="/interviewer/dashboard" replace />;
}

function AdminGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (!ADMIN_ROLES.includes(userProfile.role)) return <Navigate to="/interviewer/dashboard" replace />;
  return children;
}

function InterviewerGuard({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!userProfile || userProfile.status !== "active") return <Navigate to="/pending" replace />;
  if (userProfile.role !== "interviewer" && userProfile.role !== "interviewer_content") return <Navigate to="/admin/templates" replace />;
  return children;
}

function AppRoutes() {
  return (
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
        <Route path="panel"       element={<AdminPanelPage />} />
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
