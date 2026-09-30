import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, Plus, Search } from "lucide-react";

export default function SkillsSelect({
  skills = [],
  value = [],
  onChange,
  customSkills = [],
  onAddCustom = null,
  onRemoveCustom = null,
  placeholder = "Select skills…",
  searchPlaceholder = "Search skills…",
  readOnly = false,
  // Optional — when any option carries a `group` (e.g. a vendor name), the
  // list renders sectioned under that group's name instead of flat, with a
  // header that selects/clears the whole group in one click while every
  // option keeps its own individual checkbox. Options with no `group` are
  // bucketed under `ungroupedLabel`. No-op (renders exactly as before) when
  // nothing sets `group`.
  ungroupedLabel = "Other",
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  // The dropdown renders through a portal into document.body (see below) so
  // it's positioned in fixed viewport coordinates instead of relative to
  // this trigger — otherwise, opened inside a Modal (whose body scrolls with
  // overflow-y-auto), the dropdown got silently clipped at the modal's
  // bottom edge instead of floating over it.
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef   = useRef(null);

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedPanelHeight = 320; // search bar + max-h-52 list + footer, generous
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedPanelHeight && rect.top > spaceBelow;
    setPos(openUp
      ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6, openUp: true }
      : { left: rect.left, width: rect.width, top: rect.bottom + 6, openUp: false }
    );
  }, []);

  // Recompute on open, and keep following the trigger while scrolling
  // (capture:true catches scroll on any ancestor, not just window — needed
  // since the usual case is the Modal's own scrollable body) or resizing.
  useEffect(() => {
    if (!open) return;
    computePos();
    window.addEventListener("scroll", computePos, true);
    window.addEventListener("resize", computePos);
    return () => {
      window.removeEventListener("scroll", computePos, true);
      window.removeEventListener("resize", computePos);
    };
  }, [open, computePos]);

  useEffect(() => {
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id) => {
    if (readOnly) return;
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const filtered = skills.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  const selected = skills.filter(s => value.includes(s.id));

  const hasGroups = skills.some(s => s.group);
  // Preserves first-seen order of groups rather than alphabetizing, so a
  // caller-supplied vendor order (or "Other" always last) stays intact.
  const groupedFiltered = hasGroups
    ? (() => {
        const order = [];
        const buckets = new Map();
        for (const s of filtered) {
          const g = s.group || ungroupedLabel;
          if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
          buckets.get(g).push(s);
        }
        return order.map(g => ({ group: g, items: buckets.get(g) }));
      })()
    : null;
  const toggleGroup = (items) => {
    if (readOnly) return;
    const ids = items.map(s => s.id);
    const allSelected = ids.every(id => value.includes(id));
    onChange(allSelected ? value.filter(v => !ids.includes(v)) : [...new Set([...value, ...ids])]);
  };

  const searchTrimmed = search.trim();
  const alreadyInAdmin  = skills.some(s => s.name.toLowerCase() === searchTrimmed.toLowerCase());
  const alreadyCustom   = customSkills.some(s => s.toLowerCase() === searchTrimmed.toLowerCase());
  const canAddCustom    = onAddCustom && searchTrimmed && !alreadyInAdmin && !alreadyCustom;

  const handleAddCustom = () => {
    if (!canAddCustom) return;
    onAddCustom(searchTrimmed);
    setSearch("");
  };

  const clearAll = () => {
    onChange([]);
    if (onRemoveCustom) customSkills.forEach(n => onRemoveCustom(n));
  };

  const totalSelected = selected.length + customSkills.length;

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {totalSelected === 0 ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <>
            {selected.map(s => (
              <span key={s.id} className="text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">{s.name}</span>
            ))}
            {customSkills.map(name => (
              <span key={name} className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">{name}</span>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={triggerRef} className="relative">
      {/* Chip trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        className={`min-h-[38px] w-full border rounded-xl px-3 py-2 flex flex-wrap gap-1.5 cursor-pointer bg-white transition-colors ${
          open ? "border-brand-400 shadow-soft" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {totalSelected === 0 && (
          <span className="text-sm text-gray-400 self-center">{placeholder}</span>
        )}
        {selected.map(s => (
          <span key={s.id} className="flex items-center gap-1 text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">
            {s.name}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(s.id); }}
              className="text-brand-400 hover:text-brand-700 leading-none">
              <X className="w-3 h-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        {customSkills.map(name => (
          <span key={name} className="flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
            {name}
            {onRemoveCustom && (
              <button type="button" onClick={e => { e.stopPropagation(); onRemoveCustom(name); }}
                className="text-amber-400 hover:text-amber-700 leading-none">
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </span>
        ))}
        <span className="ml-auto self-center text-gray-400 flex-shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        </span>
      </div>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", left: pos.left, width: pos.width, ...(pos.openUp ? { bottom: pos.bottom } : { top: pos.top }) }}
          className={`z-[100] bg-white border border-gray-100 rounded-xl shadow-popover overflow-hidden animate-scale-in ${pos.openUp ? "origin-bottom" : "origin-top"}`}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canAddCustom) handleAddCustom(); }}
              placeholder={onAddCustom ? "Search or type to add a custom skill…" : searchPlaceholder}
              className="w-full text-sm py-0.5 focus:outline-none placeholder:text-gray-400"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !canAddCustom ? (
              <p className="text-xs text-gray-400 px-3 py-3 text-center">
                {searchTrimmed ? `No skills match "${searchTrimmed}"` : "No skills defined"}
              </p>
            ) : (
              <>
                {groupedFiltered ? groupedFiltered.map(({ group, items }) => (
                  <div key={group}>
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1 bg-gray-50/60 sticky top-0">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{group}</span>
                      <button type="button" onClick={() => toggleGroup(items)}
                        className="text-[11px] font-medium text-brand-600 hover:underline">
                        {items.every(s => value.includes(s.id)) ? "Clear" : "Select all"}
                      </button>
                    </div>
                    {items.map(s => (
                      <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                        <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)}
                          className="accent-brand-600 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{s.name}</span>
                      </label>
                    ))}
                  </div>
                )) : filtered.map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)}
                      className="accent-brand-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{s.name}</span>
                  </label>
                ))}

                {/* Add custom skill row */}
                {canAddCustom && (
                  <button
                    type="button"
                    onClick={handleAddCustom}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-amber-50 text-sm text-amber-700 font-semibold border-t border-gray-100 transition-colors text-left">
                    <Plus className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                    Add "{searchTrimmed}" as custom skill
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {totalSelected > 0 && (
            <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">{totalSelected} selected</span>
              <button type="button" onClick={clearAll}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear all</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
