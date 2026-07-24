import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { formatDateLong, formatDate } from "../../utils/dates";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock3, CalendarDays,
  Plus, Wand2, Repeat, Flag, Trash2, X, Info, AlertTriangle, Search,
  ListChecks, CheckCircle2, Save,
} from "lucide-react";
import {
  subscribeToInterviewerAvailability,
  addAvailabilitySlots,
  removeAvailabilitySlot,
  removeAvailabilitySlots,
  flagAvailabilitySlot,
  getAllUsers,
  createNotification,
  subscribeToBlockedDates,
} from "../../api/firestore";
import { useInterviewerInterviews } from "../../hooks/subscriptions";
import { usePagination } from "../../hooks/usePagination";
import { findBlockedDate, isDateBlocked } from "../../utils/blockedDates";
import { callAppsScript } from "../../lib/appsScript";
import Toast from "../../components/Toast";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import Button from "../../components/Button";
import DatePicker from "../../components/DatePicker";
import { Skeleton, SkeletonRows } from "../../components/Skeleton";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

const DAY_LABELS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const PRESET_TIMES = [
  "09:00 AM","10:00 AM","11:00 AM","12:00 PM",
  "01:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM","06:00 PM",
];
const DURATION_OPTIONS = [15, 30, 45, 60];
const BUFFER_OPTIONS   = [0, 5, 10, 15];
const WEEKDAY_SET      = new Set([1, 2, 3, 4, 5]);
const STATUS_ORDER = { free: 0, booked: 1, completed: 2 };
const STATUS_LABEL = { free: "Free", booked: "Booked", completed: "Completed" };
const STATUS_BADGE_CLS = {
  free:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  booked:    "bg-orange-50 text-orange-600 border-orange-200",
  completed: "bg-violet-50 text-violet-700 border-violet-200",
};

// ── Time helpers ────────────────────────────────────────────────────────────────

function parseTimeToMinutes(hhmm) {
  if (!hhmm) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesToAmPm(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}
// Sort key so AM/PM chip labels order chronologically, not alphabetically
function timeSortKey(label) {
  const m = label.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (m[3] === "PM") h += 12;
  return h * 60 + parseInt(m[2], 10);
}
function generateRangeSlots(startHHMM, endHHMM, durationMin, bufferMin) {
  const startM = parseTimeToMinutes(startHHMM);
  const endM   = parseTimeToMinutes(endHHMM);
  if (isNaN(startM) || isNaN(endM) || endM <= startM) return [];
  const step = durationMin + bufferMin;
  const out = [];
  let cur = startM;
  while (cur + durationMin <= endM) {
    out.push(minutesToAmPm(cur));
    cur += step;
  }
  return out;
}

// ── Date helpers ─────────────────────────────────────────────────────────────────

function isoToDow(iso) {
  return new Date(iso + "T12:00:00").getDay();
}
function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function shortDateLabel(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function expandRecurrence(anchorDates, days, untilIso) {
  if (!days.size || !untilIso) return [];
  const sorted = [...anchorDates].sort();
  const start  = sorted[0];
  if (!start || untilIso < start) return [];
  const out = [];
  let cursor = start;
  let guard  = 0;
  while (cursor <= untilIso && guard < 730) {
    if (days.has(isoToDow(cursor))) out.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard++;
  }
  return out;
}

// Inline confirm component — avoids window.confirm and keeps the UI in-page
function InlineConfirm({ message, onConfirm, onCancel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-gray-600">{message}</span>
      <button onClick={onConfirm}
        className="font-semibold text-red-600 hover:text-red-800 underline">Yes</button>
      <button onClick={onCancel}
        className="font-semibold text-gray-500 hover:text-gray-700">No</button>
    </span>
  );
}

export default function AvailabilityPage() {
  const { currentUser, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const nudgeFrom       = searchParams.get("from");
  const nudgeTo         = searchParams.get("to");
  const nudgeTemplate   = searchParams.get("template");
  const nudgeNotifId    = searchParams.get("notifId");
  const nudgeSenderEmail = searchParams.get("senderEmail");
  const nudgeSenderName  = searchParams.get("senderName");
  const isNudgeContext = !!(nudgeFrom || nudgeTo);
  const nudgeNotifiedRef = useRef(false);

  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [blockedDates, setBlockedDates] = useState([]);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Slot builder (pending — not yet saved)
  const [pendingTimes, setPendingTimes] = useState(new Set());
  const [customTime, setCustomTime] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd,   setRangeEnd]   = useState("");
  const [duration,   setDuration]   = useState(30);
  const [buffer,     setBuffer]     = useState(0);
  const [rangeError, setRangeError] = useState("");

  // Recurrence
  const [recurDays,  setRecurDays]  = useState(new Set());
  const [recurUntil, setRecurUntil] = useState("");
  const [showCustomDays, setShowCustomDays] = useState(false);

  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Single-slot inline confirm state: { slotId, context }
  const [confirming, setConfirming] = useState(null);
  const [flagging,   setFlagging]   = useState(null);

  // Bulk delete (Upcoming table)
  const [selectedSlotIds, setSelectedSlotIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    return subscribeToInterviewerAvailability(currentUser.uid, (data) => {
      setSlots(data);
      setLoaded(true);
    });
  }, [currentUser.uid]);

  useEffect(() => subscribeToBlockedDates(setBlockedDates), []);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  const slotsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  }, [slots]);

  const isoDate = (d) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const singleDate = selectedDates.size === 1 ? [...selectedDates][0] : null;
  const daySlots = useMemo(() =>
    singleDate
      ? (slotsByDate[singleDate] || []).slice().sort((a, b) => timeSortKey(a.time) - timeSortKey(b.time))
      : [],
  [slotsByDate, singleDate]);
  const freeCount = useMemo(() => daySlots.filter(s => !s.isBooked).length, [daySlots]);

  // ── Effective dates the pending slots will be applied to ─────────────────────
  const recurrenceDates = useMemo(
    () => expandRecurrence(selectedDates, recurDays, recurUntil),
    [selectedDates, recurDays, recurUntil]
  );
  const effectiveDates = useMemo(() => {
    const set = new Set(selectedDates);
    recurrenceDates.forEach(d => set.add(d));
    return [...set].filter(d => d >= todayStr && !isDateBlocked(d, blockedDates)).sort();
  }, [selectedDates, recurrenceDates, todayStr, blockedDates]);

  const recurrenceHasBlockedDates = useMemo(
    () => recurrenceDates.some(d => isDateBlocked(d, blockedDates)),
    [recurrenceDates, blockedDates]
  );

  const sortedPendingTimes = useMemo(
    () => [...pendingTimes].sort((a, b) => timeSortKey(a) - timeSortKey(b)),
    [pendingTimes]
  );

  const plannedCreations = useMemo(() => {
    const toCreate = [];
    let skipped = 0;
    for (const date of effectiveDates) {
      const existingTimes = new Set((slotsByDate[date] || []).map(s => s.time));
      for (const time of pendingTimes) {
        if (existingTimes.has(time)) { skipped++; continue; }
        toCreate.push({ date, time });
      }
    }
    return { toCreate, skipped };
  }, [effectiveDates, pendingTimes, slotsByDate]);

  // ── Calendar / date selection ─────────────────────────────────────────────────

  const toggleDateSelect = (ds) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(ds)) next.delete(ds); else next.add(ds);
      return next;
    });
  };
  const clearSelectedDates = () => setSelectedDates(new Set());

  // ── Slot builder handlers ─────────────────────────────────────────────────────

  const togglePendingTime = (time) => {
    setPendingTimes(prev => {
      const next = new Set(prev);
      if (next.has(time)) next.delete(time); else next.add(time);
      return next;
    });
  };

  const handleAddCustomTime = () => {
    if (!customTime) return;
    const label = minutesToAmPm(parseTimeToMinutes(customTime));
    setPendingTimes(prev => new Set(prev).add(label));
    setCustomTime("");
  };

  const handleGenerateRange = () => {
    setRangeError("");
    if (!rangeStart || !rangeEnd) return setRangeError("Pick both a start and end time.");
    const startM = parseTimeToMinutes(rangeStart);
    const endM   = parseTimeToMinutes(rangeEnd);
    if (endM <= startM) return setRangeError("End time must be after the start time.");
    const generated = generateRangeSlots(rangeStart, rangeEnd, duration, buffer);
    if (generated.length === 0) return setRangeError("That range is too short for the selected duration.");
    setPendingTimes(prev => new Set([...prev, ...generated]));
    setToast({ message: `${generated.length} slot${generated.length !== 1 ? "s" : ""} added to your selection — review below.` });
  };

  const toggleWeekdays  = () => setRecurDays(prev => {
    const allSet = [...WEEKDAY_SET].every(d => prev.has(d));
    const next = new Set(prev);
    WEEKDAY_SET.forEach(d => allSet ? next.delete(d) : next.add(d));
    return next;
  });
  const toggleRecurDay = (d) => setRecurDays(prev => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  const handleOpenSaveConfirm = () => {
    if (pendingTimes.size === 0)
      return setToast({ message: "Select at least one time slot to add.", type: "error" });
    if (effectiveDates.length === 0)
      return setToast({ message: "Select at least one date (or set up a recurrence).", type: "error" });
    if (recurDays.size > 0 && !recurUntil)
      return setToast({ message: "Pick a \"Repeat until\" date for the recurring days you selected.", type: "error" });
    if (plannedCreations.toCreate.length === 0)
      return setToast({ message: "All selected slots already exist on the chosen date(s).", type: "error" });
    setShowSaveConfirm(true);
  };

  // Fires once, only after slots are actually saved (not on the earlier
  // "I'm Available" click) — `createdEntries` is the list of {date, time}
  // slots that were just written, used both for the in-app admin
  // notification and the confirmation email back to whoever sent the nudge.
  const notifyAdminsSlotsAdded = (createdEntries) => {
    if (!isNudgeContext || nudgeNotifiedRef.current) return;
    nudgeNotifiedRef.current = true;
    const interviewerName = userProfile?.displayName || currentUser.email;
    const dateRange = nudgeFrom && nudgeTo ? ` (${formatDate(nudgeFrom)} – ${formatDate(nudgeTo)})` : "";

    getAllUsers().then(allUsers => {
      const admins = allUsers.filter(u => u.role === "admin" && u.status === "active");
      return Promise.all(admins.map(admin =>
        createNotification({
          type:        "slot_added",
          recipientId: admin.id,
          status:      "unread",
          message:     `${interviewerName} has saved availability slots${nudgeTemplate ? ` for "${nudgeTemplate}"` : ""}${dateRange}.`,
          interviewerId: currentUser.uid,
          ...(nudgeNotifId ? { originalNotificationId: nudgeNotifId } : {}),
        })
      ));
    }).catch(() => {});

    if (APPS_SCRIPT_URL && nudgeSenderEmail && createdEntries.length > 0) {
      const countsByDate = createdEntries.reduce((acc, { date }) => {
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      const dates = Object.keys(countsByDate).sort();
      const dateLines = dates
        .map(date => `• ${formatDate(date)}: ${countsByDate[date]} slot${countsByDate[date] !== 1 ? "s" : ""}`)
        .join("\n");
      const totalSlots = createdEntries.length;

      callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:  "sendEmail",
        subject: `Availability Saved — ${interviewerName}`,
        body:
          `${interviewerName} has saved their availability for "${nudgeTemplate || "your request"}"${dateRange}:\n\n` +
          `${dateLines}\n\n` +
          `Total: ${totalSlots} slot${totalSlots !== 1 ? "s" : ""} across ${dates.length} date${dates.length !== 1 ? "s" : ""}.\n\n` +
          `This confirms their availability has been successfully saved.`,
        recipients: [{ email: nudgeSenderEmail, name: nudgeSenderName || "Admin" }],
      }).catch(() => {});
    }
  };

  const handleConfirmSave = async () => {
    setShowSaveConfirm(false);
    setBusy(true);
    try {
      await addAvailabilitySlots(currentUser.uid, plannedCreations.toCreate);
      const skippedNote = plannedCreations.skipped > 0
        ? ` (${plannedCreations.skipped} already existed and were skipped)`
        : "";
      setToast({ message: `Availability updated successfully — ${plannedCreations.toCreate.length} slot(s) saved across ${effectiveDates.length} date(s)${skippedNote}.` });
      notifyAdminsSlotsAdded(plannedCreations.toCreate);
      // Reset the builder for a clean slate
      setPendingTimes(new Set());
      setRangeStart(""); setRangeEnd(""); setRangeError("");
      setRecurDays(new Set()); setRecurUntil(""); setShowCustomDays(false);
      setSelectedDates(new Set());
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  // ── Single-slot handlers (existing behaviour, kept for the one-date view) ────

  const confirmRemoveSlot = (slot) => {
    if (slot.isBooked) return;
    setConfirming({ slotId: slot.id });
  };

  const handleRemoveSlot = async (slotId) => {
    setConfirming(null);
    setBusy(true);
    try {
      await removeAvailabilitySlot(currentUser.uid, slotId);
      setToast({ message: "Slot removed." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const handleClearAllFree = async () => {
    setConfirming(null);
    setBusy(true);
    const freeSlots = daySlots.filter(s => !s.isBooked);
    try {
      await removeAvailabilitySlots(currentUser.uid, freeSlots.map(s => s.id));
      setToast({ message: `${freeSlots.length} slot${freeSlots.length !== 1 ? "s" : ""} deleted successfully.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const confirmFlagSlot = (slot) => setFlagging(slot.id);

  const handleFlagSlot = async (slotId) => {
    setFlagging(null);
    setBusy(true);
    try {
      const slot = slots.find(s => s.id === slotId);
      await flagAvailabilitySlot(currentUser.uid, slotId, true);

      const allUsers = await getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin" && u.status === "active");
      const interviewerName = userProfile?.displayName || currentUser.email;
      await Promise.all(admins.map(admin =>
        createNotification({
          type:        "slot_conflict",
          recipientId: admin.id,
          status:      "unread",
          message:     `${interviewerName} flagged a conflict: ${slot?.date} at ${slot?.time}. Please reassign or cancel the interview.`,
          interviewerId: currentUser.uid,
          slotId,
        })
      ));
      setToast({ message: "Conflict flagged. Admin has been notified." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const handleUnflagSlot = async (slotId) => {
    setBusy(true);
    try {
      await flagAvailabilitySlot(currentUser.uid, slotId, false);
      setToast({ message: "Flag removed." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // ── Slot chip renderer (single-date view) ─────────────────────────────────────
  const renderSlotChip = (s) => {
    const isConfirming = confirming?.slotId === s.id;
    const isFlagging   = flagging === s.id;

    if (s.isBooked) {
      return (
        <span key={s.id}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
          {s.time}
          <span className="opacity-60 mx-0.5">· Booked</span>
          {s.flagged ? (
            <span className="flex items-center gap-1">
              <span className="text-red-500 font-bold">⚑ Flagged</span>
              <button onClick={() => handleUnflagSlot(s.id)} disabled={busy}
                className="text-gray-400 hover:text-gray-600 text-[10px] underline ml-0.5">Unflag</button>
            </span>
          ) : isFlagging ? (
            <InlineConfirm
              message="Flag conflict?"
              onConfirm={() => handleFlagSlot(s.id)}
              onCancel={() => setFlagging(null)}
            />
          ) : (
            <button
              onClick={() => confirmFlagSlot(s)}
              disabled={busy}
              title="You can no longer make this slot — notify admin"
              className="ml-0.5 text-orange-400 hover:text-red-600 transition-colors font-bold text-sm leading-none"
              aria-label="Flag conflict">
              ⚑
            </button>
          )}
        </span>
      );
    }

    return (
      <span key={s.id}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        {s.time}
        {isConfirming ? (
          <InlineConfirm
            message="Remove?"
            onConfirm={() => handleRemoveSlot(s.id)}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <button onClick={() => confirmRemoveSlot(s)} disabled={busy}
            className="ml-0.5 hover:text-red-500 transition-colors font-bold leading-none"
            title="Remove this slot"
            aria-label="Remove slot">
            ×
          </button>
        )}
      </span>
    );
  };

  // ── Interview status lookup — lets a booked slot report as "Completed" ───────
  const myInterviews = useInterviewerInterviews(userProfile?.email);
  const interviewStatusById = useMemo(() => {
    const map = {};
    myInterviews.forEach(iv => { map[iv.id] = iv.status; });
    return map;
  }, [myInterviews]);
  const slotStatus = (s) => {
    if (!s.isBooked) return "free";
    if (s.interviewId && interviewStatusById[s.interviewId] === "completed") return "completed";
    return "booked";
  };

  // ── Upcoming slots table: filters, search, sort, grouping, pagination ────────
  const [tableDateFrom, setTableDateFrom] = useState(todayStr);
  const [tableDateTo,   setTableDateTo]   = useState("");
  const [tableStatus,   setTableStatus]   = useState("");
  const [tableTimeFrom, setTableTimeFrom] = useState("");
  const [tableTimeTo,   setTableTimeTo]   = useState("");
  const [tableSearch,   setTableSearch]   = useState("");
  const [tableSortBy,   setTableSortBy]   = useState("date");
  const [tableSortDir,  setTableSortDir]  = useState("asc");
  const [collapsedDates, setCollapsedDates] = useState(new Set());

  const toggleDateCollapse = (date) => setCollapsedDates(prev => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  const toggleSort = (col) => {
    if (tableSortBy === col) setTableSortDir(d => d === "asc" ? "desc" : "asc");
    else { setTableSortBy(col); setTableSortDir("asc"); }
  };

  const clearTableFilters = () => {
    setTableDateFrom(todayStr); setTableDateTo(""); setTableStatus("");
    setTableTimeFrom(""); setTableTimeTo(""); setTableSearch("");
  };
  const tableFiltersActive = tableDateFrom !== todayStr || tableDateTo || tableStatus || tableTimeFrom || tableTimeTo || tableSearch;

  const filteredSlots = useMemo(() => {
    const fromM = tableTimeFrom ? parseTimeToMinutes(tableTimeFrom) : null;
    const toM   = tableTimeTo   ? parseTimeToMinutes(tableTimeTo)   : null;
    return slots.filter(s => {
      if (tableDateFrom && s.date < tableDateFrom) return false;
      if (tableDateTo   && s.date > tableDateTo)   return false;
      if (tableStatus && slotStatus(s) !== tableStatus) return false;
      if (fromM != null || toM != null) {
        const mins = timeSortKey(s.time);
        if (fromM != null && mins < fromM) return false;
        if (toM   != null && mins > toM)   return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, tableDateFrom, tableDateTo, tableStatus, tableTimeFrom, tableTimeTo, interviewStatusById]);

  const groupedEntries = useMemo(() => {
    const map = {};
    filteredSlots.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    let entries = Object.entries(map);

    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      entries = entries.filter(([date]) => {
        const label = new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        return label.toLowerCase().includes(q) || date.includes(q);
      });
    }

    entries.forEach(([, rows]) => {
      if (tableSortBy === "status") {
        rows.sort((a, b) => (tableSortDir === "asc" ? 1 : -1) * (STATUS_ORDER[slotStatus(a)] - STATUS_ORDER[slotStatus(b)]));
      } else if (tableSortBy === "time") {
        rows.sort((a, b) => (tableSortDir === "asc" ? 1 : -1) * (timeSortKey(a.time) - timeSortKey(b.time)));
      } else {
        rows.sort((a, b) => timeSortKey(a.time) - timeSortKey(b.time));
      }
    });

    entries.sort((a, b) => {
      const cmp = a[0].localeCompare(b[0]);
      return tableSortBy === "date" && tableSortDir === "desc" ? -cmp : cmp;
    });

    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSlots, tableSearch, tableSortBy, tableSortDir, interviewStatusById]);

  const tablePagination = usePagination(groupedEntries, 8);

  const visibleFree = useMemo(
    () => tablePagination.paged.flatMap(([, rows]) => rows).filter(s => !s.isBooked),
    [tablePagination.paged]
  );
  const allVisibleFreeSelected = visibleFree.length > 0 && visibleFree.every(s => selectedSlotIds.has(s.id));
  const toggleSelectAllVisible = () => setSelectedSlotIds(prev => {
    const next = new Set(prev);
    if (allVisibleFreeSelected) visibleFree.forEach(s => next.delete(s.id));
    else visibleFree.forEach(s => next.add(s.id));
    return next;
  });
  const toggleSelectAllInGroup = (rows) => {
    const free = rows.filter(s => !s.isBooked);
    const allSelected = free.length > 0 && free.every(s => selectedSlotIds.has(s.id));
    setSelectedSlotIds(prev => {
      const next = new Set(prev);
      free.forEach(s => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  };
  const toggleSlotRowSelect = (s) => {
    if (s.isBooked) return setToast({ message: "Booked slots cannot be deleted.", type: "error" });
    setSelectedSlotIds(prev => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
  };

  const selectedBookedCount = useMemo(
    () => [...selectedSlotIds].filter(id => slots.find(s => s.id === id)?.isBooked).length,
    [selectedSlotIds, slots]
  );

  const handleConfirmBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    const idsToDelete = [...selectedSlotIds].filter(id => !slots.find(s => s.id === id)?.isBooked);
    if (idsToDelete.length === 0) {
      setToast({ message: "Booked slots cannot be deleted.", type: "error" });
      return;
    }
    setBusy(true);
    try {
      await removeAvailabilitySlots(currentUser.uid, idsToDelete);
      setToast({ message: `${idsToDelete.length} slot${idsToDelete.length !== 1 ? "s" : ""} deleted successfully.` });
      setSelectedSlotIds(new Set());
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  if (!loaded) {
    return (
      <div className="p-8 space-y-6">
        <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /></div>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <Skeleton className="w-full lg:w-80 h-96 rounded-2xl flex-shrink-0" />
          <Skeleton className="flex-1 w-full h-96 rounded-2xl" />
        </div>
        <SkeletonRows count={4} />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">My Availability</h1>
      <p className="text-sm text-gray-500 mb-6">Select one or more dates, build your slots, then save.</p>

      {isNudgeContext && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              Adding slots for{nudgeTemplate ? `: ${nudgeTemplate}` : " an interview session"}
            </p>
            {nudgeFrom && nudgeTo && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Please add your available time slots between {formatDate(nudgeFrom)} and {formatDate(nudgeTo)}.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Calendar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 w-full lg:w-80 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-sm font-bold text-gray-900">{MONTH_NAMES[month]} {year}</p>
            <button onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d  = i + 1;
              const ds = isoDate(d);
              const daySlotArr = slotsByDate[ds] || [];
              const hasBooked  = daySlotArr.some(s => s.isBooked);
              const hasFree    = daySlotArr.some(s => !s.isBooked);
              const hasFlagged = daySlotArr.some(s => s.flagged);
              const isToday    = ds === todayStr;
              const isSelected = selectedDates.has(ds);
              const isRecurPreview = !isSelected && recurrenceDates.includes(ds);
              const isPast     = ds < todayStr;
              const blocked    = findBlockedDate(ds, blockedDates);

              return (
                <button key={d}
                  onClick={() => {
                    if (blocked) {
                      setToast({ message: `This date is blocked${blocked.reason ? `: ${blocked.reason}` : ""}.`, type: "info" });
                      return;
                    }
                    toggleDateSelect(ds);
                  }}
                  title={blocked ? `Blocked${blocked.reason ? `: ${blocked.reason}` : ""}` : undefined}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors
                    ${blocked
                      ? "bg-red-50 text-red-300 line-through cursor-not-allowed"
                      : isSelected
                        ? isPast
                          ? "bg-gray-400 text-white ring-2 ring-gray-200 ring-offset-1"
                          : "bg-emerald-600 text-white ring-2 ring-emerald-300 ring-offset-1"
                        : isRecurPreview
                          ? "bg-emerald-100 text-emerald-700 font-semibold"
                          : isToday
                            ? "bg-emerald-50 text-emerald-700 font-bold"
                            : isPast
                              ? "text-gray-300 hover:bg-gray-50"
                              : "text-gray-700 hover:bg-gray-50"
                    }`}>
                  <span>{d}</span>
                  {blocked ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-0.5" />
                  ) : daySlotArr.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasFree    && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      {hasBooked  && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                      {hasFlagged && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Free
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />Booked
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Flagged
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />Selected
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Blocked
            </span>
          </div>
        </div>

        {/* ── Slot manager ── */}
        <div className="flex-1 w-full bg-white rounded-2xl border border-gray-100 shadow-soft p-5 min-h-64">
          {selectedDates.size === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-12">Select one or more dates on the calendar to add or manage time slots.</p>
          ) : (
            <>
              {/* Selected-dates header */}
              <div className="flex items-start justify-between gap-3 mb-1">
                {singleDate ? (
                  <h2 className="text-base font-bold text-gray-900">{formatDateLong(singleDate)}</h2>
                ) : (
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{selectedDates.size} dates selected</h2>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[...selectedDates].sort().map(ds => (
                        <span key={ds} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          {shortDateLabel(ds)}
                          <button onClick={() => toggleDateSelect(ds)} className="hover:text-red-500" aria-label={`Remove ${ds}`}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {singleDate && freeCount > 0 && (
                  confirming?.slotId === "clearAll" ? (
                    <InlineConfirm
                      message={`Remove all ${freeCount} free slot${freeCount !== 1 ? "s" : ""}?`}
                      onConfirm={handleClearAllFree}
                      onCancel={() => setConfirming(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setConfirming({ slotId: "clearAll" })}
                      disabled={busy}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors disabled:opacity-40 whitespace-nowrap">
                      Clear all free
                    </button>
                  )
                )}
                {selectedDates.size > 1 && (
                  <button onClick={clearSelectedDates} className="text-xs text-gray-400 hover:text-gray-600 underline whitespace-nowrap">
                    Clear selection
                  </button>
                )}
              </div>

              {/* Existing slots — only shown for a single selected date to keep the view readable */}
              {singleDate && (
                <>
                  <p className="text-xs text-gray-400 mb-5">
                    {daySlots.length} slot{daySlots.length !== 1 ? "s" : ""} set
                  </p>
                  {daySlots.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {daySlots.map(s => renderSlotChip(s))}
                    </div>
                  )}
                  {daySlots.some(s => s.isBooked) && (
                    <p className="text-xs text-gray-400 mb-4 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Booked slots have an interview scheduled. Use ⚑ to flag a conflict and notify admin.
                    </p>
                  )}
                </>
              )}

              {/* ── Slot builder — hidden for a single past date, matching the read-only chip view ── */}
              {singleDate && singleDate < todayStr ? (
                <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-5 mt-1">Past date — slots are read-only.</p>
              ) : (
              <div className="border-t border-gray-100 pt-5 mt-1 space-y-5">
                {/* 1. Multi-select preset times */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pick Time Slots</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_TIMES.map(t => {
                      const isPending = pendingTimes.has(t);
                      return (
                        <button key={t} type="button" onClick={() => togglePendingTime(t)} disabled={busy}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            isPending
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:text-emerald-600"
                          }`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-end gap-2 mt-2.5">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Custom time</label>
                      <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleAddCustomTime()}
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <button type="button" onClick={handleAddCustomTime} disabled={busy || !customTime}
                      className="px-3 py-1.5 bg-white text-emerald-600 border border-emerald-300 rounded-lg text-xs font-semibold hover:bg-emerald-50 disabled:opacity-40 transition-colors">
                      + Add Time
                    </button>
                    <p className="text-[11px] text-gray-400 pb-1.5">Pick any exact time — e.g. 9:30 AM, 2:45 PM — not just the presets above.</p>
                  </div>
                </div>

                {/* 2. Custom time range */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Or Add a Custom Range</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Start</label>
                      <input type="time" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">End</label>
                      <input type="time" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Duration</label>
                      <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        {DURATION_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Buffer</label>
                      <select value={buffer} onChange={e => setBuffer(Number(e.target.value))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        {BUFFER_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                      </select>
                    </div>
                    <button onClick={handleGenerateRange} disabled={busy}
                      className="px-4 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-60">
                      Generate
                    </button>
                  </div>
                  {rangeError && <p className="text-xs text-red-500 mt-1.5">{rangeError}</p>}
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    e.g. 10:30 AM – 1:30 PM at 30 min slots generates 09:30, 10:00, 10:30… up to the end time.
                  </p>
                </div>

                {/* Pending selection review */}
                {pendingTimes.size > 0 && (
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-800 mb-2">
                      {pendingTimes.size} slot{pendingTimes.size !== 1 ? "s" : ""} selected
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedPendingTimes.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {t}
                          <button onClick={() => togglePendingTime(t)} className="hover:text-red-500" aria-label={`Remove ${t}`}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Recurrence */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Repeat (optional)</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button type="button" onClick={toggleWeekdays}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        [...WEEKDAY_SET].every(d => recurDays.has(d))
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-emerald-400"
                      }`}>
                      Weekdays (Mon–Fri)
                    </button>
                    <button type="button" onClick={() => toggleRecurDay(6)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        recurDays.has(6) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200 hover:border-emerald-400"
                      }`}>
                      Saturdays
                    </button>
                    <button type="button" onClick={() => toggleRecurDay(0)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        recurDays.has(0) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200 hover:border-emerald-400"
                      }`}>
                      Sundays
                    </button>
                    <button type="button" onClick={() => setShowCustomDays(v => !v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                      {showCustomDays ? "Hide custom days" : "Custom days…"}
                    </button>
                  </div>

                  {showCustomDays && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {DAY_LABELS.map((label, d) => (
                        <button key={d} type="button" onClick={() => toggleRecurDay(d)}
                          title={label}
                          className={`w-9 h-9 rounded-lg text-[11px] font-semibold border transition-colors ${
                            recurDays.has(d) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                          }`}>
                          {label.slice(0, 2)}
                        </button>
                      ))}
                    </div>
                  )}

                  {recurDays.size > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Repeat until</label>
                      <DatePicker value={recurUntil} min={todayStr} onChange={e => setRecurUntil(e.target.value)} accent="emerald"
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  )}
                  {recurrenceHasBlockedDates && (
                    <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Some dates in this range are blocked by admin and will be skipped.
                    </p>
                  )}
                </div>

                {/* Effective dates + save */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    {pendingTimes.size > 0 && effectiveDates.length > 0 ? (
                      <>
                        Will create up to <span className="font-semibold text-gray-700">{plannedCreations.toCreate.length}</span> slot(s)
                        {" "}across <span className="font-semibold text-gray-700">{effectiveDates.length}</span> date(s)
                        {plannedCreations.skipped > 0 && <> — {plannedCreations.skipped} already exist and will be skipped</>}.
                      </>
                    ) : (
                      "Pick time slots and at least one date to continue."
                    )}
                  </p>
                  <button onClick={handleOpenSaveConfirm} disabled={busy}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                    Save Availability
                  </button>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── My Upcoming Slots table ── */}
      {slots.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-base font-bold text-gray-900">My Upcoming Slots</h2>
            {selectedSlotIds.size > 0 && (
              <button onClick={() => setShowBulkDeleteConfirm(true)} disabled={busy}
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                Mark as Unavailable ({selectedSlotIds.size})
              </button>
            )}
          </div>

          {/* ── Filters ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">From</label>
              <DatePicker value={tableDateFrom} onChange={e => setTableDateFrom(e.target.value)} accent="emerald"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">To</label>
              <DatePicker value={tableDateTo} onChange={e => setTableDateTo(e.target.value)} accent="emerald"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Status</label>
              <select value={tableStatus} onChange={e => setTableStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">All</option>
                <option value="free">Free</option>
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Time from</label>
              <input type="time" value={tableTimeFrom} onChange={e => setTableTimeFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Time to</label>
              <input type="time" value={tableTimeTo} onChange={e => setTableTimeTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[10px] text-gray-400 mb-1">Search by date</label>
              <input type="text" value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                placeholder="e.g. 15 Jul, Wed, 2026-07-15…"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            {tableFiltersActive && (
              <button onClick={clearTableFilters} className="text-xs text-gray-400 hover:text-gray-600 underline pb-1.5">
                Clear filters
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 w-8">
                    {visibleFree.length > 0 && (
                      <input type="checkbox" checked={allVisibleFreeSelected} onChange={toggleSelectAllVisible}
                        title="Select all free slots on this page"
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                    )}
                  </th>
                  {[
                    { key: "date",   label: "Date" },
                    { key: "time",   label: "Time" },
                    { key: "status", label: "Status" },
                  ].map(col => (
                    <th key={col.key} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">
                      <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-gray-600 transition-colors">
                        {col.label}
                        {tableSortBy === col.key && (
                          <span className="text-emerald-500">{tableSortDir === "asc" ? "▲" : "▼"}</span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tablePagination.paged.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">No slots match these filters.</td></tr>
                )}
                {tablePagination.paged.map(([date, rows]) => {
                  const isCollapsed = collapsedDates.has(date);
                  const freeInGroup = rows.filter(s => !s.isBooked);
                  const groupAllSelected = freeInGroup.length > 0 && freeInGroup.every(s => selectedSlotIds.has(s.id));
                  const counts = rows.reduce((acc, s) => { acc[slotStatus(s)] = (acc[slotStatus(s)] || 0) + 1; return acc; }, {});
                  return (
                    <Fragment key={date}>
                      <tr className="bg-gray-50/70 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          {freeInGroup.length > 0 && (
                            <input type="checkbox" checked={groupAllSelected} onChange={() => toggleSelectAllInGroup(rows)}
                              title="Select all free slots on this date"
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                          )}
                        </td>
                        <td colSpan={4} className="px-4 py-2.5">
                          <button onClick={() => toggleDateCollapse(date)} className="flex items-center gap-2 w-full text-left">
                            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isCollapsed ? "-rotate-90" : ""}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="font-semibold text-gray-900 text-sm">
                              {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            <span className="text-xs text-gray-400">{rows.length} slot{rows.length !== 1 ? "s" : ""}</span>
                            <span className="flex items-center gap-1 ml-auto">
                              {Object.entries(counts).map(([st, n]) => (
                                <span key={st} className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${STATUS_BADGE_CLS[st]}`}>
                                  {n} {STATUS_LABEL[st]}
                                </span>
                              ))}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {!isCollapsed && rows.map(s => {
                        const isConfirmingRow = confirming?.slotId === s.id;
                        const isFlaggingRow   = flagging === s.id;
                        const status = slotStatus(s);
                        return (
                          <tr key={s.id} className={`hover:bg-gray-50 ${s.flagged ? "bg-red-50" : selectedSlotIds.has(s.id) ? "bg-emerald-50/40" : ""}`}>
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selectedSlotIds.has(s.id)} disabled={s.isBooked}
                                onChange={() => toggleSlotRowSelect(s)}
                                title={s.isBooked ? "Booked slots cannot be deleted." : undefined}
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" />
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs pl-9" />
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">{s.time}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[status]}`}>
                                {STATUS_LABEL[status]}
                              </span>
                              {s.flagged && (
                                <span className="ml-1.5 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">⚑ Flagged</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {s.isBooked ? (
                                s.flagged ? (
                                  <button onClick={() => handleUnflagSlot(s.id)} disabled={busy}
                                    className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors disabled:opacity-40">
                                    Unflag
                                  </button>
                                ) : isFlaggingRow ? (
                                  <InlineConfirm
                                    message="Flag conflict?"
                                    onConfirm={() => handleFlagSlot(s.id)}
                                    onCancel={() => setFlagging(null)}
                                  />
                                ) : (
                                  <button onClick={() => confirmFlagSlot(s)} disabled={busy}
                                    title="Flag that you can no longer honour this slot"
                                    className="text-xs text-orange-500 hover:text-red-600 font-semibold transition-colors disabled:opacity-40">
                                    ⚑ Flag conflict
                                  </button>
                                )
                              ) : (
                                isConfirmingRow ? (
                                  <InlineConfirm
                                    message="Remove?"
                                    onConfirm={() => handleRemoveSlot(s.id)}
                                    onCancel={() => setConfirming(null)}
                                  />
                                ) : (
                                  <button onClick={() => confirmRemoveSlot(s)} disabled={busy}
                                    className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors disabled:opacity-40">
                                    Remove
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={tablePagination.page} totalPages={tablePagination.totalPages}
              total={tablePagination.total} pageSize={tablePagination.pageSize}
              onPageChange={tablePagination.setPage}
            />
          </div>
        </div>
      )}

      {/* ── Save confirmation ── */}
      <Modal open={showSaveConfirm} onClose={() => setShowSaveConfirm(false)} title="Save Availability">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            You're about to save <span className="font-semibold">{plannedCreations.toCreate.length} slot{plannedCreations.toCreate.length !== 1 ? "s" : ""}</span> for{" "}
            <span className="font-semibold">
              {effectiveDates.slice(0, 3).map(shortDateLabel).join(", ")}
              {effectiveDates.length > 3 ? ` and ${effectiveDates.length - 3} more` : ""}
            </span>.
            {plannedCreations.skipped > 0 && (
              <> {plannedCreations.skipped} slot{plannedCreations.skipped !== 1 ? "s" : ""} already exist and will be skipped.</>
            )}
          </p>
          <p className="text-sm text-gray-500">Do you want to save these changes?</p>
          <div className="flex gap-3 pt-1">
            <button onClick={handleConfirmSave} disabled={busy}
              className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setShowSaveConfirm(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk "mark as unavailable" confirmation ── */}
      <Modal open={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)} title="Mark as Unavailable">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to mark {selectedSlotIds.size - selectedBookedCount} selected slot{(selectedSlotIds.size - selectedBookedCount) !== 1 ? "s" : ""} as unavailable? This removes them from your availability and cannot be undone.
          </p>
          {selectedBookedCount > 0 && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Booked slots cannot be deleted. {selectedBookedCount} booked slot{selectedBookedCount !== 1 ? "s" : ""} in your selection will be skipped.
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={handleConfirmBulkDelete} disabled={busy}
              className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
              {busy ? "Saving…" : "Mark as Unavailable"}
            </button>
            <button onClick={() => setShowBulkDeleteConfirm(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </motion.div>
  );
}
