import { motion } from "framer-motion";

export default function StatCard({ label, value, color, icon: Icon, iconBg = "bg-gray-100" }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-card p-5 transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1.5 tracking-tight ${color}`}>{value}</p>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <Icon className={`w-5 h-5 ${color}`} strokeWidth={2} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
