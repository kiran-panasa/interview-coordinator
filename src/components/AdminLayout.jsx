import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";
import { useMemo } from "react";
import { useUserNotifications, useAdhocQuestions, useScheduleInvites } from "../hooks/subscriptions";
import ErrorBoundary from "./ErrorBoundary";
import { ROLE_LABELS } from "../constants/roles";
import {
  LayoutDashboard, Users, UserCog, FileText, Bell,
  CalendarClock, HelpCircle, Settings, Info, LogOut, CalendarCheck2,
} from "lucide-react";

const ALL_NAV = [
  { to: "/admin/dashboard",    label: "Dashboard",           roles: ["admin"],                                        icon: LayoutDashboard },
  { to: "/admin/candidates",   label: "Candidates",          roles: ["admin"],                                        icon: Users },
  { to: "/admin/interviewers", label: "Interviewers",        roles: ["admin"],                                        icon: UserCog },
  { to: "/admin/templates",    label: "Interview Templates", roles: ["admin", "content_team", "interviewer_content"], icon: FileText },
  { to: "/admin/nudge",        label: "Nudge",               roles: ["admin"],                                        icon: Bell },
  { to: "/admin/interviews",   label: "Interviews",          roles: ["admin"],                                        icon: CalendarClock },
  { to: "/admin/questions",    label: "Question Bank",       roles: ["admin", "content_team", "interviewer_content"], icon: HelpCircle },
  { to: "/admin/settings",     label: "Settings",            roles: ["admin"],                                        icon: Settings },
  { to: "/admin/about",        label: "About",               roles: ["admin", "content_team", "interviewer_content"], icon: Info },
];

export default function AdminLayout() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const role = userProfile?.role || "admin";
  const nav = useMemo(() => ALL_NAV.filter(item => item.roles.includes(role)), [role]);

  const notifications = useUserNotifications(currentUser?.uid);
  const adhocQs       = useAdhocQuestions();
  const invites       = useScheduleInvites();
  const unreadResponses  = notifications.filter(n => n.type === "response" && n.status === "unread").length;
  const pendingBookings  = invites.filter(i => i.status === "pending_confirmation").length;
  const pendingAdhoc     = adhocQs.filter(q => q.status === "pending").length;
  const nudgeBadge       = unreadResponses + pendingBookings;

  const initials = (userProfile?.displayName || userProfile?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-100 flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-brand-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
              <CalendarCheck2 className="w-4 h-4 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">Interview</p>
              <p className="text-xs text-brand-600 font-semibold leading-tight">Coordinator</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">{ROLE_LABELS[role] || role}</p>
          {nav.map(item => {
            const needsAttention = item.to === "/admin/nudge" && nudgeBadge > 0;
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                    isActive
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : needsAttention
                        ? "bg-red-50 text-red-700 font-semibold hover:bg-red-100"
                        : "text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900"
                  }`
                }>
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                <span className="flex-1">{item.label}</span>
                {item.to === "/admin/nudge" && nudgeBadge > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {nudgeBadge}
                  </span>
                )}
                {item.to === "/admin/questions" && pendingAdhoc > 0 && (
                  <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {pendingAdhoc}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{userProfile?.displayName || userProfile?.email}</p>
              <p className="text-[11px] text-gray-400">{ROLE_LABELS[role] || role}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth).then(() => navigate("/login"))}
            className="w-full flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 min-h-screen">
        <ErrorBoundary>
          <Outlet context={{ adhocQs }} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
