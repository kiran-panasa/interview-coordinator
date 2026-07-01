import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";
import { useEffect, useState } from "react";
import { subscribeToUserNotifications, subscribeToAdhocQuestions } from "../api/firestore";
import ErrorBoundary from "./ErrorBoundary";

const ALL_NAV = [
  { to: "/admin/dashboard",    label: "Dashboard",           roles: ["admin"],                                        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { to: "/admin/candidates",   label: "Candidates",          roles: ["admin"],                                        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" },
  { to: "/admin/interviewers", label: "Interviewers",        roles: ["admin"],                                        icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { to: "/admin/templates",    label: "Interview Templates", roles: ["admin", "content_team", "interviewer_content"], icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { to: "/admin/nudge",        label: "Nudge",               roles: ["admin"],                                        icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
  { to: "/admin/interviews",   label: "Interviews",          roles: ["admin"],                                        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { to: "/admin/questions",    label: "Question Bank",       roles: ["admin", "content_team", "interviewer_content"], icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/admin/settings",     label: "Settings",            roles: ["admin"],                                        icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { to: "/admin/about",        label: "About",               roles: ["admin", "content_team", "interviewer_content"], icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const ROLE_LABELS = { admin: "Admin", content_team: "Content Team", interviewer: "Interviewer", interviewer_content: "Interviewer + Content" };

export default function AdminLayout() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const role = userProfile?.role || "admin";
  const nav = ALL_NAV.filter(item => item.roles.includes(role));

  const [unread,    setUnread]    = useState(0);
  const [adhocQs,   setAdhocQs]  = useState([]);
  const pendingAdhoc = adhocQs.filter(q => q.status === "pending").length;

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub1 = subscribeToUserNotifications(currentUser.uid, (notifs) => {
      setUnread(notifs.filter(n => n.type === "response" && n.status === "unread").length);
    });
    const unsub2 = subscribeToAdhocQuestions(setAdhocQs);
    return () => { unsub1(); unsub2(); };
  }, [currentUser?.uid]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Interview</p>
              <p className="text-xs text-indigo-600 font-semibold leading-tight">Coordinator</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">{ROLE_LABELS[role] || role}</p>
          {nav.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600 pl-2.5"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
              </svg>
              <span className="flex-1">{item.label}</span>
              {item.to === "/admin/nudge" && unread > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unread}
                </span>
              )}
              {item.to === "/admin/questions" && pendingAdhoc > 0 && (
                <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingAdhoc}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-indigo-600 truncate">{userProfile?.displayName || userProfile?.email}</p>
          <p className="text-xs text-gray-400 mb-3">{ROLE_LABELS[role] || role}</p>
          <button onClick={() => signOut(auth).then(() => navigate("/login"))}
            className="w-full text-left text-xs text-gray-500 hover:text-red-500 transition-colors">
            Sign out →
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
