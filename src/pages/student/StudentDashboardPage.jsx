import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, LayoutGrid, CalendarRange, ListChecks, Clock3, FileText, RefreshCw,
  ChevronDown, ChevronRight, Sparkles, PlayCircle, FileDown, CalendarPlus,
  CheckCircle2, XCircle,
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
  scheduled:           "Scheduled",
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
// "Past" catch-all) so every outcome is its own clearly labeled, trackable
// group rather than lumped together. "Being Rescheduled" (an interviewer
// declined and admin needs to reassign) is folded into Reschedule Approved
// rather than kept as its own tab — from the candidate's side both mean the
// same thing ("this round is being re-arranged, a new slot is coming"), just
// triggered from different sides (candidate request vs interviewer decline).
// "Missed" (no_show) has no tab at all — a student who didn't show up
// already knows; it's not something they need a dedicated view to track.
const INTERVIEW_SECTIONS = [
  { key: "pending_acceptance", label: "Scheduling In Progress", match: i => i.status === "pending_acceptance" },
  { key: "scheduled",      label: "Scheduled",            match: i => i.status === "scheduled" && !i.rescheduleRequested && !i.rescheduleApproved },
  { key: "completed",      label: "Completed",           match: i => i.status === "completed" },
  { key: "reschedule_requested", label: "Reschedule Requested", match: i => i.status === "scheduled" && i.rescheduleRequested },
  { key: "reschedule_approved", label: "Reschedule Approved", match: i => (i.status === "scheduled" && i.rescheduleApproved && !i.rescheduleRequested) || i.status === "declined" },
  { key: "partially_completed", label: "Partially Completed", match: i => i.status === "partially_completed" },
  { key: "cancelled",      label: "Cancelled",           match: i => i.status === "cancelled" },
];
// Sections whose interviews can still be acted on (Join Meet / Request
// Reschedule) and get the larger, higher-contrast card — everything else
// (completed/cancelled/etc.) gets the compact, muted "past" card.
const ACTIVE_SECTION_KEYS = new Set(["pending_acceptance", "reschedule_requested", "reschedule_approved", "scheduled"]);

function todayIso() { return new Date().toISOString().slice(0, 10); }

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function Card({ children, className = "", innerRef }) {
  return <div ref={innerRef} className={`bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-md transition-shadow duration-200 ${className}`}>{children}</div>;
}

// Per-nav-item accent color — gives each section of the dashboard its own
// identity (icon chip color, active-state tint) instead of everything
// sharing the same flat brand blue.
const ACCENT_CHIP = {
  indigo:  "bg-indigo-50 text-indigo-600",
  violet:  "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber:   "bg-amber-50 text-amber-600",
};
const ACCENT_CHIP_ACTIVE = {
  indigo:  "bg-indigo-600 text-white",
  violet:  "bg-violet-600 text-white",
  emerald: "bg-emerald-600 text-white",
  amber:   "bg-amber-600 text-white",
};
const ACCENT_BORDER = {
  indigo:  "border-l-indigo-500",
  violet:  "border-l-violet-500",
  emerald: "border-l-emerald-500",
  amber:   "border-l-amber-500",
  sky:     "border-l-sky-500",
  orange:  "border-l-orange-400",
  blue:    "border-l-blue-500",
  gray:    "border-l-gray-300",
};
// Left-border accent per My Interviews section, matched to that section's
// status badge color so the two reinforce each other at a glance.
const SECTION_ACCENT = {
  pending_acceptance:   "amber",
  scheduled:             "blue",
  completed:              "emerald",
  reschedule_requested:   "amber",
  reschedule_approved:    "sky",
  partially_completed:    "sky",
  cancelled:               "gray",
};
// Each My Interviews quick-view tab gets its own color so the band reads
// at a glance instead of every tab/badge looking the same gray/blue.
const TAB_COLORS = {
  all:                    { text: "text-indigo-600",  border: "border-indigo-600",  badgeBg: "bg-indigo-100",  badgeText: "text-indigo-700" },
  pending_acceptance:     { text: "text-amber-600",   border: "border-amber-600",   badgeBg: "bg-amber-100",   badgeText: "text-amber-700" },
  scheduled:              { text: "text-blue-600",    border: "border-blue-600",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700" },
  completed:              { text: "text-emerald-600", border: "border-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700" },
  reschedule_requested:   { text: "text-orange-600",  border: "border-orange-600",  badgeBg: "bg-orange-100",  badgeText: "text-orange-700" },
  reschedule_approved:    { text: "text-sky-600",     border: "border-sky-600",     badgeBg: "bg-sky-100",     badgeText: "text-sky-700" },
  partially_completed:    { text: "text-teal-600",    border: "border-teal-600",    badgeBg: "bg-teal-100",    badgeText: "text-teal-700" },
  cancelled:              { text: "text-gray-500",    border: "border-gray-400",    badgeBg: "bg-gray-200",    badgeText: "text-gray-600" },
};

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
  { id: "overview", label: "Overview",      icon: LayoutGrid, accent: "indigo" },
  { id: "details",  label: "My Details",    icon: User, accent: "violet" },
  { id: "slots",    label: "Book an Interview", icon: CalendarPlus, accent: "emerald" },
  { id: "interviews", label: "My Interviews", icon: ListChecks, accent: "amber" },
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
  const [newBookingTemplateId, setNewBookingTemplateId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [activeInterviewTab, setActiveInterviewTab] = useState("all");
  const [checkingInviteId, setCheckingInviteId] = useState(null);
  // The active self-book-in-progress draft — no ScheduleInvite exists for
  // it yet (see handleSelfBook / ensureSelfBookInvite), so abandoning it
  // without picking a slot leaves nothing behind.
  const [selfBookDraft, setSelfBookDraft] = useState(null);
  const expandedCardRef = useRef(null);

  // The expanded "Ready to Book" card behaves like a popover, not a
  // permanent section — it should collapse itself if the candidate leaves
  // it without picking a slot, instead of silently staying open forever
  // (so it's unexpectedly still expanded next time they land back here).
  useEffect(() => {
    if (tab !== "slots") { setExpandedInviteId(null); setSelfBookDraft(null); }
  }, [tab]);
  useEffect(() => {
    if (!expandedInviteId) return;
    const onPointerDown = (e) => {
      if (expandedCardRef.current && !expandedCardRef.current.contains(e.target)) {
        setExpandedInviteId(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [expandedInviteId]);

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

  // Read-only — fetches what the slot picker needs (duration/date-range/
  // eligible interviewers) without creating a ScheduleInvite. If one's
  // already in progress for this template (e.g. a previous session's draft
  // that did get confirmed, or got interrupted after ensureSelfBookInvite
  // ran), self-book-start hands back that real invite instead so it's
  // resumed rather than duplicated.
  const handleSelfBook = async (templateId) => {
    setBookingTemplateId(templateId);
    try {
      const res = await fetch("/api/sso/interviews/self-book-start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (res.ok) {
        setSelfBookDraft(json);
        setTab("slots");
        setShowTemplatePicker(false);
        setNewBookingTemplateId("");
      } else {
        alert("Couldn't start booking for this template. Please try again.");
      }
    } catch {
      alert("Couldn't start booking for this template. Please try again.");
    }
    setBookingTemplateId(null);
  };

  // Passed to InlineSlotPicker as `ensureInvite` — only called right before
  // the candidate actually confirms a slot, so a draft that's never
  // confirmed never creates a ScheduleInvite at all.
  const ensureSelfBookInvite = async () => {
    if (!selfBookDraft) return null;
    if (selfBookDraft.inviteId) {
      return { id: selfBookDraft.inviteId, duration: selfBookDraft.duration, round: selfBookDraft.templateName, candidateName: data?.candidate?.name };
    }
    try {
      const res = await fetch("/api/sso/interviews/self-book", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({ templateId: selfBookDraft.templateId }),
      });
      const json = await res.json();
      if (!res.ok) { alert("Couldn't confirm this booking. Please try again."); return null; }
      return { id: json.inviteId, duration: selfBookDraft.duration, round: selfBookDraft.templateName, candidateName: data?.candidate?.name };
    } catch {
      alert("Couldn't confirm this booking. Please try again.");
      return null;
    }
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
  // All upcoming interviews with a confirmed date, soonest first — previously
  // this picked the first array match regardless of date, so a 16th could
  // sit hidden behind a 17th that happened to come first in query order.
  const upcomingScheduled = upcoming
    .filter(i => i.scheduledDate)
    .slice()
    .sort((a, b) => `${a.scheduledDate}T${a.scheduledTime || ""}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime || ""}`));
  // Still within its booking window and not yet picked — the only kind
  // that's actually expandable into a slot picker. Self-booked invites are
  // excluded here — they're never left sitting around unbooked anymore
  // (see selfBookDraft/ensureSelfBookInvite), so this list is Nudge-sent
  // invites only; a self-booked one only ever shows up once it's actually
  // "awaiting" below.
  const todayStr = todayIso();
  const bookableAll = pendingInvites.filter(i => ["sent", "otp_verified"].includes(i.status) && !i.selfBooked);
  const bookable = bookableAll.filter(i => !i.dateRangeEnd || i.dateRangeEnd >= todayStr);
  // Window ran out before the candidate picked a slot — shown as "Missed",
  // no slot list, nothing left to act on.
  const missed = bookableAll.filter(i => i.dateRangeEnd && i.dateRangeEnd < todayStr);
  // bookSlotForCandidate (api/scheduling.ts) sets status straight to
  // "pending_confirmation" — "slot_selected" is kept here too defensively,
  // but was the only value this checked before, which meant a candidate's
  // own just-picked slot fell through every bucket (not "bookable" since
  // it's no longer sent/otp_verified, not caught here either) and simply
  // vanished from the tab — same template still blocked from a fresh
  // "Find Slots" by templatesInProgress, with nothing to show in its place.
  const awaiting = pendingInvites.filter(i => i.status === "slot_selected" || i.status === "pending_confirmation");
  const templatesInProgress = new Set(pendingInvites.map(i => i.templateId).filter(Boolean));
  // Overview's "Upcoming" list — confirmed interviews plus slots already
  // picked but still waiting on admin confirmation, merged into one
  // soonest-first list. A slot the candidate already picked (via Nudge or
  // self-book) is "upcoming" from their point of view even before an admin
  // has signed off on it, so it belongs here too, not just in the Book an
  // Interview tab.
  const upcomingCombined = [
    ...upcomingScheduled.map(iv => ({
      id: iv.id, title: interviewTitle(iv), date: iv.scheduledDate, time: iv.scheduledTime,
      duration: iv.duration, meetLink: iv.meetLink, pending: false,
    })),
    ...awaiting.map(inv => ({
      id: inv.id, title: inv.round || inv.templateName || "Interview", date: inv.bookedDate, time: inv.bookedTime,
      duration: inv.duration, meetLink: null, pending: true,
    })),
  ]
    .filter(x => x.date)
    .sort((a, b) => `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`));
  // Overview's summary cards.
  const overviewStats = [
    { label: "Scheduled", value: interviews.filter(i => i.status === "scheduled").length, icon: CalendarClock, chip: "bg-blue-50 text-blue-600" },
    { label: "Completed", value: interviews.filter(i => i.status === "completed").length,  icon: CheckCircle2,  chip: "bg-emerald-50 text-emerald-600" },
    { label: "Cancelled", value: interviews.filter(i => i.status === "cancelled").length,  icon: XCircle,       chip: "bg-gray-100 text-gray-500" },
  ];
  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = tab === item.id;
    // Matches exactly what each tab renders by default — the slots badge
    // is every card shown under Book an Interview (bookable + awaiting +
    // missed, now combined into one list), and the interviews badge is
    // the same total the "All" quick-tab shows under My Interviews.
    const badge = item.id === "slots" ? (bookable.length + awaiting.length + missed.length) : item.id === "interviews" ? interviews.length : 0;
    const hasNew = item.id === "slots" && newInviteIds.size > 0;
    return (
      <button onClick={() => setTab(item.id)}
        className={`relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          active ? "bg-gradient-to-r from-brand-50 to-violet-50/70 text-brand-700 shadow-sm" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}>
        <span className={`relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
          active ? ACCENT_CHIP_ACTIVE[item.accent] : ACCENT_CHIP[item.accent]
        }`}>
          <Icon className="w-3.5 h-3.5" />
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50/40 flex">
        {/* Left sidebar */}
        <div className="w-60 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 min-h-screen">
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
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
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 px-6 py-7 text-white shadow-lg">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
                  <div className="absolute -bottom-14 -left-10 w-36 h-36 bg-white/10 rounded-full pointer-events-none" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {(candidate.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight">Welcome, {candidate.name}</h1>
                      <p className="text-sm text-white/80 mt-0.5">Here's where things stand with your interviews.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {overviewStats.map(s => (
                    <Card key={s.label} className="p-5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide truncate">{s.label}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                      </div>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${s.chip}`}>
                        <s.icon className="w-4 h-4" />
                      </div>
                    </Card>
                  ))}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Upcoming</p>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      {upcomingCombined.length}
                    </span>
                  </div>
                  {upcomingCombined.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-10">
                      <CalendarClock className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No upcoming interviews right now.</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {upcomingCombined.map(iv => (
                        <Card key={iv.id} className={`p-5 flex items-center justify-between gap-3 flex-wrap border-l-4 ${
                          iv.pending ? ACCENT_BORDER.emerald : ACCENT_BORDER.indigo
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              iv.pending ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                            }`}>
                              <CalendarClock className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{iv.title}</p>
                              <p className="text-sm font-semibold text-gray-600 mt-0.5">
                                {formatDate(iv.date)} · {iv.time}{iv.duration ? ` · ${iv.duration}m` : ""}
                              </p>
                            </div>
                          </div>
                          {iv.pending ? (
                            <span className="text-[11px] font-semibold border px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0">
                              Slot Booked — Pending Confirmation
                            </span>
                          ) : iv.meetLink && (
                            <a href={iv.meetLink} target="_blank" rel="noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 text-center bg-brand-600 text-white font-semibold py-2.5 px-6 rounded-xl text-sm hover:bg-brand-700 transition-colors flex-shrink-0">
                              <Video className="w-3.5 h-3.5" /> Join Meet
                            </a>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {tab === "details" && (
              <div className="space-y-5 max-w-2xl">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Details</h1>
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
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
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
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
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <CalendarPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 tracking-tight">Book an Interview</h1>
                      <p className="text-sm text-gray-500 mt-0.5">Pick an open slot for any interview that's ready to book, or self-book one of your assigned templates.</p>
                    </div>
                  </div>
                  {/* Always visible rather than silently disappearing once
                     every assigned template already has an invite in
                     progress — a single remaining template jumps straight
                     to Find Slots, more than one reveals the template
                     picker below instead of a modal, and none left just
                     explains why instead of looking like the button never
                     existed. */}
                  {(() => {
                    const notStarted = templates.filter(t => !templatesInProgress.has(t.id));
                    const disabled = bookingTemplateId != null || notStarted.length === 0;
                    return (
                      <Button variant="primary" className="flex-shrink-0" disabled={disabled}
                        title={notStarted.length === 0
                          ? (templates.length === 0
                              ? "No templates assigned to you yet"
                              : "All your assigned templates already have a booking in progress")
                          : undefined}
                        onClick={() => {
                          if (notStarted.length === 0) return;
                          if (notStarted.length === 1) { handleSelfBook(notStarted[0].id); return; }
                          setShowTemplatePicker(v => !v);
                        }}>
                        <CalendarPlus className="w-4 h-4 mr-1.5 inline" />
                        {bookingTemplateId ? "Finding Slots…" : "Self Book an Interview"}
                      </Button>
                    );
                  })()}
                </div>

                {showTemplatePicker && (() => {
                  const notStarted = templates.filter(t => !templatesInProgress.has(t.id));
                  if (notStarted.length <= 1) return null;
                  const selected = notStarted.find(t => t.id === newBookingTemplateId) || null;
                  return (
                    <Card className="p-5">
                      <p className="font-bold text-gray-900">Select a template</p>
                      <p className="text-xs text-gray-400 mt-0.5 mb-3">You have {notStarted.length} templates ready to start — pick one to see its open slots.</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={newBookingTemplateId}
                          onChange={e => setNewBookingTemplateId(e.target.value)}
                          className="flex-1 min-w-[200px] border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
                          <option value="">Select a template…</option>
                          {notStarted.map(t => <option key={t.id} value={t.id}>{t.name} · {t.durationMinutes}m</option>)}
                        </select>
                        <Button variant="primary" onClick={() => handleSelfBook(newBookingTemplateId)}
                          disabled={!selected || bookingTemplateId === newBookingTemplateId} className="flex-shrink-0">
                          {bookingTemplateId === newBookingTemplateId ? "Finding Slots…" : "Find Slots"}
                        </Button>
                      </div>
                    </Card>
                  );
                })()}

                {/* The active self-book draft — no ScheduleInvite exists
                   for this yet (see ensureSelfBookInvite), so Cancel or
                   navigating away (useEffect above) leaves nothing behind. */}
                {selfBookDraft && (
                  <Card className={`overflow-hidden border-l-4 ${ACCENT_BORDER.emerald}`}>
                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-50">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{selfBookDraft.templateName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Pick a slot below to confirm — nothing is booked until you do.</p>
                      </div>
                      <button onClick={() => setSelfBookDraft(null)}
                        className="text-xs font-semibold text-gray-400 hover:text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50 flex-shrink-0 transition-colors">
                        Cancel
                      </button>
                    </div>
                    <div className="px-6 pb-6 pt-1">
                      <InlineSlotPicker
                        invite={{ ...selfBookDraft, id: selfBookDraft.inviteId }}
                        ensureInvite={ensureSelfBookInvite}
                        onBooked={() => window.location.reload()}
                      />
                    </div>
                  </Card>
                )}

                {templates.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <CalendarPlus className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No templates assigned yet — check back later or contact the admin team.</p>
                  </Card>
                ) : bookable.length === 0 && awaiting.length === 0 && missed.length === 0 && !selfBookDraft ? (
                  // Only worth a card of its own when there's an in-progress
                  // template with nothing actionable (e.g. awaiting admin
                  // confirmation covers it) — if nothing's in progress at
                  // all, the "Self Book an Interview" button above is
                  // already the call to action, so this would be redundant.
                  templatesInProgress.size > 0 && (
                    <Card className="flex flex-col items-center justify-center py-10">
                      <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">Nothing to book right now.</p>
                    </Card>
                  )
                ) : (
                  <>
                    {/* One unified list, ordered actionable-first: still
                       bookable, already booked (awaiting confirmation),
                       then missed (window closed, nothing ever picked) —
                       each kind gets its own status badge so there's no
                       ambiguity about what still needs action. */}
                    {bookable.map(inv => {
                      const isExpanded = expandedInviteId === inv.id;
                      return (
                        <Card key={inv.id} innerRef={isExpanded ? expandedCardRef : undefined} className={`overflow-hidden border-l-4 ${ACCENT_BORDER.violet}`}>
                          <button
                            onClick={async () => {
                              if (isExpanded) { setExpandedInviteId(null); return; }
                              // Re-sync before expanding — this invite may have
                              // already been booked from the emailed link since
                              // the dashboard last loaded. Expanding straight
                              // from stale data would let the candidate pick a
                              // slot for a request that's no longer open; a
                              // fresh fetch here means they either get the live
                              // slot picker or see it's already "Slot Booked"
                              // below, never a stale picker that fails on confirm.
                              setCheckingInviteId(inv.id);
                              await loadDashboard({ expandInviteId: inv.id });
                              setCheckingInviteId(null);
                            }}
                            disabled={checkingInviteId === inv.id}
                            className="flex items-center justify-between gap-3 w-full px-6 py-4 text-left hover:bg-gray-50/70 transition-colors disabled:cursor-wait">
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              <div className="min-w-0">
                                <p className="font-bold text-gray-900 truncate">{inv.round || inv.templateName || "Interview"}</p>
                                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                  {inv.dateRangeStart && (
                                    <p className="flex items-center gap-1 text-xs text-gray-400">
                                      <CalendarClock className="w-3 h-3" />
                                      Book between {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                                    </p>
                                  )}
                                  {/* Where this invite came from — an admin-sent
                                     nudge vs. you starting it yourself from this
                                     dashboard (see handleSelfBook/selfBooked). */}
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                    inv.selfBooked ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-indigo-50 text-indigo-600 border-indigo-200"
                                  }`}>
                                    {inv.selfBooked ? "Self-booked" : "Sent via Nudge"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {newInviteIds.has(inv.id) && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">NEW</span>
                              )}
                              {checkingInviteId === inv.id ? (
                                <span className="flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border-gray-200">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border-violet-200">
                                  Ready to Book
                                </span>
                              )}
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
                      <Card key={inv.id} className={`overflow-hidden border-l-4 ${ACCENT_BORDER.emerald}`}>
                        <div className="flex items-center justify-between gap-3 px-6 py-4">
                          <div className="flex items-start gap-2 min-w-0">
                            <Clock3 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 font-bold truncate">{inv.round || inv.templateName || "Interview"}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {inv.bookedDate ? `${formatDate(inv.bookedDate)} · ${inv.bookedTime}` : "Slot selected"} — no changes can be made now.
                                You'll get a confirmation email once an admin approves it.
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0">
                            Slot Booked
                          </span>
                        </div>
                      </Card>
                    ))}
                    {missed.map(inv => (
                      <Card key={inv.id} className={`overflow-hidden opacity-70 border-l-4 ${ACCENT_BORDER.orange}`}>
                        <div className="flex items-center justify-between gap-3 px-6 py-4">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-700 font-bold truncate">{inv.round || inv.templateName || "Interview"}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Booking window ended {formatDate(inv.dateRangeEnd)} — no slot was selected in time.
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border-orange-200 flex-shrink-0">
                            Missed
                          </span>
                        </div>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === "interviews" && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Interviews</h1>
                </div>

                {(resources?.videoGuideUrl || resources?.documents?.length > 0) && (
                  <Card className="p-5 bg-amber-50/50 border-amber-200">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2.5">Before joining the interview, kindly refer to</p>
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

                {interviews.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <Inbox className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No interviews yet.</p>
                  </Card>
                ) : (
                  <>
                    {/* Quick-view tabs — one per status plus "All", each
                       with its own color (matched to that status's badge
                       elsewhere) so the band reads at a glance instead of
                       every tab looking the same. */}
                    <div className="flex border-b border-gray-200 mb-2 overflow-x-auto">
                      {[{ key: "all", label: "All" }, ...INTERVIEW_SECTIONS].map(tab => {
                        const count = tab.key === "all" ? interviews.length : interviews.filter(tab.match).length;
                        const isActiveTab = activeInterviewTab === tab.key;
                        const c = TAB_COLORS[tab.key] || TAB_COLORS.cancelled;
                        return (
                          <button key={tab.key} onClick={() => setActiveInterviewTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex-shrink-0 ${
                              isActiveTab ? `${c.border} ${c.text}` : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            }`}>
                            {tab.label}
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${c.badgeBg} ${c.badgeText}`}>{count}</span>
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
                      const accent = SECTION_ACCENT[section.key] || "gray";
                      return (
                        <div key={section.key} className="space-y-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4">
                            {section.label} <span className="text-gray-300">({items.length})</span>
                          </p>
                          {items.map(iv => isActive ? (
                            <Card key={iv.id} className={`p-6 border-l-4 ${ACCENT_BORDER[accent]}`}>
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
                              <div className="flex flex-wrap gap-2">
                                {iv.meetLink && iv.status === "scheduled" && !iv.rescheduleApproved && (
                                  <a href={iv.meetLink} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 text-center bg-brand-600 text-white font-semibold py-2.5 px-5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                                    <Video className="w-3.5 h-3.5" /> Join Meet
                                  </a>
                                )}
                                {iv.status === "scheduled" && !iv.rescheduleRequested && !iv.rescheduleApproved && (
                                  <button onClick={() => handleRequestReschedule(iv.id)} disabled={reschedulingId === iv.id}
                                    className="inline-flex items-center justify-center gap-1.5 text-center bg-white border border-gray-200 text-gray-600 font-semibold py-2.5 px-5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                                    <RefreshCw className="w-3.5 h-3.5" /> {reschedulingId === iv.id ? "Submitting…" : "Request Reschedule"}
                                  </button>
                                )}
                                {iv.rescheduleApproved && (
                                  <button onClick={() => setTab("slots")}
                                    className="inline-flex items-center justify-center gap-1.5 text-center bg-brand-600 text-white font-semibold py-2.5 px-5 rounded-xl text-sm hover:bg-brand-700 transition-colors">
                                    <CalendarPlus className="w-3.5 h-3.5" /> Book an Interview
                                  </button>
                                )}
                              </div>
                            </Card>
                          ) : (
                            <Card key={iv.id} className={`p-5 border-l-4 ${ACCENT_BORDER[accent]}`}>
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
