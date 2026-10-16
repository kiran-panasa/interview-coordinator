import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../AuthContext";
import {
  LayoutGrid, Users, CalendarRange, LogOut, Loader2, Building2,
} from "lucide-react";
import { formatDate, formatDateLong } from "../../utils/dates";
import { getVendor, getVendorInterviewers } from "../../api/vendors";
import { getInterviewsForVendor } from "../../api/interviews";
import { getSlotsForInterviewers } from "../../api/availability";
import DatePicker from "../../components/DatePicker";

const NAV = [
  { id: "panelists", label: "Panelists",       icon: Users },
  { id: "stats",     label: "Interview Stats", icon: LayoutGrid },
  { id: "slots",     label: "Slot Overview",   icon: CalendarRange },
];

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function inDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
// The full previous calendar month, recomputed from "now" every time this
// runs (not a fixed date) — so the default window itself rolls forward
// automatically each month (Sep 1–30 in October, Oct 1–31 in November, …)
// rather than ever needing a manual update.
function previousMonthRange() {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfPrevMonth  = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(firstOfPrevMonth), to: iso(lastOfPrevMonth) };
}

// Self-contained like StudentDashboardPage.jsx — its own inline sidebar
// instead of a separate layout component, since this is currently 3 small
// scoped views. Every read here is scoped to the viewer's own vendor (via
// vendorId on interviews/vendorId on interviewer users) — enforced by
// firestore.rules server-side too, not just by what this page happens to
// query, so there's no path by which another vendor's data could leak in
// even via direct Firestore access.
export default function VendorDashboardPage() {
  const { currentUser, userProfile } = useAuth();
  const [tab, setTab] = useState("panelists");
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState(null);
  const [interviewers, setInterviewers] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [slotsByInterviewer, setSlotsByInterviewer] = useState({});

  // Shared by Panelists (interview counts) and Interview Stats — both are
  // "how much activity happened" views over the same historical window.
  const defaultRange = previousMonthRange();
  const [statsDateFrom, setStatsDateFrom] = useState(defaultRange.from);
  const [statsDateTo,   setStatsDateTo]   = useState(defaultRange.to);
  // Separate, future-facing window for Slot Overview (open/booked
  // availability) — defaults to the next week, same as the self-book flow
  // elsewhere in the app, rather than the backward-looking stats default.
  const [slotDateFrom, setSlotDateFrom] = useState(todayIso());
  const [slotDateTo,   setSlotDateTo]   = useState(inDays(7));

  const vendorId = userProfile?.vendorContactFor;

  useEffect(() => {
    if (!vendorId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [v, ivrs, ivs] = await Promise.all([
        getVendor(vendorId),
        getVendorInterviewers(vendorId),
        getInterviewsForVendor(vendorId),
      ]);
      setVendor(v);
      setInterviewers(ivrs);
      setInterviews(ivs);
      const slots = await getSlotsForInterviewers(ivrs.map(i => i.id)).catch(() => ({}));
      setSlotsByInterviewer(slots);
      setLoading(false);
    })();
  }, [vendorId]);

  const initials = (userProfile?.displayName || userProfile?.email || "?").trim().charAt(0).toUpperCase();

  if (!vendorId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <Building2 className="w-8 h-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            You're not currently set as a vendor contact for any vendor — ask an admin to assign this
            under Settings → User Management.
          </p>
        </Card>
      </div>
    );
  }

  const statsInterviews = interviews.filter(iv => iv.scheduledDate >= statsDateFrom && iv.scheduledDate <= statsDateTo);
  const statusCounts = statsInterviews.reduce((acc, iv) => {
    acc[iv.status] = (acc[iv.status] || 0) + 1;
    return acc;
  }, {});
  const byInterviewer = interviewers.map(ivr => ({
    interviewer: ivr,
    interviews: statsInterviews.filter(iv => iv.interviewerId === ivr.id),
  }));

  const DateFilterBar = ({ from, to, setFrom, setTo }) => (
    <div className="flex items-center gap-2">
      <DatePicker value={from} onChange={e => setFrom(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
      <span className="text-gray-400 text-sm">–</span>
      <DatePicker value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-100 flex flex-col fixed inset-y-0">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 tracking-tight leading-tight">{vendor?.name || "Vendor"}</p>
            <p className="text-xs text-orange-600 font-semibold leading-tight">Vendor Dashboard</p>
          </div>
        </div>
        <div className="px-3 space-y-1 flex-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                  isActive ? "bg-orange-50 text-orange-700 font-semibold" : "text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900"
                }`}>
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-3 pb-5 pt-3 border-t border-gray-100 mt-3">
          <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{userProfile?.displayName || userProfile?.email}</p>
              <p className="text-[11px] text-gray-400 truncate">{currentUser?.email}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)}
            className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 ml-60">
        <div className="px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          ) : (
            <>
              {tab === "panelists" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 tracking-tight">Panelists</h1>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {interviewers.length} panelist{interviewers.length !== 1 ? "s" : ""} under {vendor?.name}
                        {" "}<span className="text-gray-400">— interviews {formatDate(statsDateFrom)} to {formatDate(statsDateTo)}</span>
                      </p>
                    </div>
                    <DateFilterBar from={statsDateFrom} to={statsDateTo} setFrom={setStatsDateFrom} setTo={setStatsDateTo} />
                  </div>
                  {interviewers.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <Users className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No panelists assigned to this vendor yet.</p>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {["Name", "Email", "Phone", "Status", "Interviews"].map(h => (
                              <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {byInterviewer.map(({ interviewer, interviews: ivrInterviews }) => (
                            <tr key={interviewer.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-900">{interviewer.displayName || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{interviewer.email}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{interviewer.phoneNumber || "—"}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${
                                  interviewer.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"
                                }`}>
                                  {interviewer.status === "active" ? "Active" : interviewer.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600">{ivrInterviews.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              )}

              {tab === "stats" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Interview Statistics</h1>
                    <DateFilterBar from={statsDateFrom} to={statsDateTo} setFrom={setStatsDateFrom} setTo={setStatsDateTo} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Total",     value: statsInterviews.length,                 style: "text-gray-900" },
                      { label: "Scheduled", value: statusCounts.scheduled || 0,            style: "text-blue-600" },
                      { label: "Completed", value: (statusCounts.completed || 0) + (statusCounts.partially_completed || 0), style: "text-emerald-600" },
                      { label: "No Show",   value: statusCounts.no_show || 0,              style: "text-orange-600" },
                    ].map(s => (
                      <Card key={s.label} className="p-5">
                        <p className={`text-2xl font-bold ${s.style}`}>{s.value}</p>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</p>
                      </Card>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-6">By Panelist</p>
                  <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {["Panelist", "Scheduled", "Completed", "Cancelled", "No-show", "Total"].map(h => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byInterviewer.map(({ interviewer, interviews: ivrInterviews }) => {
                          const c = ivrInterviews.reduce((acc, iv) => { acc[iv.status] = (acc[iv.status] || 0) + 1; return acc; }, {});
                          return (
                            <tr key={interviewer.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-900">{interviewer.displayName || interviewer.email}</td>
                              <td className="px-4 py-3 text-gray-600">{c.scheduled || 0}</td>
                              <td className="px-4 py-3 text-gray-600">{(c.completed || 0) + (c.partially_completed || 0)}</td>
                              <td className="px-4 py-3 text-gray-600">{c.cancelled || 0}</td>
                              <td className="px-4 py-3 text-gray-600">{c.no_show || 0}</td>
                              <td className="px-4 py-3 font-semibold text-gray-900">{ivrInterviews.length}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}

              {tab === "slots" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 tracking-tight">Slot Overview</h1>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatDate(slotDateFrom)} to {formatDate(slotDateTo)}, across {interviewers.length} panelist{interviewers.length !== 1 ? "s" : ""}.
                      </p>
                    </div>
                    <DateFilterBar from={slotDateFrom} to={slotDateTo} setFrom={setSlotDateFrom} setTo={setSlotDateTo} />
                  </div>
                  {interviewers.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No panelists assigned to this vendor yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {interviewers.map(ivr => {
                        const slots = (slotsByInterviewer[ivr.id] || [])
                          .filter(s => s.date >= slotDateFrom && s.date <= slotDateTo)
                          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
                        const open   = slots.filter(s => !s.isBooked).length;
                        const booked = slots.filter(s => s.isBooked).length;
                        // Grouped date-by-date so a panelist's slots read as
                        // distinct days instead of one long mixed-date strip.
                        const byDate = [];
                        slots.forEach(s => {
                          const group = byDate.find(g => g.date === s.date);
                          if (group) group.slots.push(s);
                          else byDate.push({ date: s.date, slots: [s] });
                        });
                        return (
                          <Card key={ivr.id} className="p-5">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="font-bold text-gray-900">{ivr.displayName || ivr.email}</p>
                              <div className="flex gap-2 flex-shrink-0">
                                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{open} open</span>
                                <span className="text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">{booked} booked</span>
                              </div>
                            </div>
                            {byDate.length === 0 ? (
                              <p className="text-xs text-gray-400">No availability submitted in this window.</p>
                            ) : (
                              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                                {byDate.map(g => (
                                  <div key={g.date}>
                                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">{formatDateLong(g.date)}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {g.slots.map(s => (
                                        <span key={s.id}
                                          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${
                                            s.isBooked ? "bg-gray-50 text-gray-300 border-gray-100" : "bg-white text-gray-700 border-gray-200"
                                          }`}>
                                          {s.time}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
