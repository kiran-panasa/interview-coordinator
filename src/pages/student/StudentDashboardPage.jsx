import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, ChevronDown, CalendarPlus,
} from "lucide-react";
import { formatDate } from "../../utils/dates";
import ErrorBoundary from "../../components/ErrorBoundary";

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
const INVITE_STATUS_LABEL = {
  sent:          "Ready to Book",
  otp_verified:  "Ready to Book",
  slot_selected: "Awaiting Confirmation",
};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [data,    setData]    = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sso/me", { credentials: "include" });
        if (res.status === 401) { navigate("/student/portal", { replace: true }); return; }
        const json = await res.json();
        if (!res.ok) { setError(json.error || "load_failed"); setLoading(false); return; }
        setData(json);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <p className="text-sm text-gray-500">Couldn't load your dashboard. Please try signing in again.</p>
        </Card>
      </div>
    );
  }

  const { candidate, templates = [], interviews = [], pendingInvites = [] } = data;
  const upcoming = interviews.filter(i => ["pending_acceptance", "scheduled", "declined"].includes(i.status));
  const past     = interviews.filter(i => !["pending_acceptance", "scheduled", "declined"].includes(i.status));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-brand-600 to-brand-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <CalendarCheck2 className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
              </div>
              <p className="text-sm font-bold text-gray-900 tracking-tight">Interview Coordinator</p>
            </div>
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(candidate.name || "?").charAt(0).toUpperCase()}
                </div>
                {candidate.name}
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white border border-gray-100 rounded-xl shadow-popover overflow-hidden">
                  <button onClick={handleSignOut}
                    className="flex items-center gap-2 w-full text-left px-3.5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {/* My Details */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-brand-600" />
              <p className="text-sm font-bold text-gray-900">My Details</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Name</p>
                <p className="text-gray-800 font-medium mt-0.5">{candidate.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Email</p>
                <p className="text-gray-800 font-medium mt-0.5">{candidate.email}</p>
              </div>
              {candidate.uid && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Student ID</p>
                  <p className="text-gray-800 font-medium mt-0.5">{candidate.uid}</p>
                </div>
              )}
              {candidate.program && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Program</p>
                  <p className="text-gray-800 font-medium mt-0.5">{candidate.program}</p>
                </div>
              )}
            </div>
            {templates.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  <BookOpen className="w-3 h-3" /> Assigned Templates
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map(t => (
                    <span key={t.id} className="text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">
                      {t.name} · {t.durationMinutes}m
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Book an Interview */}
          {pendingInvites.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Book an Interview</p>
              {pendingInvites.map(inv => (
                <Card key={inv.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-bold text-gray-900">{inv.round || inv.templateName || "Interview"}</p>
                      {inv.dateRangeStart && (
                        <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <CalendarClock className="w-3 h-3" />
                          Book between {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 bg-violet-50 text-violet-700 border-violet-200">
                      {INVITE_STATUS_LABEL[inv.status] || inv.status}
                    </span>
                  </div>
                  {inv.status === "slot_selected" ? (
                    <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-800 font-medium">
                      Slot selected — waiting for confirmation.
                    </div>
                  ) : (
                    <Link
                      to={`/student/schedule?invite=${inv.inviteToken}`}
                      className="flex items-center justify-center gap-1.5 w-full text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                      <CalendarPlus className="w-3.5 h-3.5" /> Select a Slot
                    </Link>
                  )}
                </Card>
              ))}
            </div>
          )}

          {interviews.length === 0 && pendingInvites.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-10">
              <Inbox className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No interviews yet.</p>
            </Card>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Upcoming</p>
                  {upcoming.map(iv => (
                    <Card key={iv.id} className="p-6">
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
                    </Card>
                  ))}
                </div>
              )}

              {past.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">Past</p>
                  {past.map(iv => (
                    <Card key={iv.id} className="p-5 opacity-70">
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
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
