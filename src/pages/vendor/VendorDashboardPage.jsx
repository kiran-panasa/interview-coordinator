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

const NAV = [
  { id: "panelists", label: "Panelists",       icon: Users },
  { id: "stats",     label: "Interview Stats", icon: LayoutGrid },
  { id: "slots",     label: "Slot Overview",   icon: CalendarRange },
];

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>;
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

  const today = new Date().toISOString().slice(0, 10);
  const statusCounts = interviews.reduce((acc, iv) => {
    acc[iv.status] = (acc[iv.status] || 0) + 1;
    return acc;
  }, {});
  const upcoming = interviews.filter(iv => iv.scheduledDate >= today && !["cancelled", "declined"].includes(iv.status));
  const byInterviewer = interviewers.map(ivr => ({
    interviewer: ivr,
    interviews: interviews.filter(iv => iv.interviewerId === ivr.id),
  }));

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
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Panelists</h1>
                  <p className="text-sm text-gray-500 -mt-3">{interviewers.length} panelist{interviewers.length !== 1 ? "s" : ""} under {vendor?.name}.</p>
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
                            {["Name", "Email", "Status", "Interviews"].map(h => (
                              <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {byInterviewer.map(({ interviewer, interviews: ivrInterviews }) => (
                            <tr key={interviewer.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-900">{interviewer.displayName || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{interviewer.email}</td>
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
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Interview Statistics</h1>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Total",     value: interviews.length,                     style: "text-gray-900" },
                      { label: "Scheduled", value: statusCounts.scheduled || 0,            style: "text-blue-600" },
                      { label: "Completed", value: (statusCounts.completed || 0) + (statusCounts.partially_completed || 0), style: "text-emerald-600" },
                      { label: "Cancelled", value: (statusCounts.cancelled || 0) + (statusCounts.no_show || 0), style: "text-gray-400" },
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
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Slot Overview</h1>
                  <p className="text-sm text-gray-500 -mt-3">
                    {upcoming.length} upcoming interview{upcoming.length !== 1 ? "s" : ""} across {interviewers.length} panelist{interviewers.length !== 1 ? "s" : ""}.
                  </p>
                  {interviewers.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No panelists assigned to this vendor yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {interviewers.map(ivr => {
                        const slots = (slotsByInterviewer[ivr.id] || [])
                          .filter(s => s.date >= today)
                          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
                        const open   = slots.filter(s => !s.isBooked).length;
                        const booked = slots.filter(s => s.isBooked).length;
                        return (
                          <Card key={ivr.id} className="p-5">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="font-bold text-gray-900">{ivr.displayName || ivr.email}</p>
                              <div className="flex gap-2 flex-shrink-0">
                                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{open} open</span>
                                <span className="text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">{booked} booked</span>
                              </div>
                            </div>
                            {slots.length === 0 ? (
                              <p className="text-xs text-gray-400">No upcoming availability submitted.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {slots.slice(0, 60).map(s => (
                                  <span key={s.id}
                                    title={formatDateLong(s.date)}
                                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${
                                      s.isBooked ? "bg-gray-50 text-gray-300 border-gray-100" : "bg-white text-gray-700 border-gray-200"
                                    }`}>
                                    {formatDate(s.date)} · {s.time}
                                  </span>
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
