import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

function timeAgo(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

const fadeProps = {
  initial: { opacity: 0, y: 2 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
  transition: { duration: 0.15 },
};

export default function AutosaveIndicator({ status, lastSavedAt }) {
  const [, forceTick] = useState(0);

  // Re-render periodically so the "Xs/Xm ago" text stays fresh.
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => forceTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  let content = null;

  if (status === "saving" || status === "pending") {
    content = (
      <motion.span key="saving" {...fadeProps} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving draft…
      </motion.span>
    );
  } else if (status === "error") {
    content = (
      <motion.span key="error" {...fadeProps} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
        <AlertTriangle className="w-3.5 h-3.5" />
        Draft save failed — will retry
      </motion.span>
    );
  } else if (status === "saved" && lastSavedAt) {
    content = (
      <motion.span key="saved" {...fadeProps} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Draft saved · {timeAgo(lastSavedAt)}
      </motion.span>
    );
  }

  return <AnimatePresence mode="wait">{content}</AnimatePresence>;
}
