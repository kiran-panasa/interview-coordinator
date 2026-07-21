import { motion } from "framer-motion";
import { CalendarCheck2 } from "lucide-react";
import ErrorBoundary from "./ErrorBoundary";

export default function StudentLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex items-center gap-2.5 mb-8 justify-center"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-brand-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
            <CalendarCheck2 className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">Interview</p>
            <p className="text-xs text-brand-600 font-semibold leading-tight">Coordinator</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </motion.div>
      </div>
    </div>
  );
}
