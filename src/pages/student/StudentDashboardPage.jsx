import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, LayoutGrid, CalendarRange, ListChecks, Clock3, FileText, RefreshCw,
} from "lucide-react";
import { formatDate } from "../../utils/dates";
import InlineSlotPicker from "../../components/InlineSlotPicker";
import ErrorBoundary from "../../components/ErrorBoundary";
import Button from "../../components/Button";

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

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
}

const NAV = [
  { id: "overview", label: "Overview",      icon: LayoutGrid },
  { id: "details",  label: "My Details",    icon: User },
  { id: "slots",    label: "Slot Overview", icon: CalendarRange },
  { id: "interviews", label: "My Interviews", icon: ListChecks },
];

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [data,    setData]    = useState(null);
  const [tab,     setTab]     = useState("overview");
  const [resumeLink,   setResumeLink]   = useState("");
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeSaved,  setResumeSaved]  = useState(false);
  const [reschedulingId, setReschedulingId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // InlineSlotPicker (Slot Overview tab) reads/writes availability and
        // scheduleInvites via the client Firestore SDK, same as the rest of
        // the student-facing booking flow — that needs an authenticated
        // (even if anonymous) session for the current Firestore rules.
        await signInAnonymously(auth).catch(() => {});
        const res = await fetch("/api/sso/me", { credentials: "include" });
        if (res.status === 401) { navigate("/student/portal", { replace: true }); return; }
        const json = await res.json();
        if (!res.ok) { setError(json.error || "load_failed"); setLoading(false); return; }
        setData(json);
        setResumeLink(json.candidate?.resumeLink || "");
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

  const handleSaveResume = async () => {
    setResumeSaving(true);
    setResumeSaved(false);
    try {
      const res = await fetch("/api/sso/profile/resume", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({ resumeLink: resumeLink.trim() }),
      });
      if (res.ok) {
        setResumeSaved(true);
        setTimeout(() => setResumeSaved(false), 2500);
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.message || "Couldn't save your resume link — make sure it's a valid https:// URL.");
      }
    } catch {
      alert("Couldn't save your resume link. Please try again.");
    }
    setResumeSaving(false);
  };

  const handleRequestReschedule = async (interviewId) => {
    const reason = window.prompt("Why would you like to reschedule this interview? (This goes to the admin team.)");
    if (!reason || !reason.trim()) return;
    setReschedulingId(interviewId);
    try {
      const res = await fetch("/api/sso/interviews/request-reschedule", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({ interviewId, reason: reason.trim() }),
      });
      if (res.ok) {
        setData(d => ({
          ...d,
          interviews: d.interviews.map(iv => iv.id === interviewId ? { ...iv, rescheduleRequested: true } : iv),
        }));
      } else {
        alert("Couldn't submit your reschedule request. Please try again.");
      }
    } catch {
      alert("Couldn't submit your reschedule request. Please try again.");
    }
    setReschedulingId(null);
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
  const bookable = pendingInvites.filter(i => ["sent", "otp_verified"].includes(i.status));
  const awaiting = pendingInvites.filter(i => i.status === "slot_selected");
  const nextUpcoming = upcoming.find(i => i.status === "scheduled" && i.scheduledDate);

  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = tab === item.id;
    const badge = item.id === "slots" ? bookable.length : item.id === "interviews" ? upcoming.length : 0;
    return (
      <button onClick={() => setTab(item.id)}
        className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          active ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {badge > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-600"}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Left sidebar */}
        <div className="w-60 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 min-h-screen">
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-600 to-brand-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <CalendarCheck2 className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
            </div>
            <p className="text-sm font-bold text-gray-900 tracking-tight">Interview Coordinator</p>
          </div>
          <div className="px-3 space-y-1 flex-1">
            {NAV.map(item => <NavButton key={item.id} item={item} />)}
          </div>
          <div className="px-3 pb-5 pt-3 border-t border-gray-100 mt-3">
            <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(candidate.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{candidate.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{candidate.email}</p>
              </div>
            </div>
            <button onClick={handleSignOut}
              className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 py-8">

            {tab === "overview" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Welcome, {candidate.name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Here's where things stand with your interviews.</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-5">
                    <p className="text-2xl font-bold text-gray-900">{bookable.length}</p>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">Ready to Book</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-2xl font-bold text-gray-900">{upcoming.length}</p>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">Upcoming</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-2xl font-bold text-gray-900">{past.length}</p>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">Completed</p>
                  </Card>
                </div>

                {nextUpcoming && (
                  <Card className="p-6">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Next Up</p>
                    <p className="font-bold text-gray-900">{nextUpcoming.round || nextUpcoming.templateName}</p>
                    <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                      <CalendarClock className="w-3.5 h-3.5" />
                      {formatDate(nextUpcoming.scheduledDate)} · {nextUpcoming.scheduledTime} · {nextUpcoming.duration}m
                    </p>
                    {nextUpcoming.meetLink && (
                      <a href={nextUpcoming.meetLink} target="_blank" rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors mt-4">
                        <Video className="w-3.5 h-3.5" /> Join Meet
                      </a>
                    )}
                  </Card>
                )}

              </div>
            )}

            {tab === "details" && (
              <div className="space-y-5">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Details</h1>
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="w-4 h-4 text-brand-600" />
                    <p className="text-sm font-bold text-gray-900">Profile</p>
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

                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-brand-600" />
                    <p className="text-sm font-bold text-gray-900">Resume</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    Shared with the panelist running your interview — keep this up to date.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={resumeLink}
                      onChange={e => setResumeLink(e.target.value)}
                      placeholder="https://drive.google.com/your-resume"
                      className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    />
                    <Button variant="primary" onClick={handleSaveResume} disabled={resumeSaving} className="px-5 flex-shrink-0">
                      {resumeSaving ? "Saving…" : resumeSaved ? "Saved ✓" : "Save"}
                    </Button>
                  </div>
                  {resumeLink && (
                    <a href={resumeLink} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline mt-2 inline-block">
                      View current resume →
                    </a>
                  )}
                </Card>
              </div>
            )}

            {tab === "slots" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Slot Overview</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Pick an open slot for any interview that's ready to book.</p>
                </div>

                {bookable.length === 0 && awaiting.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">Nothing to book right now.</p>
                  </Card>
                ) : (
                  <>
                    {bookable.map(inv => (
                      <Card key={inv.id} className="p-6">
                        <div className="flex items-start justify-between gap-3 mb-4">
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
                            Ready to Book
                          </span>
                        </div>
                        <InlineSlotPicker invite={inv} onBooked={() => window.location.reload()} />
                      </Card>
                    ))}
                    {awaiting.map(inv => (
                      <Card key={inv.id} className="p-6">
                        <div className="flex items-center gap-2 text-sm text-violet-800 font-medium bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                          <Clock3 className="w-4 h-4 flex-shrink-0" />
                          {inv.round || inv.templateName} — slot selected, awaiting confirmation.
                        </div>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === "interviews" && (
              <div className="space-y-5">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Interviews</h1>

                {interviews.length === 0 ? (
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
                              <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${
                                iv.rescheduleRequested ? "bg-amber-50 text-amber-700 border-amber-200" : (STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200")
                              }`}>
                                {iv.rescheduleRequested ? "Reschedule Requested" : (STATUS_LABEL[iv.status] || iv.status)}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              {iv.meetLink && iv.status === "scheduled" && (
                                <a href={iv.meetLink} target="_blank" rel="noreferrer"
                                  className="flex items-center justify-center gap-1.5 flex-1 text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                                  <Video className="w-3.5 h-3.5" /> Join Meet
                                </a>
                              )}
                              {iv.status === "scheduled" && !iv.rescheduleRequested && (
                                <button onClick={() => handleRequestReschedule(iv.id)} disabled={reschedulingId === iv.id}
                                  className="flex items-center justify-center gap-1.5 flex-1 text-center bg-white border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                                  <RefreshCw className="w-3.5 h-3.5" /> {reschedulingId === iv.id ? "Submitting…" : "Request Reschedule"}
                                </button>
                              )}
                            </div>
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
            )}

          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
