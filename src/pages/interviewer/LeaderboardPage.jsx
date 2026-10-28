import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Trophy, PartyPopper, Sparkles, CalendarPlus } from "lucide-react";
import { useInterviewsInDateRange } from "../../hooks/subscriptions";
import { useUsers } from "../../hooks/queries";
import { useAuth } from "../../AuthContext";

// Same ISO week (Monday–Sunday) / calendar month helpers as the admin and
// vendor leaderboards, so all three agree on what "this week"/"this month"
// means. "Overall" reuses the same date-range-scoped subscription with a
// wide fixed range rather than a separate unscoped query — simplest way to
// get "everything" without adding a new read path just for this.
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}
function thisMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}
function allTimeRange() {
  return { from: "2000-01-01", to: "2099-12-31" };
}
const RANGE_FOR = { week: thisWeekRange, month: thisMonthRange, overall: allTimeRange };

// First name kept, everything after it masked — e.g. "Kopal Rastogi" ->
// "Kopal *****" — other interviewers' full identities aren't exposed here.
function maskName(fullName) {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(/\s+/);
  return parts.length <= 1 ? parts[0] : `${parts[0]} *****`;
}

const CELEBRATION_LINES = [
  "Every interview you run helps someone take their next step — thank you.",
  "Consistency like this is what makes the program work. Keep going!",
  "Candidates remember a good interviewer long after the result comes in.",
  "Small sessions, big impact — this adds up more than it feels like.",
];

// Shown instead of the Thank You card when myCompleted is 0 — a plain
// "Congratulations! You've completed 0 interviews" read as hollow/ironic
// for someone who hasn't taken one yet, so this swaps in an energetic
// nudge toward Availability instead of quietly celebrating nothing.
const EMPTY_STATE_LINES = [
  "Candidates are waiting on a panelist like you — open up a few slots!",
  "It only takes a couple of free slots to make someone's day.",
  "Your next great interview is one availability slot away.",
];

export default function LeaderboardPage() {
  const { userProfile } = useAuth();
  const [period, setPeriod] = useState("week");
  const range = RANGE_FOR[period]();
  const interviews = useInterviewsInDateRange(range.from, range.to);
  const { data: usersAll = [] } = useUsers();

  // Sorted by completed count, but nothing in the UI below labels that order
  // (no #1/#2/#3, no medals) — this is a wall of everyone's effort, not a
  // ranking people can "lose".
  const rows = useMemo(() => {
    const activeInterviewers = usersAll.filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active");
    return activeInterviewers
      .map(ivr => ({
        interviewer: ivr,
        completed: interviews.filter(iv => iv.interviewerEmail === ivr.email && ["completed", "partially_completed"].includes(iv.status)).length,
      }))
      .sort((a, b) => b.completed - a.completed);
  }, [usersAll, interviews]);

  const myCompleted = rows.find(r => r.interviewer.id === userProfile?.id)?.completed ?? 0;
  const celebrationLine = CELEBRATION_LINES[new Date().getDate() % CELEBRATION_LINES.length];
  const emptyStateLine = EMPTY_STATE_LINES[new Date().getDate() % EMPTY_STATE_LINES.length];
  const shortDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const periodLabel = period === "week" ? `this week (${shortDate(range.from)} – ${shortDate(range.to)})`
    : period === "month" ? `this month (${shortDate(range.from)} – ${shortDate(range.to)})`
    : "overall (till date)";

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="max-w-2xl mx-auto space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center justify-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Leaderboard
          </h1>
          <div className="flex items-center justify-center gap-1 bg-gray-100 rounded-full p-1.5 mt-4 w-fit mx-auto">
            {[["week", "Weekly"], ["month", "Monthly"], ["overall", "Overall"]].map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  period === id ? "bg-white text-orange-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Personal recognition — the whole point of this page now:
           recognizing the viewing interviewer's own effort, not ranking
           them against everyone else. "Congratulations!" read oddly for 0
           interviews, so that state gets its own energetic nudge toward
           Availability instead of a hollow celebration. */}
        {myCompleted === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.05 }}
            className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-[1.75rem] shadow-card px-6 py-7 text-center text-white overflow-hidden relative"
          >
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CalendarPlus className="w-7 h-7" />
            </div>
            <p className="text-lg font-bold">No interviews {periodLabel}</p>
            <p className="text-sm text-amber-50 mt-1 max-w-sm mx-auto">
              No worries — give your availability and grab a meet schedule. Someone's waiting for a panelist like you.
            </p>
            <p className="text-xs text-amber-50/80 mt-2.5 flex items-center justify-center gap-1.5 max-w-sm mx-auto">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" /> {emptyStateLine}
            </p>
            <Link to="/interviewer/availability"
              className="inline-flex items-center gap-1.5 mt-4 bg-white text-orange-700 font-bold text-sm px-4 py-2 rounded-full hover:bg-amber-50 transition-colors shadow-sm">
              <CalendarPlus className="w-4 h-4" /> Add Availability
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.05 }}
            className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[1.75rem] shadow-card px-6 py-7 text-center text-white overflow-hidden relative"
          >
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <PartyPopper className="w-7 h-7" />
            </div>
            <p className="text-lg font-bold">Thank You!</p>
            <p className="text-sm text-emerald-50 mt-1">
              You've successfully completed <span className="font-extrabold text-white text-base">{myCompleted}</span> interview{myCompleted === 1 ? "" : "s"} {periodLabel}.
            </p>
            <p className="text-xs text-emerald-50/80 mt-2.5 flex items-center justify-center gap-1.5 max-w-sm mx-auto">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" /> {celebrationLine}
            </p>
          </motion.div>
        )}

        {rows.length === 0 ? (
          <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft flex flex-col items-center justify-center py-14">
            <Trophy className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No active interviewers yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-gray-400 px-1 flex items-center gap-1.5">
              👀 Kindly check out your fellow interviewers below too — everyone's putting in the effort.
            </p>
            {rows.map(row => {
              const isMe = row.interviewer.id === userProfile?.id;
              return (
                <div key={row.interviewer.id}
                  className={`bg-white rounded-[1.75rem] border p-4 flex items-center gap-4 transition-shadow ${
                    isMe ? "border-emerald-400 ring-2 ring-emerald-200 shadow-card" : "border-gray-100 shadow-soft"
                  }`}>
                  <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-gray-900 truncate">{maskName(row.interviewer.displayName) || row.interviewer.email}</p>
                      {isMe && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">You</span>
                      )}
                    </div>
                  </div>
                  <div className="text-center flex-shrink-0 w-16">
                    <p className="text-xl font-bold text-emerald-600">{row.completed}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Completed</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
