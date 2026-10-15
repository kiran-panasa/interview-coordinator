import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, LayoutGrid, CalendarRange, ListChecks, Clock3, FileText, RefreshCw,
  ChevronDown, ChevronRight, Sparkles, PlayCircle, FileDown, CalendarPlus,
} from "lucide-react";
import { formatDate } from "../../utils/dates";
import { getPreInterviewResources } from "../../api/firestore";
import InlineSlotPicker from "../../components/InlineSlotPicker";
import AiReportModal from "../../features/interviews/AiReportModal";
import ErrorBoundary from "../../components/ErrorBoundary";
import Button from "../../components/Button";

const SEEN_INVITES_KEY = "ic_seen_invites";
function readSeenInviteIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_INVITES_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeSeenInviteIds(ids) {
  try { localStorage.setItem(SEEN_INVITES_KEY, JSON.stringify([...ids])); } catch { /* storage unavailable */ }
}

const STATUS_LABEL = {
  pending_acceptance: "Scheduling In Progress",
  scheduled:           "Upcoming",
  completed:            "Completed",
  partially_completed:  "Partially Completed",
  cancelled:            "Cancelled",
  declined:             "Being Rescheduled",
  no_show:              "Missed",
};
const STATUS_STYLE = {
  pending_acceptance: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled:           "bg-blue-50 text-blue-700 border-blue-200",
  completed:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  partially_completed:  "bg-sky-50 text-sky-700 border-sky-200",
  cancelled:            "bg-gray-100 text-gray-400 border-gray-200",
  declined:             "bg-violet-50 text-violet-700 border-violet-200",
  no_show:              "bg-orange-50 text-orange-600 border-orange-200",
};
// My Interviews is split into one section per status (instead of a single
// "Past" catch-all) so every outcome — upcoming, in-progress scheduling,
// reschedule requests (candidate- or admin-side), completed, partially
// completed, cancelled, missed — is its own clearly labeled, trackable
// group rather than lumped together.
const INTERVIEW_SECTIONS = [
  { key: "pending_acceptance", label: "Scheduling In Progress", match: i => i.status === "pending_acceptance" },
  { key: "reschedule_requested", label: "Reschedule Requested", match: i => i.status === "scheduled" && i.rescheduleRequested },
  { key: "reschedule_approved", label: "Reschedule Approved", match: i => i.status === "scheduled" && i.rescheduleApproved && !i.rescheduleRequested },
  { key: "scheduled",      label: "Upcoming",            match: i => i.status === "scheduled" && !i.rescheduleRequested && !i.rescheduleApproved },
  { key: "declined",       label: "Being Rescheduled",   match: i => i.status === "declined" },
  { key: "completed",      label: "Completed",           match: i => i.status === "completed" },
  { key: "partially_completed", label: "Partially Completed", match: i => i.status === "partially_completed" },
  { key: "cancelled",      label: "Cancelled",           match: i => i.status === "cancelled" },
  { key: "no_show",        label: "Missed",              match: i => i.status === "no_show" },
];
// Sections whose interviews can still be acted on (Join Meet / Request
// Reschedule) and get the larger, higher-contrast card — everything else
// (completed/cancelled/etc.) gets the compact, muted "past" card.
const ACTIVE_SECTION_KEYS = new Set(["pending_acceptance", "reschedule_requested", "reschedule_approved", "scheduled", "declined"]);

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
}

// templateName and round can differ (e.g. templateName "Frontend
// Development", round "Technical Round 1") — showing only one or the other
// (as the My Interviews cards used to, preferring round) silently dropped
// whichever wasn't picked. Showing both when they differ, so the card
// title always identifies the actual template, not just which round of it.
function interviewTitle(iv) {
  if (iv.templateName && iv.round && iv.templateName !== iv.round) return `${iv.templateName} — ${iv.round}`;
  return iv.templateName || iv.round || "Interview";
}

const NAV = [
  { id: "overview", label: "Overview",      icon: LayoutGrid },
  { id: "details",  label: "My Details",    icon: User },
  { id: "slots",    label: "Book an Interview", icon: CalendarPlus },
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
  const [resources, setResources] = useState(null);
  const [newInviteIds, setNewInviteIds] = useState(new Set());
  const [expandedInviteId, setExpandedInviteId] = useState(null);
  const [aiReportInterview, setAiReportInterview] = useState(null);
  const [bookingTemplateId, setBookingTemplateId] = useState(null);
  const [activeInterviewTab, setActiveInterviewTab] = useState("all");

  const loadDashboard = async ({ expandInviteId } = {}) => {
    try {
      const res = await fetch("/api/sso/me", { credentials: "include" });
      if (res.status === 401) { navigate("/student/portal", { replace: true }); return; }
      const json = await res.json();
      if (!res.ok) { setError(json.error || "load_failed"); setLoading(false); return; }

      // Compare against what this browser already saw last visit BEFORE
      // marking the current set as seen — gives a one-time "new" flag per
      // invite rather than a persistent/never-clearing badge.
      const bookableNow = (json.pendingInvites || []).filter(i => ["sent", "otp_verified"].includes(i.status));
      const seen = readSeenInviteIds();
      setNewInviteIds(new Set(bookableNow.filter(i => !seen.has(i.id)).map(i => i.id)));
      writeSeenInviteIds(new Set(bookableNow.map(i => i.id)));
      if (expandInviteId) setExpandedInviteId(expandInviteId);
      else if (bookableNow.length) setExpandedInviteId(bookableNow[0].id);

      setData(json);
      setResumeLink(json.candidate?.resumeLink || "");
      return json;
    } catch {
      setError("network_error");
    }
  };

  useEffect(() => {
    (async () => {
      // InlineSlotPicker (Slot Overview tab) reads/writes availability and
      // scheduleInvites via the client Firestore SDK, same as the rest of
      // the student-facing booking flow — that needs an authenticated
      // (even if anonymous) session for the current Firestore rules.
      await signInAnonymously(auth).catch(() => {});
      await loadDashboard();
      getPreInterviewResources().then(setResources).catch(() => {});
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSelfBook = async (templateId) => {
    setBookingTemplateId(templateId);
    try {
      const res = await fetch("/api/sso/interviews/self-book", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (res.ok) {
        await loadDashboard({ expandInviteId: json.inviteId });
        setTab("slots");
      } else {
        alert("Couldn't start booking for this template. Please try again.");
      }
    } catch {
      alert("Couldn't start booking for this template. Please try again.");
    }
    setBookingTemplateId(null);
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
  // bookSlotForCandidate (api/scheduling.ts) sets status straight to
  // "pending_confirmation" — "slot_selected" is kept here too defensively,
  // but was the only value this checked before, which meant a candidate's
  // own just-picked slot fell through every bucket (not "bookable" since
  // it's no longer sent/otp_verified, not caught here either) and simply
  // vanished from the tab — same template still blocked from a fresh
  // "Find Slots" by templatesInProgress, with nothing to show in its place.
  const awaiting = pendingInvites.filter(i => i.status === "slot_selected" || i.status === "pending_confirmation");
  const templatesInProgress = new Set(pendingInvites.map(i => i.templateId).filter(Boolean));
  const nextUpcoming = upcoming.find(i => i.status === "scheduled" && i.scheduledDate);

  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = tab === item.id;
    const badge = item.id === "slots" ? bookable.length : item.id === "interviews" ? upcoming.length : 0;
    const hasNew = item.id === "slots" && newInviteIds.size > 0;
    return (
      <button onClick={() => setTab(item.id)}
        className={`relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          active ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}>
        <span className="relative flex-shrink-0">
          <Icon className="w-4 h-4" />
          {hasNew && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />}
        </span>
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

        {/* Main content — fills the rest of the page next to the fixed-width
           sidebar instead of capping out at max-w-3xl and leaving most of a
           wide screen empty; applies to every tab since they all render
           inside this one wrapper. */}
        <div className="flex-1 min-w-0">
          <div className="px-8 py-8">

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
                    <p className="font-bold text-gray-900">{interviewTitle(nextUpcoming)}</p>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mt-1">
                      <CalendarClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Book an Interview</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Pick an open slot for any interview that's ready to book, or start one of your assigned templates below.</p>
                </div>

                {(resources?.videoGuideUrl || resources?.documents?.length > 0) && (
                  <Card className="p-5 bg-amber-50/50 border-amber-200">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2.5">Before You Book</p>
                    <div className="flex flex-wrap gap-2">
                      {resources.videoGuideUrl && (
                        <a href={resources.videoGuideUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                          <PlayCircle className="w-3.5 h-3.5" /> {resources.videoGuideLabel || "Setup Video Guide"}
                        </a>
                      )}
                      {(resources.documents || []).map(doc => (
                        <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                          <FileDown className="w-3.5 h-3.5" /> {doc.label}
                        </a>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Assigned templates that haven't been started yet — "Find
                   Slots" kicks off self-book (see handleSelfBook), which
                   turns into one of the expandable cards below once it has
                   an invite. Templates already in progress are left out
                   here since they already have a card below. */}
                {templates.filter(t => !templatesInProgress.has(t.id)).map(t => (
                  <Card key={t.id} className="p-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.durationMinutes} minutes · open panelist slots for the next 7 days</p>
                    </div>
                    <Button variant="primary" onClick={() => handleSelfBook(t.id)} disabled={bookingTemplateId === t.id} className="flex-shrink-0">
                      {bookingTemplateId === t.id ? "Finding Slots…" : "Find Slots"}
                    </Button>
                  </Card>
                ))}

                {templates.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <CalendarPlus className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No templates assigned yet — check back later or contact the admin team.</p>
                  </Card>
                ) : bookable.length === 0 && awaiting.length === 0 ? (
                  // Only worth a card of its own when there's an in-progress
                  // template with nothing actionable (e.g. awaiting admin
                  // confirmation covers it) — if nothing's in progress at
                  // all, the "Find Slots" cards above already are the call
                  // to action, so this would just be a redundant message.
                  templatesInProgress.size > 0 && (
                    <Card className="flex flex-col items-center justify-center py-10">
                      <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">Nothing to book right now.</p>
                    </Card>
                  )
                ) : (
                  <>
                    {bookable.map(inv => {
                      const isExpanded = expandedInviteId === inv.id;
                      return (
                        <Card key={inv.id} className="overflow-hidden">
                          <button
                            onClick={() => setExpandedInviteId(isExpanded ? null : inv.id)}
                            className="flex items-center justify-between gap-3 w-full px-6 py-4 text-left hover:bg-gray-50/70 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              <div className="min-w-0">
                                <p className="font-bold text-gray-900 truncate">{inv.round || inv.templateName || "Interview"}</p>
                                {inv.dateRangeStart && (
                                  <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                    <CalendarClock className="w-3 h-3" />
                                    Book between {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {newInviteIds.has(inv.id) && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">NEW</span>
                              )}
                              <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border-violet-200">
                                Ready to Book
                              </span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-6 pb-6 pt-1 border-t border-gray-50">
                              <InlineSlotPicker invite={inv} onBooked={() => window.location.reload()} />
                            </div>
                          )}
                        </Card>
                      );
                    })}
                    {awaiting.map(inv => (
                      <Card key={inv.id} className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-violet-800 font-medium">
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
                    {/* Quick-view tabs — one per status plus "All", same
                       underline-tab style used elsewhere in the app, so
                       jumping straight to e.g. Reschedule Requested doesn't
                       mean scrolling past every other section first. */}
                    <div className="flex border-b border-gray-200 mb-2 overflow-x-auto">
                      {[{ key: "all", label: "All" }, ...INTERVIEW_SECTIONS].map(tab => {
                        const count = tab.key === "all" ? interviews.length : interviews.filter(tab.match).length;
                        const isActiveTab = activeInterviewTab === tab.key;
                        return (
                          <button key={tab.key} onClick={() => setActiveInterviewTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex-shrink-0 ${
                              isActiveTab
                                ? "border-brand-600 text-brand-600"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            }`}>
                            {tab.label}
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                              isActiveTab ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
                            }`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    {(activeInterviewTab === "all"
                      ? INTERVIEW_SECTIONS
                      : INTERVIEW_SECTIONS.filter(s => s.key === activeInterviewTab)
                    ).every(section => interviews.filter(section.match).length === 0) && (
                      <Card className="flex flex-col items-center justify-center py-10">
                        <Inbox className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-sm text-gray-400">Nothing here yet.</p>
                      </Card>
                    )}

                    {(activeInterviewTab === "all"
                      ? INTERVIEW_SECTIONS
                      : INTERVIEW_SECTIONS.filter(s => s.key === activeInterviewTab)
                    ).map(section => {
                      const items = interviews.filter(section.match);
                      if (items.length === 0) return null;
                      const isActive = ACTIVE_SECTION_KEYS.has(section.key);
                      return (
                        <div key={section.key} className="space-y-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">
                            {section.label} <span className="text-gray-300">({items.length})</span>
                          </p>
                          {items.map(iv => isActive ? (
                            <Card key={iv.id} className="p-6">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <p className="font-bold text-gray-900">{interviewTitle(iv)}</p>
                                  {iv.scheduledDate && (
                                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mt-1">
                                      <CalendarClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      {formatDate(iv.scheduledDate)} · {iv.scheduledTime} · {iv.duration}m
                                    </p>
                                  )}
                                </div>
                                <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${
                                  iv.rescheduleRequested ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : iv.rescheduleApproved ? "bg-sky-50 text-sky-700 border-sky-200"
                                    : (STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200")
                                }`}>
                                  {iv.rescheduleRequested ? "Reschedule Requested" : iv.rescheduleApproved ? "Reschedule Approved" : (STATUS_LABEL[iv.status] || iv.status)}
                                </span>
                              </div>
                              {iv.rescheduleApproved && (
                                <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3">
                                  Your reschedule request was approved — kindly select a slot whenever you're available.
                                </p>
                              )}
                              <div className="flex gap-2">
                                {iv.meetLink && iv.status === "scheduled" && !iv.rescheduleApproved && (
                                  <a href={iv.meetLink} target="_blank" rel="noreferrer"
                                    className="flex items-center justify-center gap-1.5 flex-1 text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                                    <Video className="w-3.5 h-3.5" /> Join Meet
                                  </a>
                                )}
                                {iv.status === "scheduled" && !iv.rescheduleRequested && !iv.rescheduleApproved && (
                                  <button onClick={() => handleRequestReschedule(iv.id)} disabled={reschedulingId === iv.id}
                                    className="flex items-center justify-center gap-1.5 flex-1 text-center bg-white border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                                    <RefreshCw className="w-3.5 h-3.5" /> {reschedulingId === iv.id ? "Submitting…" : "Request Reschedule"}
                                  </button>
                                )}
                                {iv.rescheduleApproved && (
                                  <button onClick={() => setTab("slots")}
                                    className="flex items-center justify-center gap-1.5 flex-1 text-center bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                                    <CalendarPlus className="w-3.5 h-3.5" /> Book an Interview
                                  </button>
                                )}
                              </div>
                            </Card>
                          ) : (
                            <Card key={iv.id} className="p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="opacity-80">
                                  <p className="font-semibold text-gray-700 text-sm">{interviewTitle(iv)}</p>
                                  {iv.scheduledDate && (
                                    <p className="text-sm font-medium text-gray-500 mt-1">{formatDate(iv.scheduledDate)} · {iv.scheduledTime}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {iv.aiReport && (
                                    <button onClick={() => setAiReportInterview(iv)}
                                      className="flex items-center gap-1 text-xs font-semibold text-brand-600 border border-brand-200 bg-brand-50 px-2.5 py-1 rounded-full hover:bg-brand-100 transition-colors">
                                      <Sparkles className="w-3 h-3" /> View Report
                                    </button>
                                  )}
                                  <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                    {STATUS_LABEL[iv.status] || iv.status}
                                  </span>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      <AiReportModal
        interview={aiReportInterview}
        loading={false}
        status={null}
        readOnly
        onClose={() => setAiReportInterview(null)}
      />
    </ErrorBoundary>
  );
}
