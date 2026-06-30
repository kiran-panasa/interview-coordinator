import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export default function KebabMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, right: 0 });
  const btnRef      = useRef();
  const dropdownRef = useRef();

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        btnRef.current?.contains(e.target) ||
        dropdownRef.current?.contains(e.target)
      ) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open]);

  const visible = actions.filter(a => a.show !== false);
  if (visible.length === 0) return null;

  const handleOpen = () => {
    if (!open) {
      const rect = btnRef.current.getBoundingClientRect();
      const estimatedHeight = visible.length * 36 + 8;
      const flipUp = rect.bottom + estimatedHeight > window.innerHeight - 8;
      setPos({
        top:    flipUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
        right:  window.innerWidth - rect.right,
        flipUp,
      });
    }
    setOpen(o => !o);
  };

  return (
    <div className="flex justify-center">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5"  r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]"
        >
          {visible.map((a, i) => (
            <button
              key={i}
              disabled={a.disabled}
              onClick={() => { if (!a.disabled) { setOpen(false); a.onClick(); } }}
              className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                a.danger
                  ? "text-red-500 hover:bg-red-50 disabled:hover:bg-transparent"
                  : a.highlight
                    ? "text-emerald-700 hover:bg-emerald-50 disabled:hover:bg-transparent"
                    : "text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
