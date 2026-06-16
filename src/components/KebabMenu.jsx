import { useState, useRef, useEffect } from "react";

export default function KebabMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const visible = actions.filter(a => a.show !== false);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5"  r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {visible.map((a, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); a.onClick(); }}
              className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                a.danger
                  ? "text-red-500 hover:bg-red-50"
                  : a.highlight
                    ? "text-emerald-700 hover:bg-emerald-50"
                    : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
