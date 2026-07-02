import { useState, useEffect, useMemo } from "react";
import { formatDateLong } from "../../utils/dates";
import { useAuth } from "../../AuthContext";
import {
  subscribeToInterviewerAvailability,
  addAvailabilitySlot,
  removeAvailabilitySlot,
  flagAvailabilitySlot,
  getAllUsers,
  createNotification,
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

  // Inline confirm state: { slotId, context } where context = "chip" | "table" | "clearAll"
  const [confirming, setConfirming] = useState(null);
  // Flag confirm: slotId being flagged or null
  const [flagging, setFlagging] = useState(null);

  useEffect(() => {
    return subscribeToInterviewerAvailability(currentUser.uid, setSlots);
  }, [currentUser.uid]);

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

  const daySlots = useMemo(() =>
    selectedDate
      ? (slotsByDate[selectedDate] || []).slice().sort((a, b) => a.time.localeCompare(b.time))
      : [],
  [slotsByDate, selectedDate]);

  const freeCount = useMemo(() => daySlots.filter(s => !s.isBooked).length, [daySlots]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAddSlot = async (time) => {
    if (daySlots.find(s => s.time === time))
      return setToast({ message: "That slot already exists.", type: "error" });
    setBusy(true);
    try {
      await addAvailabilitySlot(currentUser.uid, selectedDate, time);
      setToast({ message: `${time} added.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBusy(false);
  };

  const confirmRemoveSlot = (slot) => {
    if (slot.isBooked) return; // safety — should never be called on booked slots
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
      await Promise.all(freeSlots.map(s => removeAvailabilitySlot(currentUser.uid, s.id)));
      setToast({ message: `${freeSlots.length} slot${freeSlots.length !== 1 ? "s" : ""} removed.` });
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

      // Notify all admins
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

  const handleCustomAdd = async () => {
    if (!customTime) return;
    await handleAddSlot(toAmPm(customTime));
    setCustomTime("");
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // ── Slot chip renderer ────────────────────────────────────────────────────────
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

  // ── Upcoming slots (all future) ───────────────────────────────────────────────
  const upcoming = useMemo(() =>
    slots
      .filter(s => s.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
  [slots, todayStr]);

  const grouped = useMemo(() => upcoming.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {}), [upcoming]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Availability</h1>
      <p className="text-sm text-gray-500 mb-6">Click a date to add or manage time slots</p>

      <div className="flex gap-6 items-start">
        {/* ── Calendar ── */}
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
              const hasFlagged = daySlotArr.some(s => s.flagged);
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
          </div>
        </div>

        {/* ── Slot manager ── */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5 min-h-64">
          {!selectedDate ? (
            <p className="text-sm text-gray-400 text-center mt-12">Select a date to manage time slots</p>
          ) : (
            <>
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-base font-bold text-gray-900">{formatDateLong(selectedDate)}</h2>
                {/* Clear all free slots */}
                {freeCount > 0 && selectedDate >= todayStr && (
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
                      className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors disabled:opacity-40">
                      Clear all free
                    </button>
                  )
                )}
              </div>
              <p className="text-xs text-gray-400 mb-5">
                {daySlots.length} slot{daySlots.length !== 1 ? "s" : ""} set
              </p>

              {/* Current slots as chips */}
              {daySlots.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {daySlots.map(s => renderSlotChip(s))}
                </div>
              )}

              {/* Booked slot notice */}
              {daySlots.some(s => s.isBooked) && (
                <p className="text-xs text-gray-400 mb-4 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Booked slots have an interview scheduled. Use ⚑ to flag a conflict and notify admin.
                </p>
              )}

              {/* Add time slots */}
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

      {/* ── My Upcoming Slots table ── */}
      {upcoming.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-bold text-gray-900 mb-3">My Upcoming Slots</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Date", "Time", "Status", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(grouped).map(([date, daySlotList]) =>
                  daySlotList.map((s, i) => {
                    const isConfirmingRow = confirming?.slotId === s.id;
                    const isFlaggingRow   = flagging === s.id;
                    return (
                      <tr key={s.id} className={`hover:bg-gray-50 ${s.flagged ? "bg-red-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {i === 0
                            ? new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                            : ""}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs">{s.time}</td>
                        <td className="px-4 py-3">
                          {s.isBooked ? (
                            <span className="text-[11px] font-semibold bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">Booked</span>
                          ) : (
                            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Free</span>
                          )}
                          {s.flagged && (
                            <span className="ml-1.5 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">⚑ Flagged</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
