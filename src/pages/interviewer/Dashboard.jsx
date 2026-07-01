import { useState, useEffect } from "react";
import { formatDate } from "../../utils/dates";
import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { subscribeToInterviewerInterviews } from "../../api/firestore";
import Badge from "../../components/Badge";

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

export default function InterviewerDashboard() {
  const { userProfile } = useAuth();
  const [interviews, setInterviews] = useState([]);

  useEffect(() => {
    if (!userProfile?.email) return;
    const unsub = subscribeToInterviewerInterviews(userProfile.email, setInterviews);
    return unsub;
  }, [userProfile?.email]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming  = interviews.filter(i => i.scheduledDate >= today && (i.status === "scheduled" || i.status === "pending_acceptance"));
  const todayList = interviews.filter(i => i.scheduledDate === today && i.status === "scheduled");
  const pending   = interviews.filter(i => i.status === "pending_acceptance");
  const completed = interviews.filter(i => i.status === "completed");

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {userProfile?.displayName || userProfile?.email}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Upcoming"     value={upcoming.length}  color="text-indigo-600" />
        <StatCard label="Needs Action" value={pending.length}   color="text-amber-600" />
        <StatCard label="Completed"    value={completed.length} color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Today */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Today</h2>
            <span className="text-xs text-gray-400">{formatDate(today)}</span>
          </div>
          {todayList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No interviews today</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayList.map(i => (
                <Link key={i.id} to={`/interviewer/interviews/${i.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{i.candidateName}</p>
                    <p className="text-xs text-gray-500">{i.round} · {i.roleAppliedFor}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-700">{i.scheduledTime}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Needs action */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Needs Your Action</h2>
            <Link to="/interviewer/interviews" className="text-xs text-indigo-600 font-medium hover:underline">
              View all
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No pending interviews</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pending.map(i => (
                <Link key={i.id} to={`/interviewer/interviews/${i.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{i.candidateName}</p>
                    <p className="text-xs text-gray-500">{i.round} · {formatDate(i.scheduledDate)} at {i.scheduledTime}</p>
                  </div>
                  <Badge value={i.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
