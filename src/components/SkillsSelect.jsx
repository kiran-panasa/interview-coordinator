import { useState, useRef, useEffect } from "react";

export default function SkillsSelect({ skills = [], value = [], onChange, placeholder = "Select skills…", readOnly = false }) {
  const [open, setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id) => {
    if (readOnly) return;
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const filtered  = skills.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  const selected  = skills.filter(s => value.includes(s.id));

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0
          ? <span className="text-xs text-gray-400">—</span>
          : selected.map(s => (
            <span key={s.id} className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{s.name}</span>
          ))
        }
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(o => !o)}
        className="min-h-[38px] w-full border border-gray-300 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 cursor-pointer bg-white hover:border-gray-400 transition-colors"
      >
        {selected.length === 0 && (
          <span className="text-sm text-gray-400 self-center">{placeholder}</span>
        )}
        {selected.map(s => (
          <span key={s.id} className="flex items-center gap-1 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
            {s.name}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(s.id); }}
              className="text-indigo-400 hover:text-indigo-700 leading-none font-bold">×</button>
          </span>
        ))}
        <span className="ml-auto self-center text-gray-400 text-xs flex-shrink-0">▾</span>
      </div>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full text-sm px-2 py-1 focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-3 text-center">No skills match</p>
            ) : filtered.map(s => (
              <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)}
                  className="accent-indigo-600 flex-shrink-0" />
                <span className="text-sm text-gray-700">{s.name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button type="button" onClick={() => onChange([])}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
