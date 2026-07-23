import { motion } from "framer-motion";
import { CalendarOff, Plus, Pencil, Trash2 } from "lucide-react";
import Button from "../../components/Button";
import { formatDate } from "../../utils/dates";

export default function BlockedDatesTab({ blockedDates, onAdd, onEdit, onDelete }) {
  const sorted = [...blockedDates].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-gray-400" />
            Blocked Dates
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Interviewers can't add slots and candidates can't book on these dates — e.g. holidays or internal events.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={onAdd}>
          Block Dates
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        {sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-14 text-sm">No blocked dates yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Dates", "Reason", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {b.startDate === b.endDate ? formatDate(b.startDate) : `${formatDate(b.startDate)} – ${formatDate(b.endDate)}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.reason || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 w-20">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => onEdit(b)} title="Edit" className="text-gray-400 hover:text-brand-600 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(b)} title="Unblock" className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}
