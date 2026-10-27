import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Video, CalendarDays } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import { compareTimeLabels } from "../../utils/dates";

const DAY_LABELS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Compact per-status dot/chip colors — a trimmed version of Badge.jsx's
// palette (same statuses, just sized for a small calendar chip rather than
// a full pill).
const STATUS_DOT = {
  pending_acceptance:  "bg-amber-400",
  scheduled:           "bg-blue-500",
  completed:           "bg-emerald-500",
  partially_completed: "bg-amber-400",
  cancelled:           "bg-gray-300",
  declined:            "bg-red-400",
  no_show:             "bg-orange-400",
};
const STATUS_CHIP = {
  pending_acceptance:  "bg-amber-50 text-amber-700 hover:bg-amber-100",
  scheduled:           "bg-blue-50 text-blue-700 hover:bg-blue-100",
  completed:           "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  partially_completed: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  cancelled:           "bg-gray-100 text-gray-400 hover:bg-gray-200 line-through",
  declined:            "bg-red-50 text-red-600 hover:bg-red-100",
  no_show:             "bg-orange-50 text-orange-700 hover:bg-orange-100",
};

function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const MAX_CHIPS_PER_DAY = 3;

export default function CalendarPage() {
  const { userProfile } = useAuth();
  const interviews = useInterviewerInterviews(userProfile?.email, userProfile?.id);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [dayOverlay, setDayOverlay] = useState(null); // iso string of a day whose full list is expanded, or null

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayIso = new Date().toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const iv of interviews) {
      if (!iv.scheduledDate) continue;
      if (!map.has(iv.scheduledDate)) map.set(iv.scheduledDate, []);
      map.get(iv.scheduledDate).push(iv);
    }
    for (const list of map.values()) list.sort((a, b) => compareTimeLabels(a.scheduledTime, b.scheduledTime));
    return map;
  }, [interviews]);

  const firstDow     = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // A full 6-row (42-cell) grid, including the tail end of the previous
  // month and the lead-in of the next — same as Google Calendar's month
  // view — so the grid never jumps in height between months and a week
  // spanning two months still reads left-to-right correctly.
  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, inMonth: false, y: month === 0 ? year - 1 : year, m: month === 0 ? 11 : month - 1 });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true, y: year, m: month });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const next = last.day + 1;
    const rollOver = next > new Date(last.y, last.m + 1, 0).getDate();
    cells.push(rollOver
      ? { day: 1, inMonth: false, y: month === 11 ? year + 1 : year, m: (month + 1) % 12 }
      : { day: next, inMonth: false, y: last.y, m: last.m });
  }

  const overlayList = dayOverlay ? (byDate.get(dayOverlay) || []) : [];

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Every interview on your schedule, laid out by day.</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1.5">
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-card transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setViewDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="px-4 py-1.5 rounded-full text-sm font-semibold text-gray-700 bg-white shadow-card">
            {MONTH_NAMES[month]} {year}
          </button>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-card transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden"
      >
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide py-3">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, idx) => {
            const iso = toIso(c.y, c.m, c.day);
            const dayInterviews = byDate.get(iso) || [];
            const isToday = iso === todayIso;
            const visible = dayInterviews.slice(0, MAX_CHIPS_PER_DAY);
            const extra = dayInterviews.length - visible.length;
            return (
              <div key={idx}
                className={`min-h-[110px] border-b border-r border-gray-50 px-2 py-2 ${idx % 7 === 6 ? "border-r-0" : ""} ${!c.inMonth ? "bg-gray-50/40" : ""}`}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                  isToday ? "bg-emerald-600 text-white" : c.inMonth ? "text-gray-700" : "text-gray-300"
                }`}>
                  {c.day}
                </span>
                <div className="mt-1.5 space-y-1">
                  {visible.map(iv => (
                    <Link key={iv.id} to={`/interviewer/interviews/${iv.id}`}
                      title={`${iv.scheduledTime} · ${iv.candidateName} · ${iv.round || iv.templateName || "Interview"}`}
                      className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate transition-colors ${STATUS_CHIP[iv.status] || "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[iv.status] || "bg-gray-300"}`} />
                      <span className="truncate">{iv.scheduledTime} {iv.candidateName}</span>
                    </Link>
                  ))}
                  {extra > 0 && (
                    <button onClick={() => setDayOverlay(iso)}
                      className="text-[10px] font-semibold text-gray-400 hover:text-emerald-600 px-1.5 transition-colors">
                      +{extra} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {dayOverlay && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4"
            onClick={() => setDayOverlay(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[1.75rem] shadow-popover w-full max-w-md max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-bold text-gray-900">
                    {new Date(dayOverlay + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
                <button onClick={() => setDayOverlay(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 space-y-2">
                {overlayList.map(iv => (
                  <Link key={iv.id} to={`/interviewer/interviews/${iv.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{iv.candidateName}</p>
                      <p className="text-xs text-gray-400">{iv.scheduledTime} · {iv.round || iv.templateName || "Interview"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {iv.meetLink && iv.status === "scheduled" && (
                        <Video className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[iv.status] || "bg-gray-300"}`} />
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
