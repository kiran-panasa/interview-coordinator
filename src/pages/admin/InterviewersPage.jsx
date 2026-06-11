import { useState, useEffect } from "react";
import { getInterviewerAvailability, subscribeToUsers } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

export default function InterviewersPage() {
  const [interviewers, setInterviewers] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [viewAvail,    setViewAvail]    = useState(null);
  const [toast,        setToast]        = useState(null);

  useEffect(() => {
    const unsub = subscribeToUsers(users => {
      setInterviewers(users.filter(u => u.role === "interviewer" && u.status === "active"));
      setLoading(false);
    });
    return unsub;
  }, []);

  const viewAvailability = async (u) => {
    const slots = await getInterviewerAvailability(u.id);
    setViewAvail({ user: u, slots });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Interviewers</h1>
        <p className="text-sm text-gray-500 mt-0.5">{interviewers.length} active interviewers</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : interviewers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-sm text-gray-400">No interviewers yet.</p>
            <p className="text-xs text-gray-300">Invite and approve interviewers from the Admin Panel.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Name", "Email", "Phone", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {interviewers.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{u.displayName || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => viewAvailability(u)}
                      className="text-xs text-indigo-600 font-medium hover:underline">
                      View Availability
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Availability modal */}
      <Modal open={!!viewAvail} onClose={() => setViewAvail(null)}
        title={viewAvail ? `${viewAvail.user.displayName || viewAvail.user.email} — Availability` : ""} wide>
        {viewAvail && (() => {
          const upcoming = viewAvail.slots
            .filter(s => s.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
          const byDate = {};
          upcoming.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
          return Object.keys(byDate).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No upcoming availability set.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(byDate).map(([date, daySlots]) => {
                const [y, m, d] = date.split("-");
                return (
                  <div key={date}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{`${d}/${m}/${y}`}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map(s => (
                        <span key={s.id}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${s.isBooked ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {s.time} {s.isBooked ? "· Booked" : "· Free"}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
