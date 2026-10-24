import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, LayoutGrid, CalendarRange, ListChecks, Clock3, FileText, RefreshCw,
  ChevronDown, ChevronRight, Sparkles, PlayCircle, FileDown, CalendarPlus,
  CheckCircle2, XCircle, LifeBuoy, UserX, HelpCircle, Send,
} from "lucide-react";
import { formatDate, parseInterviewStart, formatDateTime } from "../../utils/dates";
import { getPreInterviewResources } from "../../api/firestore";
import InlineSlotPicker from "../../components/InlineSlotPicker";
import AiReportModal from "../../features/interviews/AiReportModal";
import IntegrityDetailModal from "../../features/interviews/IntegrityDetailModal";
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
  pending_confirmation: "Pending Confirmation",
  completed:            "Completed",
  partially_completed:  "Partially Completed",
  cancelled:            "Cancelled",
  declined:             "Being Rescheduled",
  no_show:              "Missed",
};
const STATUS_STYLE = {
  pending_acceptance: "bg-amber-50 text-amber-700 border-amber-200",
  pending_confirmation: "bg-violet-50 text-violet-700 border-violet-200",
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
const INTERVIEW_SECTIONS = [
  { key: "pending_confirmation", label: "Pending Confirmation", match: i => i.status === "pending_confirmation" },
  { key: "pending_acceptance", label: "Scheduling In Progress", match: i => i.status === "pending_acceptance" },
  { key: "scheduled",      label: "Scheduled",            match: i => i.status === "scheduled" && !i.rescheduleRequested && !i.rescheduleApproved },
  { key: "completed",      label: "Completed",           match: i => i.status === "completed" },
  { key: "reschedule_requested", label: "Reschedule Requested", match: i => i.status === "scheduled" && i.rescheduleRequested },
  { key: "reschedule_approved", label: "Reschedule Approved", match: i => (i.status === "scheduled" && i.rescheduleApproved && !i.rescheduleRequested) || i.status === "declined" },
  { key: "partially_completed", label: "Partially Completed", match: i => i.status === "partially_completed" },
  { key: "no_show",        label: "Missed",               match: i => i.status === "no_show" },
  { key: "cancelled",      label: "Cancelled",           match: i => i.status === "cancelled" },
];
// Sections whose interviews can still be acted on (Join Meet / Request
// Reschedule) and get the larger, higher-contrast card — everything else
// (completed/cancelled/etc.) gets the compact, muted "past" card.
// "Pending Confirmation" has no action to take (just waiting on an admin),
// but it's still an active, not-yet-resolved state, so it gets the larger
// card too — none of that card's action buttons key off this status, so
// none render, it just reads as more prominent than a done/dead entry.
const ACTIVE_SECTION_KEYS = new Set(["pending_confirmation", "pending_acceptance", "reschedule_requested", "reschedule_approved", "scheduled"]);

function todayIso() { return new Date().toISOString().slice(0, 10); }

// "3 days left to book" urgency badge for a still-open self-book/nudge
// window — turns a flat "Book between X–Y" date range into something that
// actually prompts action as the deadline gets close, instead of reading
// the same whether there's 3 weeks or 1 day left.
function daysLeftLabel(dateRangeEnd, todayStr) {
  if (!dateRangeEnd) return null;
  const end = new Date(dateRangeEnd + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const days = Math.round((end - today) / 86400000);
  if (days <= 0) return { text: "Last day to book!", urgent: true };
  if (days === 1) return { text: "1 day left to book", urgent: true };
  return { text: `${days} days left to book`, urgent: days <= 3 };
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function Card({ children, className = "", innerRef }) {
  return <div ref={innerRef} className={`bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className}`}>{children}</div>;
}

// Same entrance pattern every admin page already uses (fadeUp + staggered
// custom index) — the Student Dashboard never had it, so every tab just
// snapped into place with no motion at all. Applied at the tab-content
// level (whole tab fades/slides in on switch) and per-card where a list is
// rendered, for a consistent, polished feel across every tab.
const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.05, 0.3), duration: 0.3, ease: "easeOut" } }),
};

// Per-nav-item accent color — gives each section of the dashboard its own
// identity (icon chip color, active-state tint) instead of everything
// sharing the same flat brand blue.
const ACCENT_CHIP = {
  indigo:  "bg-indigo-50 text-indigo-600",
  violet:  "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber:   "bg-amber-50 text-amber-600",
  rose:    "bg-rose-50 text-rose-600",
};
const ACCENT_CHIP_ACTIVE = {
  indigo:  "bg-indigo-600 text-white",
  violet:  "bg-violet-600 text-white",
  emerald: "bg-emerald-600 text-white",
  amber:   "bg-amber-600 text-white",
  rose:    "bg-rose-600 text-white",
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
  rose:    "border-l-rose-400",
};
// Left-border accent per My Interviews section, matched to that section's
// status badge color so the two reinforce each other at a glance.
const SECTION_ACCENT = {
  pending_confirmation: "violet",
  pending_acceptance:   "amber",
  scheduled:             "blue",
  completed:              "emerald",
  reschedule_requested:   "amber",
  reschedule_approved:    "sky",
  partially_completed:    "sky",
  no_show:                 "rose",
  cancelled:               "gray",
};
// Each My Interviews quick-view tab gets its own color so the band reads
// at a glance instead of every tab/badge looking the same gray/blue.
const TAB_COLORS = {
  all:                    { text: "text-indigo-600",  border: "border-indigo-600",  badgeBg: "bg-indigo-100",  badgeText: "text-indigo-700" },
  pending_confirmation:   { text: "text-violet-600",  border: "border-violet-600",  badgeBg: "bg-violet-100",  badgeText: "text-violet-700" },
  pending_acceptance:     { text: "text-amber-600",   border: "border-amber-600",   badgeBg: "bg-amber-100",   badgeText: "text-amber-700" },
  scheduled:              { text: "text-blue-600",    border: "border-blue-600",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700" },
  completed:              { text: "text-emerald-600", border: "border-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700" },
  reschedule_requested:   { text: "text-orange-600",  border: "border-orange-600",  badgeBg: "bg-orange-100",  badgeText: "text-orange-700" },
  reschedule_approved:    { text: "text-sky-600",     border: "border-sky-600",     badgeBg: "bg-sky-100",     badgeText: "text-sky-700" },
  partially_completed:    { text: "text-teal-600",    border: "border-teal-600",    badgeBg: "bg-teal-100",    badgeText: "text-teal-700" },
  no_show:                { text: "text-rose-600",    border: "border-rose-600",    badgeBg: "bg-rose-100",    badgeText: "text-rose-700" },
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
  // Help removed from nav "for now" (not deleted) — the tab/handlers/state
  // all still exist and work if navigated to directly; re-add this entry
  // to bring it back.
  // { id: "help",      label: "Help",           icon: LifeBuoy, accent: "rose" },
];

// Mirrors QUERY_CATEGORIES in api/sso-handler.js's createQuery.
const QUERY_CATEGORIES = [
  { id: "ai_report",        label: "AI Report Not Generated", icon: Sparkles },
  { id: "panelist_no_show", label: "Panelist Didn't Join",     icon: UserX },
  { id: "slot_doubt",       label: "Slot Doubt",                icon: CalendarRange },
  { id: "other",             label: "Other",                     icon: HelpCircle },
];
const QUERY_STATUS_STYLE = {
  open:    "bg-amber-50 text-amber-700 border-amber-200",
  replied: "bg-sky-50 text-sky-700 border-sky-200",
  closed:  "bg-gray-100 text-gray-500 border-gray-200",
};
const QUERY_STATUS_LABEL = { open: "Open", replied: "Replied", closed: "Closed" };

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
  const [integrityInterview, setIntegrityInterview] = useState(null);
  const [bookingTemplateId, setBookingTemplateId] = useState(null);
  const [activeInterviewTab, setActiveInterviewTab] = useState("all");
  const [checkingInviteId, setCheckingInviteId] = useState(null);
  // The active self-book-in-progress draft — no ScheduleInvite exists for
  // it yet (see handleSelfBook / ensureSelfBookInvite), so abandoning it
  // without picking a slot leaves nothing behind.
  const [selfBookDraft, setSelfBookDraft] = useState(null);
  const expandedCardRef = useRef(null);

  // Help tab — raising a new query, and replying within an existing thread.
  const [queryCategory, setQueryCategory] = useState("ai_report");
  const [queryInterviewId, setQueryInterviewId] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [submittingQuery, setSubmittingQuery] = useState(false);
  const [expandedQueryId, setExpandedQueryId] = useState(null);
  const [queryReplyDrafts, setQueryReplyDrafts] = useState({});
  const [sendingQueryReply, setSendingQueryReply] = useState(null);

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

  // Queries aren't live-subscribed (the Help tab reads them off the same
  // one-shot /api/sso/me fetch as everything else — an anonymous student
  // session has no direct Firestore access to studentQueries at all, see
  // firestore.rules), so an admin's reply wouldn't show up here until the
  // candidate happened to reload the page. Light polling while this tab is
  // actually open is the cheapest way to make a reply feel like it arrives
  // on its own, without needing a live listener this session can't have.
  useEffect(() => {
    if (tab !== "help") return;
    const id = setInterval(() => { loadDashboard(); }, 15000);
    return () => clearInterval(id);
  }, [tab]);

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
        // If this template already had a Nudge invite, self-book-start
        // computed a wider EFFECTIVE date range just for this picker
        // (json.dateRangeStart/End) — the invite's own stored range is
        // never touched, so its "Book between" card in Ready to Book still
        // shows exactly what was sent. This refresh is just routine data
        // sync, not reconciling a changed range.
        loadDashboard();
      } else {
        // Surfaces the actual failure (e.g. template_not_assigned) instead
        // of a generic message that looks identical whether the request
        // never reached the server or was rejected for a specific reason.
        alert(`Couldn't start booking for this template (${json?.error || res.status}). Please try again.`);
      }
    } catch (e) {
      alert(`Couldn't start booking for this template — ${e?.message || "network error"}. Please try again.`);
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

  const handleSubmitQuery = async () => {
    if (!queryMessage.trim()) return;
    setSubmittingQuery(true);
    try {
      const res = await fetch("/api/sso/queries/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({
          category: queryCategory,
          message: queryMessage.trim(),
          interviewId: queryInterviewId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Please try again.");
      setQueryMessage("");
      setQueryInterviewId("");
      await loadDashboard();
    } catch (e) {
      alert("Couldn't send your query: " + e.message);
    }
    setSubmittingQuery(false);
  };

  const handleReplyToQuery = async (queryId) => {
    const text = (queryReplyDrafts[queryId] || "").trim();
    if (!text) return;
    setSendingQueryReply(queryId);
    try {
      const res = await fetch("/api/sso/queries/reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": readCookie("ic_student_csrf") },
        body: JSON.stringify({ queryId, message: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Please try again.");
      setQueryReplyDrafts(d => ({ ...d, [queryId]: "" }));
      await loadDashboard();
    } catch (e) {
      alert("Couldn't send your reply: " + e.message);
    }
    setSendingQueryReply(null);
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

  const { candidate, templates = [], interviews = [], pendingInvites = [], queries = [] } = data;
  const upcoming = interviews.filter(i => ["pending_acceptance", "scheduled", "declined"].includes(i.status));
  // All upcoming interviews with a confirmed date that hasn't already
  // passed, soonest first — previously this picked the first array match
  // regardless of date, so a 16th could sit hidden behind a 17th that
  // happened to come first in query order. A "scheduled" interview whose
  // time already passed (an interviewer never got around to marking it
  // completed/no-show) isn't actually upcoming anymore, so it's excluded
  // here rather than confusingly shown as something still to come.
  const now = new Date();
  const upcomingScheduled = upcoming
    .filter(i => i.scheduledDate && (() => {
      const start = parseInterviewStart(i.scheduledDate, i.scheduledTime);
      return !start || start >= now;
    })())
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
  // Only counts self-booked invites that are ACTUALLY booked (in the
  // `awaiting` set above) — a Nudge-sent one no longer blocks Self Book for
  // the same template (clicking it widens that invite instead of creating
  // a duplicate — see selfBookStart/resolveSelfBookTarget in
  // api/sso-handler.js), and neither does a self-booked invite that was
  // abandoned before a slot was ever picked: those no longer show in the
  // "Ready to Book" list at all (self-booked ones only appear there once
  // actually booked), so counting them here would permanently disable Self
  // Book for that template with no visible invite left to explain why.
  const templatesInProgress = new Set(
    awaiting.filter(i => i.selfBooked).map(i => i.templateId).filter(Boolean)
  );
  // An admin rejecting a picked slot (handleRejectBooking in
  // CandidateSchedulingTab.jsx) sets the invite's status to "cancelled"
  // with a rejectionReason — the candidate already gets an email about it,
  // but without this it just silently disappeared from the dashboard too
  // (pendingInvites drops "cancelled" by definition), with no trace of
  // what happened or why.
  const rejectedInvites = pendingInvites.filter(i => i.status === "cancelled" && i.rejectionReason);
  // My Interviews shows real Interview records PLUS two kinds of
  // ScheduleInvite that never became one: still-awaiting-confirmation
  // (shown as their own "Pending Confirmation" section) and rejected
  // (folded into the existing Cancelled section, with the reason). Shaped
  // to match what INTERVIEW_SECTIONS/the card rendering below expects so
  // both flow through the exact same sections/sorting/quick-tabs as real
  // interviews, rather than needing a parallel rendering path.
  const interviewsWithPending = [
    ...interviews,
    ...awaiting.map(inv => ({
      id: inv.id, templateName: inv.templateName, round: inv.round || inv.templateName,
      scheduledDate: inv.bookedDate || "", scheduledTime: inv.bookedTime || "", duration: inv.duration,
      status: "pending_confirmation", meetLink: "", rescheduleRequested: false, rescheduleApproved: false,
      aiReport: null, integrityScore: null, finalScore: null, cancelReason: "",
    })),
    ...rejectedInvites.map(inv => ({
      id: inv.id, templateName: inv.templateName, round: inv.round || inv.templateName,
      scheduledDate: "", scheduledTime: "", duration: inv.duration,
      status: "cancelled", meetLink: "", rescheduleRequested: false, rescheduleApproved: false,
      aiReport: null, integrityScore: null, finalScore: null, cancelReason: inv.rejectionReason,
    })),
  ];
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
    { label: "Cancelled", value: interviews.filter(i => i.status === "cancelled").length + rejectedInvites.length, icon: XCircle, chip: "bg-gray-100 text-gray-500" },
  ];
  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = tab === item.id;
    // Matches exactly what each tab renders by default — the slots badge
    // is every card shown under Book an Interview (bookable + awaiting +
    // missed, now combined into one list), and the interviews badge is
    // the same total the "All" quick-tab shows under My Interviews.
    const badge = item.id === "slots" ? (bookable.length + awaiting.length + missed.length)
      : item.id === "interviews" ? interviewsWithPending.length
      : item.id === "help" ? queries.filter(q => q.status === "replied").length
      : 0;
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
        {/* Left sidebar — sticky to the viewport (not min-h-screen, which
           only sets a floor and still scrolls away with the page once the
           main content grows taller than one screen) so nav/profile/sign-out
           stay in place while only the content on the right scrolls. */}
        <div className="w-60 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto scrollbar-thin">
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <CalendarCheck2 className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
            </div>
            <p className="text-sm font-bold text-gray-900 tracking-tight">Interview Coordinator</p>
          </div>
          <div className="px-3 space-y-1 flex-1">
            {NAV.map((item, i) => (
              <motion.div key={item.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}>
                <NavButton item={item} />
              </motion.div>
            ))}
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
              <motion.div key="overview" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
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
                  {overviewStats.map((s, i) => (
                    <motion.div key={s.label} initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}>
                      <Card className="p-5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide truncate">{s.label}</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${s.chip}`}>
                          <s.icon className="w-4 h-4" />
                        </div>
                      </Card>
                    </motion.div>
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
                      {upcomingCombined.map((iv, i) => (
                        <motion.div key={iv.id} initial="hidden" animate="visible" custom={i + 4} variants={fadeUp}>
                          <Card className={`p-5 flex items-center justify-between gap-3 flex-wrap border-l-4 ${
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
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {tab === "details" && (
              <motion.div key="details" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5 max-w-2xl">
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
                        <BookOpen className="w-3 h-3" /> Eligible Rounds
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
              </motion.div>
            )}

            {tab === "slots" && (
              <motion.div key="slots" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
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
                </div>

                {/* Every assigned template not already in progress, shown as
                   its own clickable box — a direct click goes straight to
                   Find Slots for that template, instead of a "Self Book"
                   button that then required a second dropdown selection. */}
                {(() => {
                  const notStarted = templates.filter(t => !templatesInProgress.has(t.id));
                  if (templates.length === 0 || notStarted.length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                        Self Book — {notStarted.length} template{notStarted.length !== 1 ? "s" : ""} ready to start
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {notStarted.map((t, i) => (
                          <motion.button key={t.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}
                            onClick={() => handleSelfBook(t.id)}
                            disabled={bookingTemplateId != null}
                            className={`text-left p-4 rounded-2xl border-2 bg-white transition-all disabled:cursor-wait disabled:opacity-60 ${
                              bookingTemplateId === t.id ? "border-emerald-400 bg-emerald-50" : "border-gray-100 hover:border-emerald-300 hover:shadow-md"
                            }`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                <CalendarPlus className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-gray-900 truncate">{t.name}</p>
                                <p className="text-xs text-gray-400">{t.durationMinutes}m</p>
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-emerald-600 mt-3">
                              {bookingTemplateId === t.id ? "Finding Slots…" : "Find Slots →"}
                            </p>
                          </motion.button>
                        ))}
                      </div>
                    </div>
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
                    {bookable.map((inv, i) => {
                      const isExpanded = expandedInviteId === inv.id;
                      const deadline = daysLeftLabel(inv.dateRangeEnd, todayStr);
                      return (
                        <motion.div key={inv.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}>
                        <Card innerRef={isExpanded ? expandedCardRef : undefined} className={`overflow-hidden border-l-4 ${ACCENT_BORDER.violet}`}>
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
                                  {deadline && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                      deadline.urgent ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-gray-50 text-gray-500 border-gray-200"
                                    }`}>
                                      {deadline.text}
                                    </span>
                                  )}
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
                        </motion.div>
                      );
                    })}
                    {awaiting.map((inv, i) => (
                      <motion.div key={inv.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}>
                      <Card className={`overflow-hidden border-l-4 ${ACCENT_BORDER.emerald}`}>
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
                      </motion.div>
                    ))}
                    {missed.map((inv, i) => (
                      <motion.div key={inv.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}>
                      <Card className={`overflow-hidden opacity-70 border-l-4 ${ACCENT_BORDER.orange}`}>
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
                      </motion.div>
                    ))}
                  </>
                )}
              </motion.div>
            )}

            {tab === "interviews" && (
              <motion.div key="interviews" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
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

                {interviewsWithPending.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <Inbox className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No interviews yet.</p>
                  </Card>
                ) : (
                  <>
                    {/* Quick-view tabs — one per status plus "All", as a
                       segmented pill control (matching the toggle style used
                       elsewhere, e.g. the Leaderboard period switch) instead
                       of a plain underline band — the active tab gets a
                       solid white pill + its own status color, so it's
                       unmistakable which section is showing versus the old
                       thin-underline style where every inactive tab looked
                       identically gray. */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-3 overflow-x-auto">
                      {[
                        { key: "all", label: "All" },
                        // These 4 statuses are usually empty and clutter the
                        // tab bar — their sections (and any action needed,
                        // e.g. a "Book an Interview" button after a
                        // reschedule approval) still show normally under
                        // "All" below, this just removes their own tab.
                        ...INTERVIEW_SECTIONS.filter(s => !["pending_confirmation", "pending_acceptance", "reschedule_requested", "reschedule_approved"].includes(s.key)),
                      ].map(tab => {
                        const count = tab.key === "all" ? interviewsWithPending.length : interviewsWithPending.filter(tab.match).length;
                        const isActiveTab = activeInterviewTab === tab.key;
                        const c = TAB_COLORS[tab.key] || TAB_COLORS.cancelled;
                        return (
                          <button key={tab.key} onClick={() => setActiveInterviewTab(tab.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
                              isActiveTab ? `bg-white shadow-soft ${c.text}` : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
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
                    ).every(section => interviewsWithPending.filter(section.match).length === 0) && (
                      <Card className="flex flex-col items-center justify-center py-10">
                        <Inbox className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-sm text-gray-400">Nothing here yet.</p>
                      </Card>
                    )}

                    {(activeInterviewTab === "all"
                      ? INTERVIEW_SECTIONS
                      : INTERVIEW_SECTIONS.filter(s => s.key === activeInterviewTab)
                    ).map(section => {
                      // Date-wise, soonest/earliest first — items had no
                      // defined order before (whatever order they came back
                      // from Firestore in), which could put a 24th before a
                      // 20th. Undated items (shouldn't normally happen for
                      // these statuses) sort last rather than disappearing.
                      const items = interviewsWithPending.filter(section.match).slice().sort((a, b) => {
                        const da = a.scheduledDate ? `${a.scheduledDate}T${a.scheduledTime || ""}` : "";
                        const db = b.scheduledDate ? `${b.scheduledDate}T${b.scheduledTime || ""}` : "";
                        if (!da && !db) return 0;
                        if (!da) return 1;
                        if (!db) return -1;
                        return da.localeCompare(db);
                      });
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
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="opacity-80">
                                  <p className="font-semibold text-gray-700 text-sm">{interviewTitle(iv)}</p>
                                  {iv.scheduledDate && (
                                    <p className="text-sm font-medium text-gray-500 mt-1">{formatDate(iv.scheduledDate)} · {iv.scheduledTime}</p>
                                  )}
                                  {iv.cancelReason && (
                                    <p className="text-xs text-gray-400 mt-1">Reason: {iv.cancelReason}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                  {iv.finalScore != null && (
                                    <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                                      Final Score: {Number(iv.finalScore).toFixed(1)}/5
                                    </span>
                                  )}
                                  {iv.integrityScore != null && (
                                    <button onClick={() => setIntegrityInterview(iv)}
                                      className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors">
                                      Integrity: {Number(iv.integrityScore).toFixed(1)}/5
                                    </button>
                                  )}
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
              </motion.div>
            )}

            {tab === "help" && (
              <motion.div key="help" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Help</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Raise a query and the admin team will reply here.</p>
                  </div>
                </div>

                <Card className="p-5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">What's this about?</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {QUERY_CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setQueryCategory(c.id)}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          queryCategory === c.id ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-600 border-gray-200 hover:border-rose-300"
                        }`}>
                        <c.icon className="w-3.5 h-3.5" /> {c.label}
                      </button>
                    ))}
                  </div>
                  {interviews.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Related Interview (optional)</label>
                      <select value={queryInterviewId} onChange={e => setQueryInterviewId(e.target.value)}
                        className="w-full max-w-sm border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500">
                        <option value="">None</option>
                        {interviews.map(iv => (
                          <option key={iv.id} value={iv.id}>{interviewTitle(iv)}{iv.scheduledDate ? ` — ${formatDate(iv.scheduledDate)}` : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your Message</label>
                  <textarea
                    value={queryMessage}
                    onChange={e => setQueryMessage(e.target.value)}
                    placeholder="Describe what's going on…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-colors resize-none"
                  />
                  <Button variant="primary" className="mt-3" onClick={handleSubmitQuery} disabled={submittingQuery || !queryMessage.trim()}>
                    {submittingQuery ? "Sending…" : "Send Query"}
                  </Button>
                </Card>

                {queries.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Your Queries</p>
                    {queries.map(q => {
                      const isExpanded = expandedQueryId === q.id;
                      const meta = QUERY_CATEGORIES.find(c => c.id === q.category) || QUERY_CATEGORIES[3];
                      const lastMessage = q.messages?.[q.messages.length - 1];
                      return (
                        <Card key={q.id} className="overflow-hidden">
                          <button onClick={() => setExpandedQueryId(isExpanded ? null : q.id)}
                            className="flex items-center justify-between gap-3 w-full px-5 py-4 text-left hover:bg-gray-50/70 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                                <meta.icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate">{meta.label}</p>
                                <p className="text-xs text-gray-400 truncate mt-0.5">{lastMessage?.text}</p>
                              </div>
                            </div>
                            <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${QUERY_STATUS_STYLE[q.status] || QUERY_STATUS_STYLE.open}`}>
                              {QUERY_STATUS_LABEL[q.status] || q.status}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-5 pt-1 border-t border-gray-50 space-y-3">
                              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {(q.messages || []).map((m, i) => (
                                  <div key={i} className={`flex ${m.from === "student" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                                      m.from === "student" ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-800"
                                    }`}>
                                      <p className="whitespace-pre-wrap">{m.text}</p>
                                      <p className={`text-[10px] mt-1 ${m.from === "student" ? "text-white/60" : "text-gray-400"}`}>
                                        {m.from === "admin" ? (m.byName || "Admin team") : "You"} · {formatDateTime(m.at)}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {q.status !== "closed" && (
                                <div className="flex items-end gap-2 pt-1">
                                  <textarea
                                    value={queryReplyDrafts[q.id] || ""}
                                    onChange={e => setQueryReplyDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                                    placeholder="Reply…"
                                    rows={2}
                                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-colors resize-none"
                                  />
                                  <Button variant="primary" icon={Send} className="flex-shrink-0"
                                    onClick={() => handleReplyToQuery(q.id)}
                                    disabled={sendingQueryReply === q.id || !(queryReplyDrafts[q.id] || "").trim()}>
                                    {sendingQueryReply === q.id ? "Sending…" : "Send"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </motion.div>
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
      <IntegrityDetailModal
        interview={integrityInterview}
        onClose={() => setIntegrityInterview(null)}
      />
    </ErrorBoundary>
  );
}
