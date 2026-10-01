import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, X } from "lucide-react";

function parseHHmm(v) {
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}
function to12Hour(h) {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, period };
}
function from12Hour(h12, period) {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}
function formatDisplay(v) {
  const p = parseHHmm(v);
  if (!p) return "";
  const { h12, period } = to12Hour(p.h);
  return `${String(h12).padStart(2, "0")}:${String(p.min).padStart(2, "0")} ${period}`;
}

const HOURS_12   = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);      // 0..59

/**
 * Drop-in replacement for <input type="time">. Same value/onChange contract
 * (value/emitted value are a 24-hour "HH:mm" string, onChange receives a
 * synthetic { target: { value } }) so existing `onChange={e => setX(e.target.value)}`
 * handlers work unchanged — only the JSX tag needs swapping, and everything
 * downstream that parses/compares/stores scheduledTime keeps working exactly
 * as before. Renders its own 12-hour AM/PM display and picker, since the
 * native widget's 24-hour-vs-12-hour rendering follows the OS/browser locale,
 * not anything a page can control — see DatePicker.jsx for the same
 * reasoning applied to dates.
 */
export default function TimePicker({
  value, onChange, className = "", placeholder = "--:-- --",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  const parsed = parseHHmm(value);
  const { h12: selH12, period: selPeriod } = parsed ? to12Hour(parsed.h) : { h12: null, period: "AM" };
  const selMin = parsed ? parsed.min : null;

  const openPicker = () => {
    if (disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Scroll the currently-selected hour/minute into view when the popover opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourListRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "center" });
      minuteListRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  const emit = (h24, min) => {
    onChange({ target: { value: `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}` } });
  };

  const pickHour  = (h12) => emit(from12Hour(h12, selPeriod ?? "AM"), selMin ?? 0);
  const pickMin   = (min) => emit(from12Hour(selH12 ?? 12, selPeriod ?? "AM"), min);
  const pickPeriod = (period) => emit(from12Hour(selH12 ?? 12, period), selMin ?? 0);

  return (
    <>
      <button
        type="button" ref={triggerRef} disabled={disabled}
        onClick={openPicker}
        className={`flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-left ${value ? "" : "text-gray-400"}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button" tabIndex={-1}
            onClick={e => { e.stopPropagation(); onChange({ target: { value: "" } }); }}
            className="text-gray-300 hover:text-gray-500 flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && coords && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 9999 }}
            className="bg-white rounded-xl border border-gray-200 shadow-popover p-2 w-40"
          >
            <div className="flex gap-1">
              <div ref={hourListRef} className="flex-1 max-h-48 overflow-y-auto">
                {HOURS_12.map(h => (
                  <button key={h} type="button" data-selected={h === selH12}
                    onClick={() => pickHour(h)}
                    className={`w-full text-center text-sm py-1.5 rounded-lg transition-colors ${
                      h === selH12 ? "bg-brand-600 text-white font-semibold" : "text-gray-700 hover:bg-gray-50"
                    }`}>
                    {String(h).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div ref={minuteListRef} className="flex-1 max-h-48 overflow-y-auto">
                {MINUTES_60.map(m => (
                  <button key={m} type="button" data-selected={m === selMin}
                    onClick={() => pickMin(m)}
                    className={`w-full text-center text-sm py-1.5 rounded-lg transition-colors ${
                      m === selMin ? "bg-brand-600 text-white font-semibold" : "text-gray-700 hover:bg-gray-50"
                    }`}>
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
              {["AM", "PM"].map(p => (
                <button key={p} type="button" onClick={() => pickPeriod(p)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                    p === selPeriod ? "bg-brand-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
