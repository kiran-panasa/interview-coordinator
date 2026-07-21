import { useRef, useState, useEffect } from "react";
import { formatDate } from "../../utils/dates";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarClock, Clock, CheckCircle2, ArrowRight, AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import Badge from "../../components/Badge";
import StatCard from "../../components/ui/StatCard";
import { SkeletonStatCards, SkeletonRows } from "../../components/Skeleton";

function PhoneNudge({ userProfile }) {
  const hasPhone = !!(userProfile?.phone || userProfile?.phoneNumber);
  if (hasPhone) return null;
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
      <p className="text-xs text-amber-800">
        <span className="font-semibold">Add a phone number to your profile</span> — it's required for OTP-based password recovery if you ever lose access to your email.{" "}
        <Link to="/interviewer/profile" className="underline font-semibold hover:text-amber-900">
          Go to Profile →
        </Link>
      </p>
    </div>
  );
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

export default function InterviewerDashboard() {
  const { userProfile } = useAuth();
  const interviews = useInterviewerInterviews(userProfile?.email);

  // interviews starts out as the hook's initial [] and is replaced with a new
  // array reference the moment the first Firestore snapshot arrives — compare
  // against that initial reference to know when real data has loaded.
  const initialInterviewsRef = useRef(interviews);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (interviews !== initialInterviewsRef.current) setLoaded(true);
  }, [interviews]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming  = interviews.filter(i => i.scheduledDate >= today && (i.status === "scheduled" || i.status === "pending_acceptance"));
  const todayList = interviews.filter(i => i.scheduledDate === today && i.status === "scheduled");
  const pending   = interviews.filter(i => i.status === "pending_acceptance");
  const completed = interviews.filter(i => i.status === "completed");

  return (
    <div className="p-8 max-w-7xl">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {userProfile?.displayName || userProfile?.email}
        </p>
      </motion.div>

      <PhoneNudge userProfile={userProfile} />

      {!loaded ? (
        <div className="mb-8"><SkeletonStatCards count={3} /></div>
      ) : (
        <motion.div
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
          <motion.div variants={fadeUp}>
            <StatCard label="Upcoming"     value={upcoming.length}  color="text-emerald-600" icon={CalendarClock} iconBg="bg-emerald-50" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Needs Action" value={pending.length}   color="text-amber-600"   icon={Clock}         iconBg="bg-amber-50" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Completed"    value={completed.length} color="text-teal-600"    icon={CheckCircle2}  iconBg="bg-teal-50" />
          </motion.div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-gray-400" /> Today
            </h2>
            <span className="text-xs text-gray-400">{formatDate(today)}</span>
          </div>
          {!loaded ? (
            <div className="p-4"><SkeletonRows count={3} /></div>
          ) : todayList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-14">No interviews today</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayList.map((i, idx) => (
                <motion.div
                  key={i.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + idx * 0.03 }}
                >
                  <Link to={`/interviewer/interviews/${i.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/70 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{i.candidateName}</p>
                      <p className="text-xs text-gray-500 truncate">{i.round} · {i.roleAppliedFor}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-700 flex-shrink-0">{i.scheduledTime}</p>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Needs action */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-soft"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> Needs Your Action
            </h2>
            <Link to="/interviewer/interviews" className="text-xs text-emerald-600 font-semibold hover:text-emerald-700 flex items-center gap-1 group">
              View all <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {!loaded ? (
            <div className="p-4"><SkeletonRows count={3} /></div>
          ) : pending.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-14">No pending interviews</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pending.map((i, idx) => (
                <motion.div
                  key={i.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + idx * 0.03 }}
                >
                  <Link to={`/interviewer/interviews/${i.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{i.candidateName}</p>
                      <p className="text-xs text-gray-500 truncate">{i.round} · {formatDate(i.scheduledDate)} at {i.scheduledTime}</p>
                    </div>
                    <Badge value={i.status} />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
