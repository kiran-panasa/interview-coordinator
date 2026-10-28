import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Video, CalendarDays } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import { compareTimeLabels, timeToMinutes } from "../../utils/dates";

const DAY_LABELS       = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Seven distinct hues, spread around the color wheel rather than clustered
// in the same warm family — pending_acceptance/partially_completed/no_show
// used to all be amber-or-adjacent and were hard to tell apart at a
// glance; each status now gets its own clearly different color.
const STATUS_DOT = {
  pending_acceptance:  "bg-violet-400",
  scheduled:           "bg-blue-500",
  completed:           "bg-emerald-500",
  partially_completed: "bg-amber-400",
  cancelled:           "bg-gray-300",
  declined:            "bg-red-400",
  no_show:             "bg-pink-400",
};
const STATUS_CHIP = {
  pending_acceptance:  "bg-violet-50 text-violet-700 hover:bg-violet-100",
  scheduled:           "bg-blue-50 text-blue-700 hover:bg-blue-100",
  completed:           "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  partially_completed: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  cancelled:           "bg-gray-100 text-gray-400 hover:bg-gray-200 line-through",
  declined:            "bg-red-50 text-red-600 hover:bg-red-100",
  no_show:             "bg-pink-50 text-pink-700 hover:bg-pink-100",
};
// A bolder, solid-fill version of the same palette for the day view's time
// blocks — the month view's soft chips get lost at that smaller size, but a
// proper calendar event block (Google Calendar-style) needs enough contrast
// to read as "this time is taken" at a glance.
const STATUS_BLOCK = {
  pending_acceptance:  "bg-violet-500",
  scheduled:           "bg-blue-500",
  completed:           "bg-emerald-500",
  partially_completed: "bg-amber-500",
  cancelled:           "bg-gray-300",
  declined:            "bg-red-400",
  no_show:             "bg-pink-500",
};
// What STATUS_DOT/STATUS_BLOCK's colors actually mean — shown as a legend
// so the color coding isn't something you have to guess or memorize.
const LEGEND = [
  { status: "scheduled",           label: "Scheduled" },
  { status: "completed",           label: "Completed" },
  { status: "pending_acceptance",  label: "Pending Acceptance" },
  { status: "partially_completed", label: "Partially Completed" },
  { status: "cancelled",           label: "Cancelled" },
  { status: "declined",            label: "Declined" },
  { status: "no_show",             label: "No Show" },
];

function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Full 6-row (42-cell) month grid, including the tail of the previous month
// and the lead-in of the next — same as Google Calendar's month view, so it
// never jumps height between months and a week spanning two months still
// reads left-to-right correctly. Shared by the main Month view and the Day
// view's mini side-calendar.
function buildMonthCells(year, month) {
  const firstDow      = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
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
  return cells;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const MAX_CHIPS_PER_DAY = 3;
const PX_PER_MIN = 1.5; // 90px/hour — tall enough that a 30-min slot is still legible
const DAY_START_SCROLL_HOUR = 7; // auto-scrolled here on open, same as Google Calendar's default morning view

export default function CalendarPage() {
  const { userProfile } = useAuth();
  const interviews = useInterviewerInterviews(userProfile?.email, userProfile?.id);
  const [view, setView] = useState("day"); // "month" | "day"
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [dayOverlay, setDayOverlay] = useState(null); // iso string of a day whose full list is expanded, or null

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

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

  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const overlayList = dayOverlay ? (byDate.get(dayOverlay) || []) : [];

  const goToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(todayIso);
  };
  const openDay = (iso) => {
    const [y, m] = iso.split("-").map(Number);
    setViewDate(new Date(y, m - 1, 1));
    setSelectedDay(iso);
    setView("day");
  };

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Every interview on your schedule, laid out by day.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
            {[{ id: "month", label: "Month" }, { id: "day", label: "Day" }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  view === v.id ? "bg-white text-gray-900 shadow-card" : "text-gray-500 hover:text-gray-700"
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1.5">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-card transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday}
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-gray-700 bg-white shadow-card">
              {MONTH_NAMES[month]} {year}
            </button>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-card transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mb-5">
        {LEGEND.map(l => (
          <span key={l.status} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[l.status]}`} />
            {l.label}
          </span>
        ))}
      </motion.div>

      {view === "month" ? (
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
                  <button onClick={() => openDay(iso)}
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                      isToday ? "bg-emerald-600 text-white" : c.inMonth ? "text-gray-700 hover:bg-gray-100" : "text-gray-300 hover:bg-gray-100"
                    }`}>
                    {c.day}
                  </button>
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
      ) : (
        <DayView
          year={year} month={month} cells={cells}
          selectedDay={selectedDay} setSelectedDay={setSelectedDay}
          todayIso={todayIso} byDate={byDate}
        />
      )}

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

// Google-Calendar-style day view: a mini month calendar on the side to pick
// the date, and a scrollable hour-by-hour grid on the right where each
// interview renders as a solid, time-proportional block (top = start time,
// height = duration) — so a 90-min interview visibly occupies more of the
// day than a 60-min one, and the exact time it blocks out is obvious at a
// glance, not just listed as text.
function DayView({ year, month, cells, selectedDay, setSelectedDay, todayIso, byDate }) {
  const scrollRef = useRef(null);
  const dayInterviews = byDate.get(selectedDay) || [];
  const isToday = selectedDay === todayIso;

  // Jump to ~7 AM (or earlier, if the day's first interview starts before
  // that) the moment the selected day changes — a day view that opens
  // scrolled to midnight with nothing visible isn't useful.
  useEffect(() => {
    if (!scrollRef.current) return;
    const earliestMin = dayInterviews.length
      ? Math.min(DAY_START_SCROLL_HOUR * 60, ...dayInterviews.map(iv => timeToMinutes(iv.scheduledTime)))
      : DAY_START_SCROLL_HOUR * 60;
    scrollRef.current.scrollTop = Math.max(0, earliestMin - 30) * PX_PER_MIN;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  const nowMin = isToday ? (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })() : null;

  // Side-by-side columns for any interviews that overlap in time — rare for
  // one interviewer (the booking flow already prevents double-booking a
  // slot), but a manually-created or imported interview could still clash,
  // and silently stacking them on top of each other would make one invisible.
  const laidOut = useMemo(() => {
    const withRange = dayInterviews.map(iv => {
      const start = timeToMinutes(iv.scheduledTime);
      return { iv, start, end: start + (iv.duration || 60) };
    }).sort((a, b) => a.start - b.start);
    const columns = [];
    withRange.forEach(item => {
      let col = columns.find(c => c[c.length - 1].end <= item.start);
      if (!col) { col = []; columns.push(col); }
      col.push(item);
      item.colIndex = columns.indexOf(col);
    });
    const colCount = columns.length || 1;
    return withRange.map(item => ({ ...item, colCount }));
  }, [dayInterviews]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
      className="flex gap-5 items-start flex-col lg:flex-row">
      {/* Mini side calendar */}
      <div className="w-full lg:w-64 flex-shrink-0 bg-white rounded-[1.75rem] border border-gray-100 shadow-soft p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">{MONTH_NAMES[month]} {year}</p>
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS_SHORT.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-gray-300 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c, idx) => {
            const iso = toIso(c.y, c.m, c.day);
            const hasInterviews = (byDate.get(iso) || []).length > 0;
            const isSelected = iso === selectedDay;
            const isToday = iso === todayIso;
            return (
              <button key={idx} onClick={() => setSelectedDay(iso)}
                className={`aspect-square flex flex-col items-center justify-center rounded-full text-[11px] font-medium transition-colors relative ${
                  isSelected ? "bg-emerald-600 text-white font-bold"
                    : isToday ? "text-emerald-600 font-bold hover:bg-emerald-50"
                    : c.inMonth ? "text-gray-700 hover:bg-gray-100" : "text-gray-300 hover:bg-gray-100"
                }`}>
                {c.day}
                {hasInterviews && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-emerald-500 absolute bottom-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hour-by-hour day grid */}
      <div className="flex-1 min-w-0 bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">
            {new Date(selectedDay + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <p className="text-xs text-gray-400">{dayInterviews.length} interview{dayInterviews.length === 1 ? "" : "s"}</p>
        </div>
        <div ref={scrollRef} className="relative overflow-y-auto scrollbar-thin" style={{ maxHeight: 560 }}>
          <div className="relative" style={{ height: 24 * 60 * PX_PER_MIN }}>
            {/* Hour rows */}
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="absolute left-0 right-0 flex items-start border-t border-gray-50"
                style={{ top: h * 60 * PX_PER_MIN }}>
                <span className="w-14 flex-shrink-0 -mt-2 pl-3 text-[10px] font-semibold text-gray-300">
                  {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                </span>
              </div>
            ))}

            {/* "Now" indicator */}
            {nowMin != null && (
              <div className="absolute left-14 right-3 flex items-center z-10 pointer-events-none" style={{ top: nowMin * PX_PER_MIN }}>
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}

            {/* Event blocks */}
            {laidOut.map(({ iv, start, end, colIndex, colCount }) => {
              const widthPct = 100 / colCount;
              return (
                <Link key={iv.id} to={`/interviewer/interviews/${iv.id}`}
                  title={`${iv.scheduledTime} · ${iv.candidateName} · ${iv.round || iv.templateName || "Interview"}`}
                  className={`absolute rounded-lg px-2 py-1 text-white shadow-soft hover:shadow-card hover:brightness-95 transition-all overflow-hidden ${STATUS_BLOCK[iv.status] || "bg-gray-400"}`}
                  style={{
                    top: start * PX_PER_MIN + 1,
                    height: Math.max((end - start) * PX_PER_MIN - 2, 18),
                    left: `calc(56px + ${colIndex * widthPct}% + 4px)`,
                    width: `calc(${widthPct}% - 8px)`,
                  }}>
                  <p className="text-[11px] font-bold leading-tight truncate">{iv.scheduledTime} {iv.candidateName}</p>
                  <p className="text-[10px] leading-tight opacity-90 truncate">{iv.round || iv.templateName || "Interview"}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
