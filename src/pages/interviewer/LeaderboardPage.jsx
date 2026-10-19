import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, Award } from "lucide-react";
import { useInterviewsInDateRange } from "../../hooks/subscriptions";
import { useUsers } from "../../hooks/queries";

// Same ISO week (Monday–Sunday) / calendar month helpers as the admin and
// vendor leaderboards, so all three agree on what "this week"/"this month"
// means.
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
// First name kept, everything after it masked — e.g. "Kopal Rastogi" ->
// "Kopal *****" — other interviewers' full identities aren't exposed here.
function maskName(fullName) {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(/\s+/);
  return parts.length <= 1 ? parts[0] : `${parts[0]} *****`;
}

const RANK_STYLE = [
  { icon: Trophy, badge: "bg-gradient-to-br from-amber-400 to-yellow-500 text-white", card: "border-amber-200 bg-amber-50/60" },
  { icon: Medal,  badge: "bg-gradient-to-br from-gray-300 to-gray-400 text-white",    card: "border-gray-200 bg-gray-50/60" },
  { icon: Award,  badge: "bg-gradient-to-br from-orange-400 to-amber-700 text-white", card: "border-orange-200 bg-orange-50/40" },
];

export default function LeaderboardPage() {
  const [period, setPeriod] = useState("week");
  const range = period === "week" ? thisWeekRange() : thisMonthRange();
  const interviews = useInterviewsInDateRange(range.from, range.to);
  const { data: usersAll = [] } = useUsers();

  // Ranked by COMPLETED interviews (actual work done) in the period — same
  // ranking rule as the admin and vendor dashboard leaderboards, across
  // every active interviewer, every vendor.
  const ranked = useMemo(() => {
    const activeInterviewers = usersAll.filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active");
    return activeInterviewers
      .map(ivr => {
        const ivrInterviews = interviews.filter(iv => iv.interviewerEmail === ivr.email);
        const completed = ivrInterviews.filter(iv => ["completed", "partially_completed"].includes(iv.status)).length;
        return { interviewer: ivr, completed, total: ivrInterviews.length };
      })
      .sort((a, b) => b.completed - a.completed || b.total - a.total);
  }, [usersAll, interviews]);

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="max-w-2xl mx-auto space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center justify-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Leaderboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranked by completed interviews across every vendor — names shown first-name-only for privacy
          </p>
          <div className="flex items-center justify-center gap-1 bg-gray-100 rounded-xl p-1 mt-4 w-fit mx-auto">
            {[["week", "Weekly"], ["month", "Monthly"]].map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  period === id ? "bg-white text-orange-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">{range.from} – {range.to}</p>
        </div>

        {ranked.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-14">
            <Trophy className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No active interviewers yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {ranked.map((row, i) => {
              const style = RANK_STYLE[i];
              const RankIcon = style?.icon;
              return (
                <div key={row.interviewer.id} className={`bg-white rounded-2xl border border-gray-100 shadow-soft p-4 flex items-center gap-4 ${style?.card || ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                    style ? style.badge : "bg-gray-100 text-gray-500"
                  }`}>
                    {RankIcon ? <RankIcon className="w-5 h-5" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{maskName(row.interviewer.displayName) || row.interviewer.email}</p>
                    <p className="text-xs text-gray-400">{row.total} total interview{row.total !== 1 ? "s" : ""} this {period}</p>
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
