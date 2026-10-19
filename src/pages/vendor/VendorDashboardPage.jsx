import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../AuthContext";
import {
  LayoutGrid, Users, CalendarRange, LogOut, Loader2, Building2, Search, Trophy, Medal, Award, Download,
} from "lucide-react";
import { formatDate, formatDateLong } from "../../utils/dates";
import { getVendor, getVendorInterviewers } from "../../api/vendors";
import { getInterviewsForVendor } from "../../api/interviews";
import { getSlotsForInterviewers } from "../../api/availability";
import { getSkills } from "../../api/skills";
import { exportInterviewerStats } from "../../utils/interviewerStatsExport";
import DatePicker from "../../components/DatePicker";
import SkillsSelect from "../../components/SkillsSelect";

const NAV = [
  { id: "panelists",   label: "Panelists",       icon: Users },
  { id: "slots",       label: "Slot Overview",   icon: CalendarRange },
  { id: "stats",       label: "Interview Stats", icon: LayoutGrid },
  { id: "leaderboard", label: "Leaderboard",     icon: Trophy },
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
// This ISO week (Monday–Sunday) and this calendar month, both containing
// "today" — used by the Leaderboard's Weekly/Monthly toggle.
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}
function thisMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = d => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
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
  const [skills, setSkills] = useState([]);

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
  const [slotSearch,   setSlotSearch]   = useState("");
  const [statsSearch,  setStatsSearch]  = useState("");
  const [statsDurations, setStatsDurations] = useState([]);
  const [panelistSearch, setPanelistSearch] = useState("");
  // Weekly/Monthly toggle for the Leaderboard tab — its own period concept,
  // distinct from the Panelists/Stats date-range filter above.
  const [leaderboardPeriod, setLeaderboardPeriod] = useState("week");

  const vendorId = userProfile?.vendorContactFor;

  useEffect(() => {
    if (!vendorId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [v, ivrs, ivs, sk] = await Promise.all([
        getVendor(vendorId),
        getVendorInterviewers(vendorId),
        getInterviewsForVendor(vendorId),
        getSkills().catch(() => []),
      ]);
      setVendor(v);
      setInterviewers(ivrs);
      setInterviews(ivs);
      setSkills(sk);
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
  const byInterviewer = interviewers.map(ivr => ({
    interviewer: ivr,
    interviews: statsInterviews.filter(iv => iv.interviewerId === ivr.id),
  }));
  // Only skill IDs that actually resolve to a name from the skills
  // collection — an interviewer's skills array can carry a stale id
  // (skill since renamed/deleted elsewhere) that would otherwise render as
  // a raw, meaningless id string instead of just being left out.
  const skillNameById = new Map(skills.map(s => [s.id, s.name]));
  const resolvedSkillNames = (ivr) => (ivr.skills || []).map(id => skillNameById.get(id)).filter(Boolean);

  // Distinct durations actually scheduled in this vendor's own interviews —
  // same "derive, don't hardcode" pattern as the admin Interviewer
  // Statistics page, so a new duration shows up the moment it's used.
  const statsDurationOptions = [...new Set(statsInterviews.map(iv => iv.duration || 60))]
    .sort((a, b) => a - b)
    .map(d => ({ id: String(d), name: `${d} mins` }));
  const statsDurationFiltered = statsInterviews.filter(iv => !statsDurations.length || statsDurations.includes(String(iv.duration || 60)));

  // Detailed per-panelist breakdown, same shape/columns as the admin
  // Interviewer Statistics page (src/pages/admin/InterviewerStatsPage.jsx)
  // so exportInterviewerStats can be reused as-is. Simplified from that
  // page in one way: it doesn't credit a resumed interview's earlier
  // session(s) back to whichever interviewer originally ran them if the
  // interview has since been reassigned to someone else — a rare edge
  // case, left for a future pass if it turns out to matter here too.
  const COUNT_FIELDS = ["completed", "completedResumed", "partiallyCompleted", "cancelled", "noShow", "declined"];
  // "60m: 2, 90m: 4" always shows which duration(s) the count is made up of
  // — previously collapsed to a bare number ("1") whenever a panelist's
  // count for this column only spanned one duration, which left it
  // ambiguous whether that single interview was 60 or 90 minutes.
  const formatBreakdownCell = (count, byDuration) => {
    const entries = Object.entries(byDuration).filter(([, n]) => n > 0).sort(([a], [b]) => Number(a) - Number(b));
    if (entries.length === 0) return String(count);
    return entries.map(([mins, n]) => `${mins}m: ${n}`).join(", ");
  };
  const detailedStats = interviewers
    .filter(ivr => !statsSearch.trim() || (ivr.displayName || ivr.email || "").toLowerCase().includes(statsSearch.trim().toLowerCase()))
    .map(ivr => {
      const row = { email: ivr.email, name: ivr.displayName || ivr.email };
      COUNT_FIELDS.forEach(f => { row[f] = 0; row[`${f}ByDuration`] = {}; });
      const bump = (field, duration) => {
        row[field]++;
        const d = duration || 60;
        row[`${field}ByDuration`][d] = (row[`${field}ByDuration`][d] || 0) + 1;
      };
      statsDurationFiltered.filter(iv => iv.interviewerId === ivr.id).forEach(iv => {
        if (iv.status === "completed") {
          if (iv.resumedFromPartial) bump("completedResumed", iv.duration);
          else bump("completed", iv.duration);
        }
        else if (iv.status === "partially_completed") bump("partiallyCompleted", iv.duration);
        else if (iv.status === "cancelled") bump("cancelled", iv.duration);
        else if (iv.status === "no_show") bump("noShow", iv.duration);
        else if (iv.status === "declined") bump("declined", iv.duration);
      });
      COUNT_FIELDS.forEach(f => { row[`${f}Display`] = formatBreakdownCell(row[f], row[`${f}ByDuration`]); });
      return row;
    });
  const detailedTotals = (() => {
    const acc = { email: "", name: "" };
    COUNT_FIELDS.forEach(f => { acc[f] = 0; acc[`${f}ByDuration`] = {}; });
    detailedStats.forEach(r => {
      COUNT_FIELDS.forEach(f => {
        acc[f] += r[f];
        Object.entries(r[`${f}ByDuration`]).forEach(([d, n]) => { acc[`${f}ByDuration`][d] = (acc[`${f}ByDuration`][d] || 0) + n; });
      });
    });
    COUNT_FIELDS.forEach(f => { acc[`${f}Display`] = formatBreakdownCell(acc[f], acc[`${f}ByDuration`]); });
    return acc;
  })();

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="text" value={panelistSearch} onChange={e => setPanelistSearch(e.target.value)}
                          placeholder="Search panelist…"
                          className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 w-44 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                      </div>
                      <DateFilterBar from={statsDateFrom} to={statsDateTo} setFrom={setStatsDateFrom} setTo={setStatsDateTo} />
                    </div>
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
                            {["Name", "Email", "Phone", "Skills", "Interviews"].map(h => (
                              <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {byInterviewer
                            .filter(({ interviewer }) =>
                              !panelistSearch.trim() || (interviewer.displayName || interviewer.email || "").toLowerCase().includes(panelistSearch.trim().toLowerCase())
                            )
                            .map(({ interviewer, interviews: ivrInterviews }) => {
                            const skillNames = resolvedSkillNames(interviewer);
                            return (
                            <tr key={interviewer.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-4 py-3 font-semibold text-gray-900">{interviewer.displayName || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{interviewer.email}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{interviewer.phone || "—"}</td>
                              <td className="px-4 py-3">
                                {skillNames.length === 0 ? (
                                  <span className="text-xs text-gray-300">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 max-w-[320px]">
                                    {skillNames.map(name => (
                                      <span key={name} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{ivrInterviews.length}</td>
                            </tr>
                            );
                          })}
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
                    <button onClick={() => exportInterviewerStats(detailedStats, detailedTotals, `${vendor?.name || "vendor"}_interview_statistics`)}
                      disabled={detailedStats.length === 0}
                      className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>

                  <div className="flex items-end gap-3 flex-wrap bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
                    <div className="relative">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Panelist</label>
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-[34px] pointer-events-none" />
                      <input type="text" value={statsSearch} onChange={e => setStatsSearch(e.target.value)}
                        placeholder="Search panelist…"
                        className="border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-700 w-44 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Date Range</label>
                      <DateFilterBar from={statsDateFrom} to={statsDateTo} setFrom={setStatsDateFrom} setTo={setStatsDateTo} />
                    </div>
                    <div className="w-44">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
                      <SkillsSelect skills={statsDurationOptions} value={statsDurations} onChange={setStatsDurations}
                        placeholder="All Durations" searchPlaceholder="Search durations…" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Total",     value: statsDurationFiltered.length,                 style: "text-gray-900" },
                      { label: "Scheduled", value: statsDurationFiltered.filter(iv => iv.status === "scheduled").length, style: "text-blue-600" },
                      { label: "Completed", value: detailedTotals.completed + detailedTotals.completedResumed + detailedTotals.partiallyCompleted, style: "text-emerald-600" },
                      { label: "No Show",   value: detailedTotals.noShow,              style: "text-orange-600" },
                    ].map(s => (
                      <Card key={s.label} className="p-5">
                        <p className={`text-2xl font-bold ${s.style}`}>{s.value}</p>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</p>
                      </Card>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-6">By Panelist</p>
                  {detailedStats.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <LayoutGrid className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No panelists match the current filters.</p>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {["Panelist", "Completed", "Completed (Resumed)", "Partially Completed", "Cancelled", "Student No-show", "Declined"].map((h, i) => (
                                <th key={h} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {detailedStats.map(r => (
                              <tr key={r.email} className="hover:bg-gray-50/70 transition-colors">
                                <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                                <td className="px-4 py-3 text-right text-emerald-700 font-semibold whitespace-nowrap">{r.completedDisplay}</td>
                                <td className="px-4 py-3 text-right text-sky-700 font-semibold whitespace-nowrap" title="Finished off a Partially Completed interview — kept separate from a full interview">{r.completedResumedDisplay}</td>
                                <td className="px-4 py-3 text-right text-amber-700 font-semibold whitespace-nowrap">{r.partiallyCompletedDisplay}</td>
                                <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{r.cancelledDisplay}</td>
                                <td className="px-4 py-3 text-right text-orange-600 whitespace-nowrap">{r.noShowDisplay}</td>
                                <td className="px-4 py-3 text-right text-red-600 whitespace-nowrap">{r.declinedDisplay}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                              <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">Total</td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">{detailedTotals.completedDisplay}</td>
                              <td className="px-4 py-3 text-right font-bold text-sky-700 whitespace-nowrap">{detailedTotals.completedResumedDisplay}</td>
                              <td className="px-4 py-3 text-right font-bold text-amber-700 whitespace-nowrap">{detailedTotals.partiallyCompletedDisplay}</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-500 whitespace-nowrap">{detailedTotals.cancelledDisplay}</td>
                              <td className="px-4 py-3 text-right font-bold text-orange-600 whitespace-nowrap">{detailedTotals.noShowDisplay}</td>
                              <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">{detailedTotals.declinedDisplay}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {tab === "slots" && (() => {
                const filteredSlotInterviewers = interviewers.filter(ivr =>
                  !slotSearch.trim() || (ivr.displayName || ivr.email || "").toLowerCase().includes(slotSearch.trim().toLowerCase())
                );
                return (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 tracking-tight">Slot Overview</h1>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatDate(slotDateFrom)} to {formatDate(slotDateTo)}, across {filteredSlotInterviewers.length} panelist{filteredSlotInterviewers.length !== 1 ? "s" : ""}
                        {slotSearch.trim() ? ` matching "${slotSearch.trim()}"` : ""}.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="text" value={slotSearch} onChange={e => setSlotSearch(e.target.value)}
                          placeholder="Search panelist…"
                          className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 w-44 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                      </div>
                      <DateFilterBar from={slotDateFrom} to={slotDateTo} setFrom={setSlotDateFrom} setTo={setSlotDateTo} />
                    </div>
                  </div>
                  {filteredSlotInterviewers.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <CalendarRange className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">
                        {interviewers.length === 0 ? "No panelists assigned to this vendor yet." : "No panelist matches that search."}
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {filteredSlotInterviewers.map(ivr => {
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
                                    <p className="inline-block text-xs font-bold text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1 uppercase tracking-wide mb-2">{formatDateLong(g.date)}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {g.slots.map(s => (
                                        <span key={s.id}
                                          title={s.isBooked ? "Already booked" : "Open"}
                                          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${
                                            s.isBooked ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed" : "bg-white text-gray-700 border-gray-200"
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
                );
              })()}

              {tab === "leaderboard" && (() => {
                const range = leaderboardPeriod === "week" ? thisWeekRange() : thisMonthRange();
                const periodInterviews = interviews.filter(iv => iv.scheduledDate >= range.from && iv.scheduledDate <= range.to);
                // Ranked by COMPLETED interviews (actual work done) in the
                // period — total (scheduled+completed+everything else) shown
                // alongside as secondary context, not the ranking metric
                // itself, so a panelist with a lot of no-shows/cancellations
                // doesn't outrank one who actually completed more interviews.
                const ranked = interviewers
                  .map(ivr => {
                    const ivrInterviews = periodInterviews.filter(iv => iv.interviewerId === ivr.id);
                    const completed = ivrInterviews.filter(iv => ["completed", "partially_completed"].includes(iv.status)).length;
                    return { interviewer: ivr, completed, total: ivrInterviews.length };
                  })
                  .sort((a, b) => b.completed - a.completed || b.total - a.total);

                const RANK_STYLE = [
                  { icon: Trophy, badge: "bg-gradient-to-br from-amber-400 to-yellow-500 text-white", card: "border-amber-200 bg-amber-50/60" },
                  { icon: Medal,  badge: "bg-gradient-to-br from-gray-300 to-gray-400 text-white",    card: "border-gray-200 bg-gray-50/60" },
                  { icon: Award,  badge: "bg-gradient-to-br from-orange-400 to-amber-700 text-white", card: "border-orange-200 bg-orange-50/40" },
                ];

                return (
                // Constrained + centered rather than stretched to the full
                // page width — at full width the rank/name sat far on the
                // left and the count way out on the right with a huge empty
                // gap between them; a leaderboard reads better as a single
                // focused column than a stretched-out table-like row.
                <div className="max-w-2xl mx-auto space-y-5">
                  <div className="text-center">
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center justify-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-500" /> Leaderboard
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Ranked by completed interviews, {formatDate(range.from)} to {formatDate(range.to)}.
                    </p>
                    <div className="flex items-center justify-center gap-1 bg-gray-100 rounded-xl p-1 mt-4 w-fit mx-auto">
                      {[["week", "Weekly"], ["month", "Monthly"]].map(([id, label]) => (
                        <button key={id} onClick={() => setLeaderboardPeriod(id)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                            leaderboardPeriod === id ? "bg-white text-orange-700 shadow-soft" : "text-gray-500 hover:text-gray-700"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {ranked.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-14">
                      <Trophy className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-sm text-gray-400">No panelists assigned to this vendor yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-2.5">
                      {ranked.map((row, i) => {
                        const style = RANK_STYLE[i];
                        const RankIcon = style?.icon;
                        return (
                          <Card key={row.interviewer.id} className={`p-4 flex items-center gap-4 ${style?.card || ""}`}>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                              style ? style.badge : "bg-gray-100 text-gray-500"
                            }`}>
                              {RankIcon ? <RankIcon className="w-5 h-5" /> : i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{row.interviewer.displayName || row.interviewer.email}</p>
                              <p className="text-xs text-gray-400">{row.total} total interview{row.total !== 1 ? "s" : ""} this {leaderboardPeriod}</p>
                            </div>
                            <div className="text-center flex-shrink-0 w-16">
                              <p className="text-xl font-bold text-emerald-600">{row.completed}</p>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Completed</p>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
