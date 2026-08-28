import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X } from "lucide-react";

// Single-select dropdown with a live text filter — a drop-in replacement
// for a native <select> whose option list is long enough (dozens/hundreds
// of candidates, interviewers, etc.) that scrolling to find one by eye is
// impractical and native browser type-ahead (jump-to-first-letter only)
// doesn't help.
export default function SearchableSelect({
  options = [], // [{ id, label }]
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => { if (!open) setSearch(""); }, [open]);

  const selected = options.find(o => o.id === value);
  const q = search.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;

  const pick = (id) => { onChange(id); setOpen(false); setSearch(""); };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left bg-white transition-colors ${
          open ? "border-brand-400 ring-2 ring-brand-500" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-popover overflow-hidden animate-scale-in origin-top">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-sm py-0.5 focus:outline-none placeholder:text-gray-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-3 text-center">
                {q ? `No results for "${search}"` : "No options"}
              </p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    o.id === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
