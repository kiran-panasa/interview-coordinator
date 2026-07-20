import { useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Info } from "lucide-react";

const STYLES = {
  success: { bg: "bg-emerald-600", Icon: CheckCircle2 },
  error:   { bg: "bg-red-600",     Icon: XCircle },
  info:    { bg: "bg-amber-500",   Icon: Info },
};

export default function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  const { bg, Icon } = STYLES[type] || STYLES.success;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={`fixed bottom-6 right-6 z-50 ${bg} text-white pl-4 pr-5 py-3 rounded-xl shadow-popover text-sm font-medium flex items-center gap-2.5 max-w-sm`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
      {message}
    </motion.div>
  );
}
