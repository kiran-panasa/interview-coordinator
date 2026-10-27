import { useState, useEffect } from "react";
import { Clock3, AlertTriangle } from "lucide-react";
import { subscribeToSelfBookCutoffSettings } from "../api/firestore";
import { computeSelfBookWindow, DEFAULT_SELF_BOOK_CUTOFF_TIME } from "../utils/selfBookWindow";
import { formatDateLong } from "../utils/dates";

function formatCutoffTime(hhmm) {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Shown on the "Book an Interview" tab and inside InlineSlotPicker (covers
// both a fresh self-book and Request Reschedule, since both open that same
// picker) — the food-app-style "order before X" urgency banner for the
// same-day-booking-never-allowed / cutoff-time rule enforced server-side in
// resolveSelfBookTarget (api/sso-handler.js). This is a courtesy display
// only; the actual enforcement happens there regardless of what this shows.
export default function SelfBookCutoffBanner({ compact = false }) {
  const [cutoffTime, setCutoffTime] = useState(DEFAULT_SELF_BOOK_CUTOFF_TIME);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => subscribeToSelfBookCutoffSettings(s => setCutoffTime(s.cutoffTime || DEFAULT_SELF_BOOK_CUTOFF_TIME)), []);

  // 30s is plenty for an hours/minutes countdown — no need for per-second
  // ticks that would just churn re-renders for no visible benefit.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { earliestDate, cutoffInstant, pastCutoff } = computeSelfBookWindow(now, cutoffTime);
  const msLeft = cutoffInstant.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (60 * 60 * 1000)));
  const minsLeft  = Math.max(0, Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000)));

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 ${
      pastCutoff ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"
    }`}>
      {pastCutoff
        ? <Clock3 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <p className={`text-xs font-bold ${pastCutoff ? "text-gray-600" : "text-amber-800"}`}>
          {pastCutoff
            ? `Booking for tomorrow has closed — earliest available is ${formatDateLong(earliestDate)}.`
            : `Hurry up! ${hoursLeft}h ${String(minsLeft).padStart(2, "0")}m left to book for tomorrow (${formatDateLong(earliestDate)}).`}
        </p>
        {!compact && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Today's slots can't be booked. {!pastCutoff && `After ${formatCutoffTime(cutoffTime)}, tomorrow closes too and the earliest becomes the day after.`}
          </p>
        )}
      </div>
    </div>
  );
}
