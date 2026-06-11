import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../AuthContext";
import {
  getInterviewerAvailability,
  addAvailabilitySlot,
  removeAvailabilitySlot,
} from "../../api/firestore";
import Toast from "../../components/Toast";

const DAY_LABELS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const PRESET_TIMES = [
  "09:00 AM","10:00 AM","11:00 AM","12:00 PM",
  "01:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM","06:00 PM",
];

function toAmPm(hhmm) {
  const [hh, mm] = hhmm.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
}

export default function AvailabilityPage() {
  const { currentUser } = useAuth();
  const [slots, setSlots] = useState([]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    const all = await getInterviewerAvailability(currentUser.uid);
    setSlots(all);
  }, [currentUser.uid]);

  useEffect(() => { load(); }, [load]);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  const slotsByDate = {};
  slots.forEach(s => {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  });

  const isoDate = (d) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const daySlots = selectedDate
    ? (slotsByDate[selectedDate] || []).sort((a, b) => a.time.localeCompare(b.time))
    : [];

  const handleAddSlot = async (time) => {
    if (daySlots.find(s => s.time === time))
      return setToast({ message: "That slot already exists.", type: "error" });
    setBusy(true);
    try {
      await addAvailabilitySlot(currentUser.uid, selectedDate, time);
      await load();
      setToast({ message: `${time} added.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const handleRemoveSlot = async (slot) => {
    if (slot.isBooked)
      return setToast({ message: "Cannot delete a booked slot.", type: "error" });
    setBusy(true);
    await removeAvailabilitySlot(currentUser.uid, slot.id);
    await load();
    setToast({ message: "Slot removed." });
    setBusy(false);
  };

  const handleCustomAdd = async () => {
    if (!customTime) return;
    await handleAddSlot(toAmPm(customTime));
    setCustomTime("");
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Availability</h1>
      <p className="text-sm text-gray-500 mb-6">Click a date to add or manage time slots</p>

      <div className="flex gap-6 items-start">
        {/* Calendar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 w-80 flex-shrink-0">
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
              const isToday    = ds === todayStr;
              const isSelected = ds === selectedDate;
              const isPast     = ds < todayStr;

              return (
                <button key={d} onClick={() => setSelectedDate(ds)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors
                    ${isSelected
                      ? "bg-indigo-600 text-white"
                      : isToday
                        ? "bg-indigo-50 text-indigo-700 font-bold"
                        : isPast
                          ? "text-gray-300 cursor-default"
                          : "text-gray-700 hover:bg-gray-50"
                    }`}>
                  <span>{d}</span>
                  {daySlotArr.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasFree   && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      {hasBooked && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Free
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />Booked
            </span>
          </div>
        </div>

        {/* Slot manager */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5 min-h-64">
          {!selectedDate ? (
            <p className="text-sm text-gray-400 text-center mt-12">Select a date to manage time slots</p>
          ) : (
            <>
              <h2 className="text-base font-bold text-gray-900 mb-0.5">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </h2>
              <p className="text-xs text-gray-400 mb-5">
                {daySlots.length} slot{daySlots.length !== 1 ? "s" : ""} set
              </p>

              {/* Current slots */}
              {daySlots.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {daySlots.map(s => (
                    <span key={s.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                        s.isBooked ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                      {s.time}
                      {s.isBooked
                        ? <span className="opacity-60">· Booked</span>
                        : (
                          <button onClick={() => handleRemoveSlot(s)} disabled={busy}
                            className="ml-0.5 hover:text-red-500 transition-colors font-bold leading-none">
                            ×
                          </button>
                        )
                      }
                    </span>
                  ))}
                </div>
              )}

              {selectedDate >= todayStr ? (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add Time Slot</p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {PRESET_TIMES.map(t => {
                      const exists = !!daySlots.find(s => s.time === t);
                      return (
                        <button key={t} onClick={() => handleAddSlot(t)}
                          disabled={exists || busy}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            exists
                              ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                              : "bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:text-indigo-600"
                          }`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="time" value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={handleCustomAdd} disabled={!customTime || busy}
                      className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                      Add Custom
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Past date — slots are read-only.</p>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
