import { formatDate } from "../../utils/dates";
import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import Badge from "../../components/Badge";
import StatCard from "../../components/ui/StatCard";

function PhoneNudge({ userProfile }) {
  const hasPhone = !!(userProfile?.phone || userProfile?.phoneNumber);
  if (hasPhone) return null;
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <p className="text-xs text-amber-800">
        <span className="font-semibold">Add a phone number to your profile</span> — it's required for OTP-based password recovery if you ever lose access to your email.{" "}
        <Link to="/interviewer/profile" className="underline font-semibold hover:text-amber-900">
          Go to Profile →
        </Link>
      </p>
    </div>
  );
}

export default function InterviewerDashboard() {
  const { userProfile } = useAuth();
  const interviews = useInterviewerInterviews(userProfile?.email);

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

      <PhoneNudge userProfile={userProfile} />

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
