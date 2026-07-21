import { useRef, useState, useEffect } from "react";
import { formatDate, parseInterviewStart } from "../../utils/dates";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import Badge from "../../components/Badge";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { SkeletonRows } from "../../components/Skeleton";

const TABS = ["Upcoming", "Past", "All"];

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

export default function MyInterviewsPage() {
  const { userProfile } = useAuth();
  const interviews = useInterviewerInterviews(userProfile?.email);
  const [tab, setTab] = useState("Upcoming");
  const [filterStatus, setFilterStatus] = useState("All");

  // interviews starts out as the hook's initial [] and is replaced with a new
  // array reference the moment the first Firestore snapshot arrives — compare
  // against that initial reference to know when real data has loaded.
  const initialInterviewsRef = useRef(interviews);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (interviews !== initialInterviewsRef.current) setLoaded(true);
  }, [interviews]);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  function isPastStart(scheduledDate, scheduledTime) {
    if (!scheduledDate) return false;
    const start = parseInterviewStart(scheduledDate, scheduledTime);
    return start ? start < now : scheduledDate < today;
  }

  let filtered = interviews;
  if (tab === "Upcoming") {
    filtered = interviews.filter(i =>
      i.scheduledDate >= today && i.status !== "cancelled" && i.status !== "declined"
    );
  } else if (tab === "Past") {
    filtered = interviews.filter(i =>
      i.scheduledDate < today ||
      i.status === "completed" || i.status === "cancelled" ||
      i.status === "declined" || i.status === "no_show"
    );
  }
  if (filterStatus !== "All") filtered = filtered.filter(i => i.status === filterStatus);

  const uniqueStatuses = [...new Set(interviews.map(i => i.status))].filter(Boolean).sort();

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Interviews</h1>
        <p className="text-sm text-gray-500 mt-1">{interviews.length} total</p>
      </motion.div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setFilterStatus("All"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="All">All Statuses</option>
          {uniqueStatuses.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden"
      >
        {!loaded ? (
          <div className="p-4"><SkeletonRows count={6} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Candidate", "Role", "Round", "Date", "Time", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-14">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarClock className="w-6 h-6 text-gray-300" />
                        No interviews found
                      </div>
                    </td>
                  </tr>
                ) : paged.map((i, idx) => (
                  <motion.tr
                    key={i.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                    className="hover:bg-gray-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">{i.candidateName}</td>
                    <td className="px-4 py-3 text-gray-600">{i.roleAppliedFor || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{i.round || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(i.scheduledDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{i.scheduledTime || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge value={i.status} />
                      {i.status === "scheduled" && isPastStart(i.scheduledDate, i.scheduledTime) && i.candidateJoined == null && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          Mark attendance
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/interviewer/interviews/${i.id}`}
                        className="text-xs text-emerald-600 font-semibold hover:text-emerald-700">View</Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </motion.div>
    </div>
  );
}
