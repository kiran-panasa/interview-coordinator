import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

const DAY_LABELS  = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ACCENT = {
  brand:   { selected: "bg-brand-600 text-white",   hover: "hover:bg-brand-50" },
  emerald: { selected: "bg-emerald-600 text-white", hover: "hover:bg-emerald-50" },
};

function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}
function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function formatDisplay(iso) {
  const p = parseIso(iso);
  return p ? `${String(p.d).padStart(2, "0")}/${String(p.m + 1).padStart(2, "0")}/${p.y}` : "";
}

/**
 * Drop-in replacement for <input type="date">. Same value/onChange contract
 * (onChange receives a synthetic { target: { value } } with a YYYY-MM-DD
 * string) so existing `onChange={e => setX(e.target.value)}` handlers work
 * unchanged — only the JSX tag needs swapping. Renders its own DD/MM/YYYY
 * display so it looks identical everywhere, regardless of browser/OS locale.
 */
export default function DatePicker({
  value, onChange, min, max, className = "", placeholder = "dd/mm/yyyy",
  disabled = false, accent = "brand",
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const p = parseIso(value) || parseIso(min) || null;
    const now = new Date();
    return p ? new Date(p.y, p.m, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const colors = ACCENT[accent] || ACCENT.brand;

  const openPicker = () => {
    if (disabled) return;
    const p = parseIso(value);
    setViewDate(p ? new Date(p.y, p.m, 1) : viewDate);
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

  const emit = (iso) => {
    onChange({ target: { value: iso } });
    setOpen(false);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button" ref={triggerRef} disabled={disabled}
        onClick={openPicker}
        className={`flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-left ${value ? "" : "text-gray-400"}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button" tabIndex={-1}
            onClick={e => { e.stopPropagation(); emit(""); }}
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
            className="bg-white rounded-xl border border-gray-200 shadow-popover p-3 w-64"
          >
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-bold text-gray-900">{MONTH_NAMES[month]} {year}</p>
              <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const iso = toIso(year, month, d);
                const isSelected = iso === value;
                const isToday = iso === todayIso;
                const isDisabled = (min && iso < min) || (max && iso > max);
                return (
                  <button key={d} type="button" disabled={isDisabled}
                    onClick={() => emit(iso)}
                    className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                      isSelected ? colors.selected
                        : isDisabled ? "text-gray-200 cursor-not-allowed"
                        : isToday ? `font-bold ${colors.hover}`
                        : `text-gray-700 ${colors.hover}`
                    }`}>
                    {d}
                  </button>
                );
              })}
            </div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
