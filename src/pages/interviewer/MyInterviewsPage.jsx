import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { subscribeToInterviewerInterviews } from "../../api/firestore";
import Badge from "../../components/Badge";

const TABS = ["Upcoming", "Past", "All"];

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function MyInterviewsPage() {
  const { userProfile } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [tab, setTab] = useState("Upcoming");
  const [filterStatus, setFilterStatus] = useState("All");

  useEffect(() => {
    if (!userProfile?.email) return;
    const unsub = subscribeToInterviewerInterviews(userProfile.email, setInterviews);
    return unsub;
  }, [userProfile?.email]);

  const today = new Date().toISOString().slice(0, 10);

  let filtered = interviews;
  if (tab === "Upcoming") {
    filtered = interviews.filter(i =>
      i.scheduledDate >= today && i.status !== "cancelled" && i.status !== "declined"
    );
  } else if (tab === "Past") {
    filtered = interviews.filter(i =>
      i.scheduledDate < today ||
      i.status === "completed" || i.status === "cancelled" ||
      i.status === "declined" || i.status === "no_show"
    );
  }
  if (filterStatus !== "All") filtered = filtered.filter(i => i.status === filterStatus);

  const uniqueStatuses = [...new Set(interviews.map(i => i.status))].filter(Boolean).sort();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Interviews</h1>
      <p className="text-sm text-gray-500 mb-6">{interviews.length} total</p>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setFilterStatus("All"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="All">All Statuses</option>
          {uniqueStatuses.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Candidate", "Role", "Round", "Date", "Time", "Status", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-12">No interviews found</td></tr>
            ) : filtered.map(i => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-900">{i.candidateName}</td>
                <td className="px-4 py-3 text-gray-600">{i.roleAppliedFor || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{i.round || "—"}</td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(i.scheduledDate)}</td>
                <td className="px-4 py-3 text-gray-600">{i.scheduledTime || "—"}</td>
                <td className="px-4 py-3"><Badge value={i.status} /></td>
                <td className="px-4 py-3">
                  <Link to={`/interviewer/interviews/${i.id}`}
                    className="text-xs text-indigo-600 font-medium hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
