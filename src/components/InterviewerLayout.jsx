import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";

const NAV = [
  { to: "/interviewer/dashboard",    label: "Dashboard",       icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { to: "/interviewer/interviews",   label: "My Interviews",   icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { to: "/interviewer/availability", label: "My Availability", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/interviewer/profile",      label: "My Profile",      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

const TEMPLATES_NAV = { to: "/admin/templates", label: "Templates", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" };

const ROLE_LABELS = { interviewer: "Interviewer", interviewer_content: "Interviewer + Content" };

export default function InterviewerLayout() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const role = userProfile?.role || "interviewer";
  const nav = role === "interviewer_content" ? [...NAV, TEMPLATES_NAV] : NAV;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Interview</p>
              <p className="text-xs text-emerald-600 font-semibold leading-tight">Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">{ROLE_LABELS[role] || "Interviewer"}</p>
          {nav.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border-l-2 border-emerald-600 pl-2.5"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <NavLink to="/interviewer/profile" className="block group mb-0.5">
            <p className="text-xs font-semibold text-emerald-600 truncate group-hover:text-emerald-700">{userProfile?.displayName || userProfile?.email}</p>
            <p className="text-[10px] text-gray-400 group-hover:text-gray-500">Edit profile →</p>
          </NavLink>
          <p className="text-xs text-gray-400 mb-3 mt-0.5">{ROLE_LABELS[role] || "Interviewer"}</p>
          <button onClick={() => signOut(auth).then(() => navigate("/login"))}
            className="w-full text-left text-xs text-gray-500 hover:text-red-500 transition-colors">
            Sign out →
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
