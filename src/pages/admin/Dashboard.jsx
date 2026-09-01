import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, Clock, CheckCircle2,
  ArrowRight, CalendarClock, UserPlus,
} from "lucide-react";
import { useAllInterviews, usePendingUsers } from "../../hooks/queries";
import Badge from "../../components/Badge";
import StatCard from "../../components/ui/StatCard";
import { SkeletonStatCards, SkeletonRows } from "../../components/Skeleton";

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  return d >= weekStart && d <= weekEnd;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

export default function AdminDashboard() {
  const { data: interviews   = [], isLoading: interviewsLoading } = useAllInterviews();
  const { data: pendingUsers = [], isLoading: usersLoading      } = usePendingUsers();
  const loaded = !interviewsLoading && !usersLoading;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = interviews
    .filter(i => i.scheduledDate >= today && i.status !== "cancelled" && i.status !== "declined")
    .slice(0, 8);

  const stats = {
    total:     interviews.length,
    thisWeek:  interviews.filter(i => isThisWeek(i.scheduledDate)).length,
    pending:   interviews.filter(i => i.status === "pending_acceptance").length,
    completed: interviews.filter(i => i.status === "completed").length,
  };

  return (
    <div className="p-8 max-w-7xl">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all interview activity</p>
      </motion.div>

      {!loaded ? (
        <div className="mb-8"><SkeletonStatCards /></div>
      ) : (
        <motion.div
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <motion.div variants={fadeUp}>
            <StatCard label="Total Interviews"   value={stats.total}     color="text-gray-900"    icon={BarChart3}    iconBg="bg-gray-100" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="This Week"          value={stats.thisWeek}  color="text-brand-600"   icon={TrendingUp}   iconBg="bg-brand-50" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Pending Acceptance" value={stats.pending}   color="text-amber-600"   icon={Clock}        iconBg="bg-amber-50" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Completed"          value={stats.completed} color="text-emerald-600" icon={CheckCircle2} iconBg="bg-emerald-50" />
          </motion.div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming interviews */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-soft"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-gray-400" /> Upcoming Interviews
            </h2>
            <Link to="/admin/interviews" className="text-xs text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-1 group">
              View all <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {!loaded ? (
            <div className="p-4"><SkeletonRows count={5} /></div>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-14">No upcoming interviews</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming.map((i, idx) => (
                <motion.div
                  key={i.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + idx * 0.03 }}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{i.candidateName}</p>
                    <p className="text-xs text-gray-500 truncate">{i.round} · {i.interviewerName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700">{i.scheduledDate}</p>
                    <p className="text-xs text-gray-400">{i.scheduledTime}</p>
                  </div>
                  <Badge value={i.status} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Pending approvals */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-gray-400" /> Pending Approvals
            </h2>
            <Link to="/admin/interviewers" className="text-xs text-brand-600 font-semibold hover:text-brand-700">Manage</Link>
          </div>
          {!loaded ? (
            <div className="p-4"><SkeletonRows count={3} /></div>
          ) : pendingUsers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-14">No pending sign-ups</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingUsers.map(u => (
                <div key={u.id} className="px-5 py-3.5 hover:bg-gray-50/70 transition-colors">
                  <p className="text-sm font-medium text-gray-900">{u.displayName || "—"}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
