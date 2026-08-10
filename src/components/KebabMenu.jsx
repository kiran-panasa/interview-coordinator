import { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical } from "lucide-react";
import CopyButton from "./CopyButton";

function KebabMenu({ actions }) {
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
        <MoreVertical className="w-4 h-4" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, scale: 0.96, y: pos.flipUp ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
              className="bg-white border border-gray-100 rounded-xl shadow-popover py-1.5 min-w-[170px]"
            >
              {visible.map((a, i) => (
                <div key={i} className="flex items-center w-full">
                  <button
                    disabled={a.disabled}
                    onClick={() => { if (!a.disabled) { setOpen(false); a.onClick(); } }}
                    className={`flex-1 min-w-0 text-left px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      a.danger
                        ? "text-red-500 hover:bg-red-50 disabled:hover:bg-transparent"
                        : a.highlight
                          ? "text-emerald-700 hover:bg-emerald-50 disabled:hover:bg-transparent"
                          : "text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent"
                    }`}
                  >
                    {a.label}
                  </button>
                  {a.copyValue && <CopyButton value={a.copyValue} className="mr-2" />}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default memo(KebabMenu);
