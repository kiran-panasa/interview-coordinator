import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../../firebase";
import {
  CalendarClock, Video, LogOut, Inbox, Loader2, CalendarCheck2,
  User, BookOpen, LayoutGrid, CalendarRange, ListChecks, Clock3, FileText,
  ChevronDown, ChevronRight, Sparkles, PlayCircle, FileDown, CalendarPlus,
  CheckCircle2, XCircle, HelpCircle, Bell, Award, AlertTriangle,
} from "lucide-react";
import { formatDate, parseInterviewStart, formatDateTime } from "../../utils/dates";
import { ordinalLabel } from "../../utils/strings";
import { getPreInterviewResources } from "../../api/firestore";
import { cancelInterviewByCandidate } from "../../services/booking.service";
import InlineSlotPicker from "../../components/InlineSlotPicker";
import SelfBookCutoffBanner from "../../components/SelfBookCutoffBanner";
import AiReportModal from "../../features/interviews/AiReportModal";
import IntegrityDetailModal from "../../features/interviews/IntegrityDetailModal";
import ErrorBoundary from "../../components/ErrorBoundary";
import Button from "../../components/Button";
import KebabMenu from "../../components/KebabMenu";
import Modal from "../../components/Modal";

const SEEN_INVITES_KEY = "ic_seen_invites";
function readSeenInviteIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_INVITES_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeSeenInviteIds(ids) {
  try { localStorage.setItem(SEEN_INVITES_KEY, JSON.stringify([...ids])); } catch { /* storage unavailable */ }
}

// A rejected booking has no linked "replacement" the way a cancelled
// interview has `rescheduledTo` — it's just an invite that stays
// status:"cancelled" forever once rejected. So instead of trying to infer
// "already resolved", this tracks "the candidate already saw this one and
// started rebooking" client-side, same idea as the two "seen" sets above.
const DISMISSED_REJECTIONS_KEY = "ic_dismissed_rejections";
function readDismissedRejectionIds() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_REJECTIONS_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeDismissedRejectionIds(ids) {
  try { localStorage.setItem(DISMISSED_REJECTIONS_KEY, JSON.stringify([...ids])); } catch { /* storage unavailable */ }
}

// "Mark as read" on a notification card — separate from dismissing one by
// rebooking (above). A read notification stays in the list (it's still
// unresolved) but stops counting toward the Notifications nav badge.
const READ_NOTIFICATIONS_KEY = "ic_read_notifications";
function readReadNotificationIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_NOTIFICATIONS_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeReadNotificationIds(ids) {
  try { localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify([...ids])); } catch { /* storage unavailable */ }
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
// group rather than lumped together. Pending Confirmation / Scheduling In
// Progress / Reschedule Requested / Reschedule Approved are intentionally
// not sections here — a booked-but-unconfirmed slot already shows in
// Overview's Upcoming list, and a reschedule now resolves straight through
// to a real Scheduled/Cancelled pair (see handleConfirmBooking in
// CandidateSchedulingTab.jsx) without ever sitting in an in-between state
// long enough to need its own tab.
const INTERVIEW_SECTIONS = [
  { key: "scheduled",      label: "Scheduled",            match: i => i.status === "scheduled" },
  { key: "completed",      label: "Completed",           match: i => i.status === "completed" },
  { key: "partially_completed", label: "Partially Completed", match: i => i.status === "partially_completed" },
  { key: "no_show",        label: "Missed",               match: i => i.status === "no_show" },
  { key: "cancelled",      label: "Cancelled",           match: i => i.status === "cancelled" },
];
// Sections whose interviews can still be acted on (Join Meet / Request
// Reschedule) and get the larger, higher-contrast card — everything else
// (completed/cancelled/etc.) gets the compact, muted "past" card.
const ACTIVE_SECTION_KEYS = new Set(["scheduled"]);

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

function Card({ children, className = "", innerRef, id, onClick }) {
  return <div ref={innerRef} id={id} onClick={onClick} className={`bg-white rounded-[1.75rem] border border-gray-100 shadow-soft hover:shadow-card hover:-translate-y-1 transition-all duration-200 ${className}`}>{children}</div>;
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
  sky:     "bg-sky-50 text-sky-600",
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
  scheduled:             "blue",
  completed:              "emerald",
  partially_completed:    "sky",
  no_show:                 "rose",
  cancelled:               "gray",
};
// Each My Interviews quick-view tab gets its own color so the band reads
// at a glance instead of every tab/badge looking the same gray/blue.
const TAB_COLORS = {
  all:                    { text: "text-indigo-600",  border: "border-indigo-600",  badgeBg: "bg-indigo-100",  badgeText: "text-indigo-700" },
  scheduled:              { text: "text-blue-600",    border: "border-blue-600",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700" },
  completed:              { text: "text-emerald-600", border: "border-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700" },
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
  { id: "notifications", label: "Notifications", icon: Bell, accent: "sky" },
  { id: "faq",      label: "FAQ",            icon: HelpCircle, accent: "rose" },
];

// Static — no backend, no submit-a-question flow (that's the Student
// Queries feature, deliberately removed). Just answers to the questions
// candidates actually ask, kept close to the terminology/flow this
// dashboard uses (e.g. "Book an Interview" tab, "Request Reschedule" menu)
// so the answers match what they'll actually see on screen.
const FAQ_ITEMS = [
  {
    q: "How do I schedule an interview?",
    a: "Go to \"Book an Interview\" in the left menu. Click the round/template you want to book, then pick an open date and time slot. Once you confirm, it shows up under \"My Interviews\" as Scheduled.",
  },
  {
    q: "Why can't I book a slot for today?",
    a: "Same-day booking isn't allowed — the earliest you can ever book is tomorrow. There's also a daily cutoff (shown live on the Book an Interview page, 5:30 PM by default): book before the cutoff and tomorrow's slots are open, but if you wait until after it, tomorrow closes too and the earliest becomes the day after. So if you want tomorrow's slot, book it before 5:30 PM today — don't wait!",
  },
  {
    q: "How do I reschedule an interview?",
    a: "Open \"My Interviews\", find the scheduled interview, and click the ⋮ (three dots) on its card → \"Request Reschedule\". Enter a short reason, then pick a new slot the same way you booked the first time. Your old interview is cancelled automatically the moment you confirm the new slot — no waiting on anyone.",
  },
  {
    q: "What's the difference between Cancel and Reschedule?",
    a: "Use \"Request Reschedule\" when you want a different slot right away. Use \"Cancel Interview\" when none of this week's open slots work for you at all — available slots only show about a week ahead, so cancelling just means you're not ready to book yet. Come back to \"Book an Interview\" next week once new slots open up, and book a fresh one then. Both ask for a reason, and both are tracked — please only use them when you genuinely need to.",
  },
  {
    q: "Where do I find my interview link?",
    a: "On \"My Interviews\", your upcoming interview card has a \"Join Meet\" button — it's active a few minutes before your scheduled time.",
  },
  {
    q: "How do I know how many times I've attempted a round?",
    a: "If you've taken the same round more than once (e.g. after a reschedule), each card is labeled \"1st Attempt\", \"2nd Attempt\", and so on, in the order they happened.",
  },
  {
    q: "Can I update my resume link?",
    a: "Yes — go to \"My Details\" and paste your resume link (e.g. a Google Drive share link) under Resume, then click Save.",
  },
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
  const [resources, setResources] = useState(null);
  const [newInviteIds, setNewInviteIds] = useState(new Set());
  const [dismissedRejectionIds, setDismissedRejectionIds] = useState(() => readDismissedRejectionIds());
  const [readNotificationIds, setReadNotificationIds] = useState(() => readReadNotificationIds());
  const [expandedFaqIndex, setExpandedFaqIndex] = useState(null);
  const [expandedInviteId, setExpandedInviteId] = useState(null);
  const [aiReportInterview, setAiReportInterview] = useState(null);
  const [integrityInterview, setIntegrityInterview] = useState(null);
  const [bookingTemplateId, setBookingTemplateId] = useState(null);
  const [activeInterviewTab, setActiveInterviewTab] = useState("all");
  // Shared by both "Request Reschedule" and the new plain "Cancel Interview"
  // kebab actions — { mode: "reschedule" | "cancel", interviewId, templateId }
  // or null. One modal, one reason textarea, one red warning note, so the
  // two actions read as two flavors of the same serious decision rather
  // than a casual window.prompt() for one and nothing for the other.
  const [cancelRescheduleTarget, setCancelRescheduleTarget] = useState(null);
  const [cancelRescheduleReason, setCancelRescheduleReason] = useState("");
  const [cancelRescheduleSubmitting, setCancelRescheduleSubmitting] = useState(false);
  // Set when a card is clicked from Overview's Upcoming list — scrolls to
  // and briefly highlights that exact card once My Interviews renders,
  // then clears itself so the ring doesn't linger forever.
  const [highlightInterviewId, setHighlightInterviewId] = useState(null);
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

  // Jumping here from Overview's Upcoming list (see goToInterview) — the
  // target card only exists once My Interviews has actually rendered, so
  // this waits a tick for that, scrolls it into view, and clears the
  // highlight after a moment instead of leaving the ring on permanently.
  useEffect(() => {
    if (tab !== "interviews" || !highlightInterviewId) return;
    const t = setTimeout(() => {
      document.getElementById(`iv-card-${highlightInterviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const clear = setTimeout(() => setHighlightInterviewId(null), 2500);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [tab, highlightInterviewId]);

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

  const openCancelRescheduleModal = (mode, interviewId, templateId) => {
    setCancelRescheduleReason("");
    setCancelRescheduleTarget({ mode, interviewId, templateId });
  };

  // One submit handler for both modes, routed by cancelRescheduleTarget.mode
  // — reschedule carries the reason into the self-book flow (stored on the
  // new ScheduleInvite, cancelling the old interview the moment the new one
  // is confirmed — see handleSelfBook/confirmSelfBooking), while cancel acts
  // immediately via cancelInterviewByCandidate with no rebooking attached.
  const handleCancelRescheduleSubmit = async () => {
    if (!cancelRescheduleTarget) return;
    const reason = cancelRescheduleReason.trim();
    if (!reason) { alert("Please enter a reason."); return; }
    const { mode, interviewId, templateId } = cancelRescheduleTarget;
    setCancelRescheduleSubmitting(true);
    try {
      if (mode === "reschedule") {
        if (!templateId) {
          alert("Couldn't start rebooking — this interview has no template on record. Please reach out to the admin team.");
        } else {
          setCancelRescheduleTarget(null);
          await handleSelfBook(templateId, interviewId, reason);
        }
      } else {
        await cancelInterviewByCandidate(interviewId, reason);
        setCancelRescheduleTarget(null);
        await loadDashboard();
      }
    } catch (e) {
      alert(`Couldn't ${mode === "reschedule" ? "start rebooking" : "cancel the interview"} — ${e?.message || "please try again."}`);
    }
    setCancelRescheduleSubmitting(false);
  };

  // Read-only — fetches what the slot picker needs (duration/date-range/
  // eligible interviewers) without creating a ScheduleInvite. If one's
  // already in progress for this template (e.g. a previous session's draft
  // that did get confirmed, or got interrupted after ensureSelfBookInvite
  // ran), self-book-start hands back that real invite instead so it's
  // resumed rather than duplicated.
  const handleSelfBook = async (templateId, replacingInterviewId, rescheduleReason) => {
    setBookingTemplateId(templateId);
    try {
      const res = await fetch("/api/sso/interviews/self-book-start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          ...(replacingInterviewId ? { replacingInterviewId } : {}),
          ...(rescheduleReason ? { rescheduleReason } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSelfBookDraft(json);
        setTab("slots");
        // If this template already had a Nudge invite, self-book-start
        // computed a wider EFFECTIVE date range just for this picker
        // (json.dateRangeStart/End) — the invite's own stored range is
        // never touched, so its "Book between" card in Ready to Book still
        // shows exactly what was sent. This refresh is just routine data
        // sync, not reconciling a changed range.
        loadDashboard();
      } else if (json?.error === "template_not_active") {
        alert("This round isn't currently open for booking. Please refresh the page — it may have been paused since you loaded this dashboard.");
        loadDashboard();
      } else if (json?.error === "attempt_limit_reached") {
        alert(json.message || "You've reached the maximum number of attempts for this interview.");
        loadDashboard();
      } else if (json?.error === "no_show_limit_reached") {
        alert(json.message || "You've been blocked from booking this interview due to repeated no-shows.");
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
        body: JSON.stringify({
          templateId: selfBookDraft.templateId,
          ...(selfBookDraft.replacingInterviewId ? { replacingInterviewId: selfBookDraft.replacingInterviewId } : {}),
        }),
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
  // "1st Attempt"/"2nd Attempt"/... — when there's more than one interview
  // for the SAME template (a reschedule, or a genuine retake), both this
  // dashboard and the admin's Interviews page should show which attempt
  // this one is, instead of two same-named cards looking like an
  // unexplained duplicate. Only labeled when there's genuinely more than
  // one — a normal single interview stays unlabeled.
  const attemptLabelByInterviewId = (() => {
    const byTemplate = new Map();
    interviews.filter(iv => iv.templateId).forEach(iv => {
      if (!byTemplate.has(iv.templateId)) byTemplate.set(iv.templateId, []);
      byTemplate.get(iv.templateId).push(iv);
    });
    const map = new Map();
    byTemplate.forEach(list => {
      if (list.length < 2) return;
      // The attempt number only advances once an attempt actually
      // completes — a cancelled/declined booking is just a retry of the
      // SAME attempt, not a new one, so it shares that attempt's number
      // instead of bumping it. The first one in the sequence still counts
      // as attempt #1, it just doesn't get its own badge (see the n > 1
      // check) until there's a genuine 2nd to compare it against.
      let n = 1;
      list
        .slice()
        .sort((a, b) => (a.createdAt || `${a.scheduledDate}T${a.scheduledTime || ""}`).localeCompare(b.createdAt || `${b.scheduledDate}T${b.scheduledTime || ""}`))
        .forEach(iv => {
          if (n > 1) map.set(iv.id, ordinalLabel(n));
          if (iv.status === "completed") n++;
        });
    });
    return map;
  })();
  // Booking again after already completing a template once is a real
  // retake — this is the SAME rule as attemptLabelByInterviewId above
  // (only labeled from the 2nd attempt onward), surfaced ahead of time
  // here, before the new interview even exists yet, so the candidate
  // knows what they're about to start before they confirm a slot.
  const nextAttemptNumber = (templateId) =>
    interviews.filter(iv => iv.templateId === templateId && iv.status === "completed").length + 1;
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
      status: "pending_confirmation", meetLink: "",
      aiReport: null, integrityScore: null, finalScore: null, cancelReason: "",
    })),
    ...rejectedInvites.map(inv => ({
      id: inv.id, templateName: inv.templateName, round: inv.round || inv.templateName,
      scheduledDate: "", scheduledTime: "", duration: inv.duration,
      status: "cancelled", meetLink: "",
      aiReport: null, integrityScore: null, finalScore: null, cancelReason: inv.rejectionReason,
    })),
  ];
  // `interviewsWithPending` also contains synthetic pending_confirmation
  // entries (from `awaiting`) that don't match any INTERVIEW_SECTIONS
  // entry on purpose — a booked-but-unconfirmed slot already shows in
  // Overview's Upcoming list instead, so it's excluded from My Interviews'
  // counts/tabs/list here rather than double-shown.
  const visibleInterviews = interviewsWithPending.filter(iv => INTERVIEW_SECTIONS.some(s => s.match(iv)));
  // Overview's "Upcoming" list — confirmed interviews plus slots already
  // picked but still waiting on admin confirmation, merged into one
  // soonest-first list. A slot the candidate already picked (via Nudge or
  // self-book) is "upcoming" from their point of view even before an admin
  // has signed off on it, so it belongs here too, not just in the Book an
  // Interview tab.
  const upcomingCombined = [
    ...upcomingScheduled.map(iv => ({
      id: iv.id, title: interviewTitle(iv), date: iv.scheduledDate, time: iv.scheduledTime,
      duration: iv.duration, meetLink: iv.meetLink, pending: false, status: iv.status,
    })),
    ...awaiting.map(inv => ({
      id: inv.id, title: inv.round || inv.templateName || "Interview", date: inv.bookedDate, time: inv.bookedTime,
      duration: inv.duration, meetLink: null, pending: true,
    })),
  ]
    .filter(x => x.date)
    .sort((a, b) => `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`));
  // Admin cancelled this proactively (e.g. the interviewer had to drop out)
  // and the candidate hasn't picked a replacement slot yet — rescheduledTo
  // gets set the moment they do (see handleConfirmBooking in
  // CandidateSchedulingTab.jsx), so this list clears itself once resolved.
  // A candidate's OWN reschedule request also routes through
  // markInterviewCancelled with cancelledBy: "admin", but rescheduledTo is
  // set in that same step, so it never lingers here.
  const cancelledByAdmin = interviews
    .filter(iv => iv.status === "cancelled" && iv.cancelledBy === "admin" && !iv.rescheduledTo)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  // An admin rejecting a picked slot (handleRejectBooking in
  // CandidateSchedulingTab.jsx) is the other way a candidate ends up
  // needing a new slot with no interview of their own ever having existed —
  // there's no `rescheduledTo`-style link to tell "already resolved" apart,
  // so this uses dismissedRejectionIds (see DISMISSED_REJECTIONS_KEY)
  // instead, set the moment they click "Select a New Slot" below.
  const rejectedNotifications = rejectedInvites.filter(inv => !dismissedRejectionIds.has(inv.id));
  const notifications = [
    ...cancelledByAdmin.map(iv => ({
      id: iv.id, kind: "interview", templateId: iv.templateId, title: interviewTitle(iv),
      date: iv.scheduledDate, time: iv.scheduledTime, reason: iv.cancelReason, when: iv.updatedAt || "",
    })),
    ...rejectedNotifications.map(inv => ({
      id: inv.id, kind: "invite", templateId: inv.templateId, title: inv.round || inv.templateName || "Interview",
      date: null, time: null, reason: inv.rejectionReason, when: inv.updatedAt || inv.createdAt || "",
    })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  // Overview's summary cards.
  const overviewStats = [
    { label: "Scheduled", value: interviews.filter(i => i.status === "scheduled").length, icon: CalendarClock, chip: "bg-blue-50 text-blue-600" },
    { label: "Completed", value: interviews.filter(i => i.status === "completed").length,  icon: CheckCircle2,  chip: "bg-emerald-50 text-emerald-600" },
    { label: "Cancelled", value: interviews.filter(i => i.status === "cancelled").length + rejectedInvites.length, icon: XCircle, chip: "bg-gray-100 text-gray-500" },
  ];
  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = tab === item.id;
    // The slots badge is every card shown under Book an Interview (bookable
    // + awaiting + missed, now combined into one list). My Interviews no
    // longer gets a nav badge at all — per request, status-change counts
    // there were more noise than signal.
    const badge = item.id === "slots" ? (bookable.length + awaiting.length + missed.length)
      : item.id === "notifications" ? notifications.filter(n => !readNotificationIds.has(n.id)).length
      : 0;
    const hasNew = item.id === "slots" && newInviteIds.size > 0;
    return (
      <button onClick={() => setTab(item.id)}
        className={`relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-full text-sm font-semibold transition-all ${
          active ? "bg-brand-600 text-white shadow-card" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}>
        <span className={`relative flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
          active ? "bg-white/20 text-white" : ACCENT_CHIP[item.accent]
        }`}>
          <Icon className="w-3.5 h-3.5" />
          {hasNew && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />}
        </span>
        <span className="flex-1 text-left">{item.label}</span>
        {badge > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white text-brand-700" : "bg-gray-200 text-gray-600"}`}>
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
                <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 px-6 py-7 text-white shadow-card">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
                  <div className="absolute -bottom-14 -left-10 w-36 h-36 bg-white/10 rounded-full pointer-events-none" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold flex-shrink-0">
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
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${s.chip}`}>
                          <s.icon className="w-5 h-5" />
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
                      {upcomingCombined.map((iv, i) => {
                        // Only a real "scheduled" interview actually has a
                        // card to jump to in My Interviews — a still-pending
                        // slot or one awaiting admin acceptance doesn't show
                        // there (see INTERVIEW_SECTIONS), so those stay
                        // non-clickable rather than jumping to nothing.
                        const clickable = !iv.pending && iv.status === "scheduled";
                        return (
                      <motion.div key={iv.id} initial="hidden" animate="visible" custom={i + 4} variants={fadeUp}>
                          <Card
                            onClick={clickable ? () => { setHighlightInterviewId(iv.id); setActiveInterviewTab("all"); setTab("interviews"); } : undefined}
                            className={`p-5 flex items-center justify-between gap-3 flex-wrap border-l-4 ${
                            iv.pending ? ACCENT_BORDER.emerald : ACCENT_BORDER.indigo
                          } ${clickable ? "cursor-pointer" : ""}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
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
                              <a href={iv.meetLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                className="inline-flex items-center justify-center gap-1.5 text-center bg-brand-600 text-white font-semibold py-2.5 px-6 rounded-full text-sm shadow-soft hover:bg-brand-700 hover:shadow-card transition-all flex-shrink-0">
                                <Video className="w-3.5 h-3.5" /> Join Meet
                              </a>
                            )}
                          </Card>
                      </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {tab === "details" && (
              <motion.div key="details" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
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
                        <BookOpen className="w-3 h-3" /> Eligible Interviews
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {templates.map(t => (
                          <span key={t.id} className="text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">
                            {t.name}
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
                      className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
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
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <CalendarPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 tracking-tight">Book an Interview</h1>
                      <p className="text-sm text-gray-500 mt-0.5">Pick an open slot for any interview that's ready to book, or self-book one of your assigned templates.</p>
                    </div>
                  </div>
                </div>

                <SelfBookCutoffBanner />

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
                        {notStarted.map((t, i) => {
                          // Two independent reasons a template can be
                          // blocked — too many completed attempts, or too
                          // many no-shows — shown with their own message,
                          // but otherwise rendered identically (disabled
                          // card, no Find Slots button).
                          const blocked = t.limitReached || t.noShowBlocked;
                          const blockedMessage = t.limitReached ? t.attemptLimitMessage : t.noShowBlockedMessage;
                          return (
                          <motion.button key={t.id} initial="hidden" animate="visible" custom={i} variants={fadeUp}
                            onClick={() => { if (!blocked) handleSelfBook(t.id); }}
                            disabled={bookingTemplateId != null || blocked}
                            title={blocked ? blockedMessage : undefined}
                            className={`text-left p-4 rounded-[1.5rem] border bg-white transition-all disabled:cursor-not-allowed ${
                              blocked
                                ? "border-gray-100 opacity-60"
                                : bookingTemplateId === t.id
                                  ? "border-emerald-300 bg-emerald-50 shadow-card disabled:cursor-wait disabled:opacity-60"
                                  : "border-gray-100 shadow-soft hover:shadow-card hover:-translate-y-0.5"
                            }`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                                blocked ? "bg-gray-100 text-gray-400" : "bg-emerald-50 text-emerald-600"
                              }`}>
                                <CalendarPlus className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-gray-900 truncate">{t.name}</p>
                                  {!blocked && nextAttemptNumber(t.id) > 1 && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                      {ordinalLabel(nextAttemptNumber(t.id))}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{t.durationMinutes} minutes</p>
                                {/* Visible before the limit is actually hit,
                                   not just once it's blocked — so reaching
                                   it doesn't come as a surprise after
                                   someone's already on their last try. */}
                                {!blocked && t.maxAttempts != null && (
                                  <p className={`text-[11px] font-semibold mt-0.5 ${
                                    t.attemptsUsed >= t.maxAttempts - 1 ? "text-amber-600" : "text-gray-400"
                                  }`}>
                                    {t.attemptsUsed} of {t.maxAttempts} attempt{t.maxAttempts === 1 ? "" : "s"} used
                                  </p>
                                )}
                              </div>
                            </div>
                            {blocked ? (
                              <p className="text-xs font-medium text-gray-500 mt-3 leading-snug">{blockedMessage}</p>
                            ) : (
                              <span className={`inline-flex items-center justify-center w-full mt-3 py-2 rounded-full text-xs font-bold transition-colors ${
                                bookingTemplateId === t.id ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-700"
                              }`}>
                                {bookingTemplateId === t.id ? "Finding Slots…" : "Find Slots"}
                              </span>
                            )}
                          </motion.button>
                          );
                        })}
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-gray-900 truncate">{selfBookDraft.templateName}</p>
                          {nextAttemptNumber(selfBookDraft.templateId) > 1 && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {ordinalLabel(nextAttemptNumber(selfBookDraft.templateId))}
                            </span>
                          )}
                        </div>
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
                        onBooked={() => loadDashboard()}
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
                                     invite vs. you starting it yourself from this
                                     dashboard (see handleSelfBook/selfBooked).
                                     "Nudge" is internal admin terminology —
                                     students never see that word, since they
                                     were actually notified by email. */}
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                    inv.selfBooked ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-indigo-50 text-indigo-600 border-indigo-200"
                                  }`}>
                                    {inv.selfBooked ? "Self-booked" : "Sent via Email"}
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
                              <InlineSlotPicker invite={inv} onBooked={() => loadDashboard()} />
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
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
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
                          className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                          <PlayCircle className="w-3.5 h-3.5" /> {resources.videoGuideLabel || "Setup Video Guide"}
                        </a>
                      )}
                      {(resources.documents || []).map(doc => (
                        <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                          <FileDown className="w-3.5 h-3.5" /> {doc.label}
                        </a>
                      ))}
                    </div>
                  </Card>
                )}

                {visibleInterviews.length === 0 ? (
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
                    <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1.5 mb-3 overflow-x-auto">
                      {[{ key: "all", label: "All" }, ...INTERVIEW_SECTIONS].map(tab => {
                        const count = tab.key === "all" ? visibleInterviews.length : visibleInterviews.filter(tab.match).length;
                        const isActiveTab = activeInterviewTab === tab.key;
                        const c = TAB_COLORS[tab.key] || TAB_COLORS.cancelled;
                        return (
                          <button key={tab.key} onClick={() => setActiveInterviewTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex-shrink-0 ${
                              isActiveTab ? `bg-white shadow-card ${c.text}` : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
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
                    ).every(section => visibleInterviews.filter(section.match).length === 0) && (
                      <Card className="flex flex-col items-center justify-center py-10">
                        <Inbox className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-sm text-gray-400">Nothing here yet.</p>
                      </Card>
                    )}

                    {(activeInterviewTab === "all"
                      ? INTERVIEW_SECTIONS
                      : INTERVIEW_SECTIONS.filter(s => s.key === activeInterviewTab)
                    ).map(section => {
                      // Date-wise, most recent first — items had no defined
                      // order before (whatever order they came back from
                      // Firestore in). Undated items (shouldn't normally
                      // happen for these statuses) sort last rather than
                      // disappearing.
                      const items = visibleInterviews.filter(section.match).slice().sort((a, b) => {
                        const da = a.scheduledDate ? `${a.scheduledDate}T${a.scheduledTime || ""}` : "";
                        const db = b.scheduledDate ? `${b.scheduledDate}T${b.scheduledTime || ""}` : "";
                        if (!da && !db) return 0;
                        if (!da) return 1;
                        if (!db) return -1;
                        return db.localeCompare(da);
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
                            <Card key={iv.id} id={`iv-card-${iv.id}`} className={`p-6 border-l-4 ${ACCENT_BORDER[accent]} ${highlightInterviewId === iv.id ? "ring-2 ring-brand-400" : ""}`}>
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-gray-900">{interviewTitle(iv)}</p>
                                    {attemptLabelByInterviewId.has(iv.id) && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                        {attemptLabelByInterviewId.get(iv.id)}
                                      </span>
                                    )}
                                  </div>
                                  {iv.scheduledDate && (
                                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mt-1">
                                      <CalendarClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      {formatDate(iv.scheduledDate)} · {iv.scheduledTime} · {iv.duration}m
                                    </p>
                                  )}
                                </div>
                                <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full flex-shrink-0 ${
                                  STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200"
                                }`}>
                                  {STATUS_LABEL[iv.status] || iv.status}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {iv.meetLink && iv.status === "scheduled" && (
                                  <a href={iv.meetLink} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 text-center bg-brand-600 text-white font-semibold py-2.5 px-5 rounded-full text-sm hover:bg-brand-700 transition-colors">
                                    <Video className="w-3.5 h-3.5" /> Join Meet
                                  </a>
                                )}
                                {/* Tucked behind a "⋮" instead of sitting as
                                   their own big buttons next to Join Meet —
                                   both are a real cancel (one with a rebook
                                   attached, one without) that affects the
                                   interviewer too, so neither should read as
                                   equally casual/inviting as just joining
                                   the call. Both open the same reason +
                                   warning modal before doing anything. */}
                                {iv.status === "scheduled" && (
                                  <KebabMenu actions={[
                                    {
                                      label: bookingTemplateId === iv.templateId ? "Submitting…" : "Request Reschedule",
                                      onClick: () => openCancelRescheduleModal("reschedule", iv.id, iv.templateId),
                                      disabled: bookingTemplateId != null,
                                    },
                                    {
                                      label: "Cancel Interview",
                                      onClick: () => openCancelRescheduleModal("cancel", iv.id, iv.templateId),
                                      disabled: bookingTemplateId != null,
                                      danger: true,
                                    },
                                  ]} />
                                )}
                              </div>
                            </Card>
                          ) : (
                            <Card key={iv.id} id={`iv-card-${iv.id}`} className={`p-5 border-l-4 ${ACCENT_BORDER[accent]} ${highlightInterviewId === iv.id ? "ring-2 ring-brand-400" : ""}`}>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="opacity-80">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-gray-700 text-sm">{interviewTitle(iv)}</p>
                                    {attemptLabelByInterviewId.has(iv.id) && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                        {attemptLabelByInterviewId.get(iv.id)}
                                      </span>
                                    )}
                                  </div>
                                  {iv.scheduledDate && (
                                    <p className="text-sm font-medium text-gray-500 mt-1">{formatDate(iv.scheduledDate)} · {iv.scheduledTime}</p>
                                  )}
                                  {/* Cancelled by someone other than the
                                     candidate themselves gets a tailored,
                                     actionable message instead of a bare
                                     "Reason: ..." line — an interviewer
                                     cancellation reads as "they're
                                     unavailable, not your fault", an admin
                                     one gets an apology, and both point
                                     straight at picking a new slot instead
                                     of leaving the candidate to go hunt for
                                     "Book an Interview" themselves. A
                                     self-cancel (cancelledBy "candidate")
                                     keeps the plain reason — they already
                                     know why. */}
                                  {iv.status === "cancelled" && !iv.rescheduledTo && iv.cancelledBy === "interviewer" && (
                                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-sm">
                                      <p className="text-xs font-semibold text-amber-700">Your interviewer became unavailable for this slot.</p>
                                      {iv.cancelReason && <p className="text-xs text-amber-600 mt-0.5">Reason: {iv.cancelReason}</p>}
                                      <p className="text-xs text-amber-600 mt-0.5">This wasn't anything on your end — please pick another time that works for you.</p>
                                    </div>
                                  )}
                                  {iv.status === "cancelled" && !iv.rescheduledTo && iv.cancelledBy === "admin" && (
                                    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 max-w-sm">
                                      <p className="text-xs font-semibold text-blue-700">Sorry — this interview had to be cancelled by our team.</p>
                                      {iv.cancelReason && <p className="text-xs text-blue-600 mt-0.5">Reason: {iv.cancelReason}</p>}
                                      <p className="text-xs text-blue-600 mt-0.5">Please pick another slot to continue — apologies for the inconvenience.</p>
                                    </div>
                                  )}
                                  {iv.status === "cancelled" && (!iv.cancelledBy || iv.cancelledBy === "candidate") && iv.cancelReason && (
                                    <p className="text-xs text-gray-400 mt-1">Reason: {iv.cancelReason}</p>
                                  )}
                                  {iv.status !== "cancelled" && iv.cancelReason && (
                                    <p className="text-xs text-gray-400 mt-1">Reason: {iv.cancelReason}</p>
                                  )}
                                  {iv.status === "cancelled" && !iv.rescheduledTo && iv.templateId && (
                                    <button
                                      onClick={() => handleSelfBook(iv.templateId, iv.id, `Picking a new slot after this interview was cancelled${iv.cancelledBy && iv.cancelledBy !== "candidate" ? ` (${iv.cancelledBy})` : ""}.`)}
                                      disabled={bookingTemplateId != null}
                                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-full hover:bg-brand-100 transition-colors disabled:opacity-50">
                                      {bookingTemplateId === iv.templateId ? "Loading…" : "Pick Another Slot →"}
                                    </button>
                                  )}
                                  {/* Set once the new slot is actually booked
                                     (see linkRescheduledInterview) — best-
                                     effort resolve, same as the admin side. */}
                                  {iv.rescheduledTo && (() => {
                                    const newIv = interviews.find(x => x.id === iv.rescheduledTo);
                                    return (
                                      <p className="text-xs text-emerald-600 mt-1">
                                        → Rescheduled to {newIv ? formatDate(newIv.scheduledDate) : "a new interview"}
                                      </p>
                                    );
                                  })()}
                                </div>
                                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                  <div className="flex items-center gap-2 flex-wrap justify-end">
                                    {/* Clearly clickable, not just a colored
                                       badge — trailing chevron + a title hint,
                                       same hover affordance a real button has. */}
                                    {iv.integrityScore != null && (
                                      <button onClick={() => setIntegrityInterview(iv)}
                                        title="Click to see the integrity breakdown"
                                        className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 hover:border-amber-300 transition-colors">
                                        IntegrityScore: {Number(iv.integrityScore).toFixed(1)}/5.0
                                        <ChevronRight className="w-3 h-3" />
                                      </button>
                                    )}
                                    {iv.status === "completed" && iv.showFinalScore && iv.finalScore != null && (
                                      <span title="Final Score"
                                        className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-full">
                                        <Award className="w-3 h-3" />
                                        Final Score: {Number(iv.finalScore).toFixed(1)}/5.0
                                      </span>
                                    )}
                                    {iv.status === "completed" && iv.showAiReport && iv.aiReport && (
                                      <button onClick={() => setAiReportInterview(iv)}
                                        title="Click to see the AI-generated report"
                                        className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full hover:bg-violet-100 hover:border-violet-300 transition-colors">
                                        <Sparkles className="w-3 h-3" />
                                        AI Report
                                        <ChevronRight className="w-3 h-3" />
                                      </button>
                                    )}
                                    <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_STYLE[iv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                      {STATUS_LABEL[iv.status] || iv.status}
                                    </span>
                                  </div>
                                  {/* Per-template toggles (Templates →
                                     Lifecycle) — AI Report and Final Score
                                     can be hidden independently; this note
                                     shows once whenever either is. Never
                                     affects IntegrityScore, which stays
                                     visible either way. Sits right under the
                                     badge row above so it reads as "about
                                     this Completed/IntegrityScore state". */}
                                  {iv.status === "completed" && (!iv.showAiReport || !iv.showFinalScore) && (
                                    <p className="text-xs text-amber-600 font-medium text-right max-w-xs">Note: {iv.hiddenScoreNote}</p>
                                  )}
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

            {tab === "notifications" && (
              <motion.div key="notifications" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Notifications</h1>
                </div>
                {notifications.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-10">
                    <Bell className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">Nothing here right now.</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {notifications.map(n => {
                      const isRead = readNotificationIds.has(n.id);
                      return (
                      <Card key={n.id} className={`p-5 border-l-4 border-l-sky-500 ${isRead ? "opacity-60" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-gray-900">{n.title}</p>
                              {!isRead && <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 mt-1.5" title="Unread" />}
                            </div>
                            {n.date && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Was {formatDate(n.date)} · {n.time}
                              </p>
                            )}
                            <p className="text-sm text-gray-600 mt-2">
                              {n.kind === "interview" ? "This interview was cancelled" : "This booking couldn't be confirmed"}
                              {n.reason ? `: ${n.reason}` : "."} Kindly select another slot according to your preferred date.
                            </p>
                            <div className="flex items-center gap-2 flex-wrap mt-3">
                              <Button variant="primary"
                                onClick={() => {
                                  if (!n.templateId) {
                                    alert("Couldn't start rebooking — this has no template on record. Please reach out to the admin team.");
                                    return;
                                  }
                                  if (n.kind === "invite") {
                                    const next = new Set(dismissedRejectionIds).add(n.id);
                                    setDismissedRejectionIds(next);
                                    writeDismissedRejectionIds(next);
                                  }
                                  handleSelfBook(n.templateId, n.kind === "interview" ? n.id : undefined);
                                }}
                                disabled={bookingTemplateId != null}>
                                {bookingTemplateId === n.templateId ? "Starting…" : "Select a New Slot"}
                              </Button>
                              {!isRead && (
                                <button onClick={() => {
                                  const next = new Set(readNotificationIds).add(n.id);
                                  setReadNotificationIds(next);
                                  writeReadNotificationIds(next);
                                }}
                                  className="text-sm font-semibold text-gray-500 hover:text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                                  Mark as read
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {tab === "faq" && (
              <motion.div key="faq" initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">FAQ</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Common questions about booking and rescheduling interviews.</p>
                </div>
                <Card className="divide-y divide-gray-100 p-0 overflow-hidden">
                  {FAQ_ITEMS.map((item, i) => {
                    const open = expandedFaqIndex === i;
                    return (
                      <div key={i}>
                        <button onClick={() => setExpandedFaqIndex(open ? null : i)}
                          className="w-full flex items-center justify-between gap-3 text-left px-5 py-4 hover:bg-gray-50 transition-colors">
                          <span className="text-sm font-semibold text-gray-800">{item.q}</span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="px-5 pb-4 -mt-1">
                            <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
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

      <Modal
        open={!!cancelRescheduleTarget}
        onClose={() => { if (!cancelRescheduleSubmitting) setCancelRescheduleTarget(null); }}
        title={cancelRescheduleTarget?.mode === "cancel" ? "Cancel Interview" : "Request Reschedule"}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-2xl px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-relaxed">
              <span className="font-bold">Important:</span> cancellations and reschedules are tracked on your account.
              Repeatedly cancelling or rescheduling interviews may result in your account being blocked from further
              bookings. Please only do this if you genuinely can't make it.
            </p>
          </div>

          {cancelRescheduleTarget?.mode === "cancel" && (
            <p className="text-sm text-gray-500">
              Not free for any of this week's open slots? Slots only show about a week ahead, so cancelling just means
              you're not booking right now — come back to "Book an Interview" next week once new slots are open.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Reason {cancelRescheduleTarget?.mode === "cancel" ? "for cancelling" : "for rescheduling"} <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} autoFocus
              value={cancelRescheduleReason}
              onChange={e => setCancelRescheduleReason(e.target.value)}
              placeholder="Let us know what's going on…"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" disabled={cancelRescheduleSubmitting}
              onClick={() => setCancelRescheduleTarget(null)}>
              Back
            </Button>
            <Button
              variant={cancelRescheduleTarget?.mode === "cancel" ? "danger" : "primary"}
              className="flex-1" disabled={cancelRescheduleSubmitting || !cancelRescheduleReason.trim()}
              onClick={handleCancelRescheduleSubmit}
            >
              {cancelRescheduleSubmitting
                ? "Submitting…"
                : cancelRescheduleTarget?.mode === "cancel" ? "Confirm Cancellation" : "Continue to Pick a New Slot"}
            </Button>
          </div>
        </div>
      </Modal>
    </ErrorBoundary>
  );
}
