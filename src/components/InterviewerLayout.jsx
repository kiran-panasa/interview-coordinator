import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";
import { useEffect } from "react";
import { useUserNotifications } from "../hooks/subscriptions";
import { checkAndSendFeedbackNudges } from "../services/nudge.service";
import ErrorBoundary from "./ErrorBoundary";
import { ROLE_LABELS } from "../constants/roles";
import {
  LayoutDashboard, CalendarClock, Clock3, Bell, UserCircle, Info, FileText, LogOut, UserCog2,
} from "lucide-react";

const NAV = [
  { to: "/interviewer/dashboard",       label: "Dashboard",       icon: LayoutDashboard },
  { to: "/interviewer/interviews",      label: "My Interviews",   icon: CalendarClock },
  { to: "/interviewer/availability",    label: "My Availability", icon: Clock3 },
  { to: "/interviewer/notifications",   label: "Notifications",   icon: Bell, badge: true },
  { to: "/interviewer/profile",         label: "My Profile",      icon: UserCircle },
  { to: "/interviewer/about",           label: "About",           icon: Info },
];

const TEMPLATES_NAV = { to: "/admin/templates", label: "Templates", icon: FileText };

export default function InterviewerLayout() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const role = userProfile?.role || "interviewer";
  const nav = role === "interviewer_content" ? [...NAV, TEMPLATES_NAV] : NAV;

  const notifications = useUserNotifications(currentUser?.uid);
  const unread = notifications.filter(n =>
    (n.type === "nudge" || n.type === "feedback_reminder" || n.type === "interview_approval") && n.status === "unread"
  ).length;

  useEffect(() => {
    if (!currentUser?.uid || !userProfile?.email) return;
    checkAndSendFeedbackNudges(currentUser.uid, userProfile.email).catch(() => {});
  }, [currentUser?.uid, userProfile?.email]);

  const initials = (userProfile?.displayName || userProfile?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-100 flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
              <UserCog2 className="w-4 h-4 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">Interview</p>
              <p className="text-xs text-emerald-600 font-semibold leading-tight">Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">{ROLE_LABELS[role] || "Interviewer"}</p>
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`
                }>
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                <span className="flex-1">{item.label}</span>
                {item.badge && unread > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <NavLink to="/interviewer/profile" className="flex items-center gap-2.5 mb-3 group">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-emerald-700">{userProfile?.displayName || userProfile?.email}</p>
              <p className="text-[11px] text-gray-400">{ROLE_LABELS[role] || "Interviewer"}</p>
            </div>
          </NavLink>
          <button onClick={() => signOut(auth).then(() => navigate("/login"))}
            className="w-full flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 min-h-screen">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
