import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { subscribeToInterviews, getAllUsers } from "../../api/firestore";
import Badge from "../../components/Badge";
import StatCard from "../../components/ui/StatCard";

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  return d >= weekStart && d <= weekEnd;
}

export default function AdminDashboard() {
  const [interviews, setInterviews] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => {
    const unsub = subscribeToInterviews(setInterviews);
    getAllUsers().then(users => setPendingUsers(users.filter(u => u.status === "pending")));
    return unsub;
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = interviews
    .filter(i => i.scheduledDate >= today && i.status !== "cancelled" && i.status !== "declined")
    .slice(0, 8);

  const stats = {
    total:     interviews.length,
    thisWeek:  interviews.filter(i => isThisWeek(i.scheduledDate)).length,
    pending:   interviews.filter(i => i.status === "pending_acceptance").length,
    completed: interviews.filter(i => i.status === "completed").length,
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all interview activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Interviews"   value={stats.total}     color="text-gray-900" />
        <StatCard label="This Week"          value={stats.thisWeek}  color="text-indigo-600" />
        <StatCard label="Pending Acceptance" value={stats.pending}   color="text-amber-600" />
        <StatCard label="Completed"          value={stats.completed} color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Upcoming interviews */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Upcoming Interviews</h2>
            <Link to="/admin/interviews" className="text-xs text-indigo-600 font-medium hover:underline">View all</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No upcoming interviews</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming.map(i => (
                <div key={i.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{i.candidateName}</p>
                    <p className="text-xs text-gray-500">{i.round} · {i.interviewerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-700">{i.scheduledDate}</p>
                    <p className="text-xs text-gray-400">{i.scheduledTime}</p>
                  </div>
                  <Badge value={i.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending approvals */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Pending Approvals</h2>
            <Link to="/admin/interviewers" className="text-xs text-indigo-600 font-medium hover:underline">Manage</Link>
          </div>
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No pending sign-ups</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingUsers.map(u => (
                <div key={u.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-900">{u.displayName || "—"}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
