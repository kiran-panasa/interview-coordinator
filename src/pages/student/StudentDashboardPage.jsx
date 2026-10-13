import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Video, LogOut, Inbox, Loader2 } from "lucide-react";
import { formatDate } from "../../utils/dates";
import StudentLayout from "../../components/StudentLayout";

const STATUS_LABEL = {
  pending_acceptance: "Scheduling In Progress",
  scheduled:           "Upcoming",
  completed:            "Completed",
  partially_completed:  "Completed",
  cancelled:            "Cancelled",
  declined:             "Being Rescheduled",
  no_show:              "Missed",
};
const STATUS_STYLE = {
  pending_acceptance: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled:           "bg-blue-50 text-blue-700 border-blue-200",
  completed:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  partially_completed:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:            "bg-gray-100 text-gray-400 border-gray-200",
  declined:             "bg-violet-50 text-violet-700 border-violet-200",
  no_show:              "bg-orange-50 text-orange-600 border-orange-200",
};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [candidate, setCandidate] = useState(null);
  const [interviews, setInterviews] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sso/me", { credentials: "include" });
        if (res.status === 401) { navigate("/student/portal", { replace: true }); return; }
        const data = await res.json();
        if (!res.ok) { setError(data.error || "load_failed"); setLoading(false); return; }
        setCandidate(data.candidate);
        setInterviews(data.interviews);
      } catch {
        setError("network_error");
      }
      setLoading(false);
    })();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      await fetch("/api/sso/logout", {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": readCookie("ic_student_csrf") },
      });
    } catch { /* sign out locally regardless */ }
    navigate("/student/portal", { replace: true });
  };

  const upcoming = interviews.filter(i => ["pending_acceptance", "scheduled", "declined"].includes(i.status));
  const past     = interviews.filter(i => !["pending_acceptance", "scheduled", "declined"].includes(i.status));

  if (loading) {
    return (
      <StudentLayout>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-10 text-center">
          <Loader2 className="w-7 h-7 text-brand-600 mx-auto animate-spin" />
        </div>
      </StudentLayout>
    );
  }

  if (error) {
    return (
      <StudentLayout>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-8 text-center">
          <p className="text-sm text-gray-500">Couldn't load your dashboard. Please try signing in again.</p>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-4">
        <div className="text-center mb-2">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Hi, {candidate?.name || "there"}</h2>
          <p className="text-sm text-gray-500 mt-1">{candidate?.email}</p>
        </div>

        {interviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-10">
            <Inbox className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No interviews yet.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Upcoming</p>
                {upcoming.map(iv => (
                  <div key={iv.id} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-bold text-gray-900">{iv.round || iv.templateName || "Interview"}</p>
                        {iv.scheduledDate && (
                          <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <CalendarClock className="w-3 h-3" />
                            {formatDate(iv.scheduledDate)} · {iv.scheduledTime} · {iv.duration}m
                          </p>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {STATUS_LABEL[iv.status] || iv.status}
                      </span>
                    </div>
                    {iv.meetLink && iv.status === "scheduled" && (
                      <a href={iv.meetLink} target="_blank" rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                        <Video className="w-3.5 h-3.5" /> Join Meet
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {past.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">Past</p>
                {past.map(iv => (
                  <div key={iv.id} className="bg-white rounded-2xl border border-gray-100 p-5 opacity-70">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-700 text-sm">{iv.round || iv.templateName || "Interview"}</p>
                        {iv.scheduledDate && (
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(iv.scheduledDate)} · {iv.scheduledTime}</p>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {STATUS_LABEL[iv.status] || iv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button onClick={handleSignOut}
          className="flex items-center justify-center gap-1.5 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-2">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </StudentLayout>
  );
}
