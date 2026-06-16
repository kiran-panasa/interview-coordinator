import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import {
  subscribeToInterviews, getTemplates, getAllUsers, getCandidates,
  subscribeToSkills, subscribeToUserNotifications,
  createNotification, updateNotification,
  subscribeToScheduleInvites, createScheduleInvite, updateScheduleInvite,
  markSlotFree, createInterview, getTemplate,
  getPrograms,
} from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

async function callAppsScript(payload) {
  if (!APPS_SCRIPT_URL) return;
  await fetch(APPS_SCRIPT_URL, {
    method: "POST", redirect: "follow",
    body: JSON.stringify({ ...payload, secret: APPS_SCRIPT_SECRET }),
  });
}

function today() { return new Date().toISOString().slice(0, 10); }
function inDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function skillOverlap(templateSkills = [], userSkills = []) {
  const ts = new Set(templateSkills);
  return userSkills.filter(s => ts.has(s));
}

const STATUS_BADGE = {
  sent:                 "bg-blue-50 text-blue-700 border-blue-200",
  otp_verified:         "bg-amber-50 text-amber-700 border-amber-200",
  pending_confirmation: "bg-violet-50 text-violet-700 border-violet-200",
  confirmed:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:            "bg-gray-100 text-gray-400 border-gray-200",
  slot_selected:        "bg-amber-50 text-amber-700 border-amber-200",
};
const STATUS_LABEL = {
  sent: "Invite Sent", otp_verified: "Verified", slot_selected: "Slot Selected",
  pending_confirmation: "Pending Confirmation", confirmed: "Confirmed", cancelled: "Cancelled",
};

// ─────────────────────────────────────────────────────────────────────────────

export default function NudgePage() {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("interviewers");

  // ── Shared data ──
  const [interviews, setInterviews] = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [users,      setUsers]      = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [programs,   setPrograms]   = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [responses,  setResponses]  = useState([]);
  const [invites,    setInvites]    = useState([]);
  const [toast,      setToast]      = useState(null);

  // ── Interviewers tab state ──
  const [selectedDate,  setSelectedDate]  = useState(today());
  const [nudgeTarget,   setNudgeTarget]   = useState(null);
  const [selectedIvrs,  setSelectedIvrs]  = useState(new Set());
  const [message,       setMessage]       = useState("");
  const [sending,       setSending]       = useState(false);

  // ── Candidates tab state ──
  const [dateStart,      setDateStart]      = useState(today());
  const [dateEnd,        setDateEnd]        = useState(inDays(7));
  const [expiryHours,    setExpiryHours]    = useState(24);
  const [filterProgram,  setFilterProgram]  = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [selCandidates,  setSelCandidates]  = useState(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);
  const [confirmingId,   setConfirmingId]   = useState(null);

  useEffect(() => {
    const u1 = subscribeToInterviews(setInterviews);
    const u2 = subscribeToSkills(setSkills);
    const u3 = subscribeToUserNotifications(currentUser.uid, setResponses);
    const u4 = subscribeToScheduleInvites(setInvites);
    getTemplates().then(setTemplates);
    getAllUsers().then(setUsers);
    getCandidates().then(setCandidates);
    getPrograms().then(setPrograms);
    return () => { u1(); u2(); u3(); u4(); };
  }, [currentUser.uid]);

  // ────────────────────────────────────────────────────────────────────────────
  // INTERVIEWERS TAB
  // ────────────────────────────────────────────────────────────────────────────

  const forDate = interviews.filter(i =>
    i.scheduledDate === selectedDate && i.status !== "cancelled" && i.status !== "declined"
  );
  const byTemplate = Object.values(
    forDate.reduce((acc, iv) => {
      const tid = iv.templateId || "__none__";
      if (!acc[tid]) acc[tid] = { template: templates.find(t => t.id === iv.templateId) || null, interviews: [] };
      acc[tid].interviews.push(iv);
      return acc;
    }, {})
  ).sort((a, b) => (a.template?.name || "").localeCompare(b.template?.name || ""));

  const activeInterviewers = users.filter(
    u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
  );
  const matchedFor = (template) => {
    const req = template?.skills || [];
    if (!req.length) return activeInterviewers;
    return activeInterviewers.filter(u => skillOverlap(req, u.skills || []).length > 0);
  };
  const openNudge = (template, ivs) => {
    const matched = matchedFor(template);
    const portal  = `${window.location.origin}/interviewer/notifications`;
    const msg =
      `Hi {{name}},\n\nWe have ${ivs.length} interview(s) on ${fmtDate(selectedDate)}` +
      (template ? ` using the "${template.name}" template` : "") +
      `.\nWe'd like to check if you're available to take one.\n\nPlease respond here:\n${portal}\n\nThank you,\n${userProfile?.displayName || "Admin"} · NxtWave`;
    setNudgeTarget({ template, interviews: ivs, matched });
    setSelectedIvrs(new Set(matched.map(u => u.id)));
    setMessage(msg);
  };
  const sendNudge = async () => {
    if (!nudgeTarget || selectedIvrs.size === 0) return;
    setSending(true);
    try {
      const recipients = users.filter(u => selectedIvrs.has(u.id));
      for (const r of recipients) {
        await createNotification({
          type: "nudge", recipientId: r.id, recipientEmail: r.email,
          senderId: currentUser.uid, senderName: userProfile?.displayName || userProfile?.email,
          templateId: nudgeTarget.template?.id || "", templateName: nudgeTarget.template?.name || "General",
          date: selectedDate, message: message.replace(/\{\{name\}\}/g, r.displayName || r.email),
          status: "unread",
        });
      }
      if (APPS_SCRIPT_URL) {
        await callAppsScript({
          action: "sendEmail",
          subject: `Interview Availability Request${nudgeTarget.template ? ` — ${nudgeTarget.template.name}` : ""} · ${fmtDate(selectedDate)}`,
          body: message,
          recipients: recipients.map(r => ({ email: r.email, name: r.displayName || r.email })),
        });
      }
      setToast({ message: `Nudge sent to ${recipients.length} interviewer(s).` });
      setNudgeTarget(null);
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setSending(false);
  };
  const markResponseRead = async (n) => updateNotification(n.id, { status: "read" });
  const incomingResponses = responses.filter(n => n.type === "response");
  const unreadResponses   = incomingResponses.filter(n => n.status === "unread").length;
  const skillName = (id) => skills.find(s => s.id === id)?.name || id;
  const toggleIvr = (id) => setSelectedIvrs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CANDIDATES TAB
  // ────────────────────────────────────────────────────────────────────────────

  const filteredCandidates = candidates.filter(c => {
    if (filterProgram  && c.program !== filterProgram) return false;
    if (filterTemplate && !(c.templateIds || []).includes(filterTemplate)) return false;
    return true;
  });

  const toggleCand = (id) => setSelCandidates(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAllCands = () => {
    if (selCandidates.size === filteredCandidates.length) setSelCandidates(new Set());
    else setSelCandidates(new Set(filteredCandidates.map(c => c.id)));
  };

  const handleSendInvites = async () => {
    if (selCandidates.size === 0) return;
    if (!filterTemplate) {
      setToast({ message: "Please select a template filter before sending invites.", type: "error" }); return;
    }
    const tmpl = templates.find(t => t.id === filterTemplate);
    setSendingInvites(true);
    try {
      const chosen = candidates.filter(c => selCandidates.has(c.id));
      const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
      const link = `${window.location.origin}/student/schedule`;
      let sent = 0;
      for (const c of chosen) {
        const inviteToken = crypto.randomUUID();
        await createScheduleInvite({
          candidateId:    c.id,
          candidateName:  c.name,
          candidateEmail: c.email,
          templateId:     filterTemplate,
          templateName:   tmpl?.name || "",
          program:        c.program || "",
          dateRangeStart: dateStart,
          dateRangeEnd:   dateEnd,
          inviteToken,
          expiryHours,
          status:         "sent",
          sentAt:         new Date().toISOString(),
          expiresAt,
          sentBy:         currentUser.uid,
        });
        await callAppsScript({
          action:    "sendEmail",
          subject:   `Schedule Your Interview — ${tmpl?.name || "Interview"}`,
          recipients: [{ email: c.email, name: c.name }],
          body:
            `Hi ${c.name},\n\nYou've been invited to schedule your interview.\n\n` +
            `Template: ${tmpl?.name || ""}\nDate Range: ${fmtDate(dateStart)} – ${fmtDate(dateEnd)}\n\n` +
            `Click below to pick your slot (link valid for ${expiryHours} hours):\n${link}?invite=${inviteToken}\n\n` +
            `NxtWave Interview Team`,
        });
        sent++;
      }
      setToast({ message: `${sent} invite${sent !== 1 ? "s" : ""} sent.` });
      setSelCandidates(new Set());
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setSendingInvites(false);
  };

  const handleConfirmBooking = async (inv) => {
    setConfirmingId(inv.id);
    try {
      const tmpl = inv.templateId ? await getTemplate(inv.templateId) : null;
      const ivr  = users.find(u => u.id === inv.bookedInterviewerId);
      const id   = await createInterview({
        candidateId:      inv.candidateId,
        candidateName:    inv.candidateName,
        candidateEmail:   inv.candidateEmail,
        interviewerId:    inv.bookedInterviewerId,
        interviewerName:  ivr?.displayName || ivr?.email || "",
        interviewerEmail: ivr?.email || "",
        scheduledDate:    inv.bookedDate,
        scheduledTime:    inv.bookedTime,
        duration:         60,
        round:            tmpl?.name || "Interview",
        templateId:       inv.templateId || "",
        templateName:     inv.templateName || "",
        createdBy:        currentUser.uid,
      });
      // Send calendar + Meet invite automatically
      if (ivr?.email && inv.candidateEmail) {
        const result = await fetch(APPS_SCRIPT_URL, {
          method: "POST", redirect: "follow",
          body: JSON.stringify({
            action: "schedule", secret: APPS_SCRIPT_SECRET,
            candidateEmail:  inv.candidateEmail,
            interviewerEmail: ivr.email,
            candidateName:   inv.candidateName,
            interviewerName: ivr?.displayName || ivr?.email || "",
            round:           tmpl?.name || "Interview",
            date:            inv.bookedDate,
            startTime:       inv.bookedTime,
            durationMinutes: 60,
          }),
        }).then(r => r.json()).catch(() => null);
        if (result?.meetLink) {
          const { updateInterview } = await import("../../api/firestore");
          await updateInterview(id, { meetLink: result.meetLink, eventId: result.eventId });
        }
      }
      await updateScheduleInvite(inv.id, { status: "confirmed", interviewId: id });
      setToast({ message: `Booking confirmed for ${inv.candidateName}.` });
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setConfirmingId(null);
  };

  const handleRejectBooking = async (inv) => {
    if (!confirm(`Reject booking for ${inv.candidateName}? Their slot will be freed.`)) return;
    try {
      await markSlotFree(inv.bookedInterviewerId, inv.bookedSlotId);
      await updateScheduleInvite(inv.id, { status: "cancelled", bookedSlotId: null, bookedInterviewerId: null, bookedDate: null, bookedTime: null });
      setToast({ message: "Booking rejected and slot freed." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  const pendingBookings  = invites.filter(i => i.status === "pending_confirmation");
  const programName = (id) => programs.find(p => p.id === id)?.name || id || "—";

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  const Tab = ({ id, label, badge }) => (
    <button onClick={() => setActiveTab(id)}
      className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
        activeTab === id ? "bg-white text-indigo-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-800"
      }`}>
      {label}
      {badge > 0 && <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nudge</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send availability requests to interviewers and scheduling invites to candidates</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8">
        <Tab id="interviewers" label="Interviewers" badge={unreadResponses} />
        <Tab id="candidates"   label="Candidates"   badge={pendingBookings.length} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          INTERVIEWERS TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "interviewers" && (
        <div className="space-y-8">
          {/* Date picker */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-700">Date</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-400">
              {forDate.length === 0 ? "No interviews scheduled" : `${forDate.length} interview${forDate.length !== 1 ? "s" : ""} scheduled`}
            </span>
          </div>

          {/* Schedule table */}
          {byTemplate.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Schedule — {fmtDate(selectedDate)}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Template", "Interviews", "Required Skills", "Matched", "Action"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byTemplate.map(({ template, interviews: ivs }) => {
                    const matched   = matchedFor(template);
                    const reqSkills = template?.skills || [];
                    return (
                      <tr key={template?.id || "__none__"} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-900">{template?.name || "No template"}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{ivs.length}</span>
                        </td>
                        <td className="px-4 py-3">
                          {reqSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {reqSkills.map(sid => (
                                <span key={sid} className="text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                  {skillName(sid)}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-gray-400">Not defined</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold ${matched.length > 0 ? "text-emerald-700" : "text-amber-600"}`}>
                            {matched.length} interviewer{matched.length !== 1 ? "s" : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openNudge(template, ivs)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
                            Nudge
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Responses */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-gray-700">Responses</h2>
              {unreadResponses > 0 && <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadResponses} new</span>}
            </div>
            {incomingResponses.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm text-gray-400">No responses yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {incomingResponses.map(n => (
                  <div key={n.id} className={`bg-white rounded-xl border px-5 py-4 flex items-start gap-4 ${n.status === "unread" ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{n.senderName}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                      <p className="text-xs text-gray-300 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</p>
                    </div>
                    {n.status === "unread" && (
                      <button onClick={() => markResponseRead(n)} className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 font-medium">Mark read</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CANDIDATES TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "candidates" && (
        <div className="space-y-8">

          {/* Config row */}
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Scheduling Campaign</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} min={dateStart}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Invite Expiry (hours)</label>
                <input type="number" min={1} max={168} value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Template (required)</label>
                <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Filter by Program</label>
                <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)}
                  className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="pt-5">
                <button
                  onClick={handleSendInvites}
                  disabled={sendingInvites || selCandidates.size === 0}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {sendingInvites ? "Sending…" : `Send Invites (${selCandidates.size})`}
                </button>
              </div>
            </div>
          </div>

          {/* Candidate list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Candidates {filterProgram || filterTemplate ? `(filtered: ${filteredCandidates.length})` : `(${candidates.length} total)`}
              </p>
              {filteredCandidates.length > 0 && (
                <button onClick={toggleAllCands} className="text-xs text-indigo-600 hover:underline font-medium">
                  {selCandidates.size === filteredCandidates.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 w-8"></th>
                  {["Name", "Email", "Program", "Templates"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCandidates.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-10 text-sm">
                    {candidates.length === 0 ? "No candidates yet." : "No candidates match the selected filters."}
                  </td></tr>
                ) : filteredCandidates.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 ${selCandidates.has(c.id) ? "bg-indigo-50" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selCandidates.has(c.id)} onChange={() => toggleCand(c.id)}
                        className="accent-indigo-600 w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{c.email || "—"}</td>
                    <td className="px-4 py-3">
                      {c.program
                        ? <span className="text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">{programName(c.program)}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.templateIds || []).map(tid => {
                          const t = templates.find(x => x.id === tid);
                          return t ? (
                            <span key={tid} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">{t.name}</span>
                          ) : null;
                        })}
                        {!(c.templateIds || []).length && <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invites log */}
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3">Sent Invites</h2>
            {invites.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-10">
                <p className="text-sm text-gray-400">No invites sent yet.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Candidate", "Template", "Date Range", "Status", "Sent At"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invites.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{inv.candidateName}</p>
                          <p className="text-xs text-gray-400">{inv.candidateEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{inv.templateName || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {fmtDate(inv.dateRangeStart)} – {fmtDate(inv.dateRangeEnd)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${STATUS_BADGE[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {STATUS_LABEL[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {inv.sentAt ? new Date(inv.sentAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending bookings */}
          {pendingBookings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700">Pending Confirmations</h2>
                <span className="text-xs font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{pendingBookings.length}</span>
              </div>
              <div className="space-y-3">
                {pendingBookings.map(inv => (
                  <div key={inv.id} className="bg-white border border-violet-200 rounded-xl px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{inv.candidateName}</p>
                      <p className="text-xs text-gray-400">{inv.candidateEmail}</p>
                      <div className="flex gap-4 mt-1.5">
                        <span className="text-xs font-semibold text-indigo-700">{inv.templateName}</span>
                        <span className="text-xs text-gray-600">{fmtDate(inv.bookedDate)} · {inv.bookedTime}</span>
                        <span className="text-xs text-gray-400">{users.find(u => u.id === inv.bookedInterviewerId)?.displayName || "Interviewer"}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleConfirmBooking(inv)}
                        disabled={confirmingId === inv.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                        {confirmingId === inv.id ? "Confirming…" : "✓ Confirm"}
                      </button>
                      <button
                        onClick={() => handleRejectBooking(inv)}
                        disabled={confirmingId === inv.id}
                        className="flex items-center gap-1.5 text-xs font-semibold border border-red-200 text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors">
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nudge Modal (Interviewers) */}
      <Modal open={!!nudgeTarget} onClose={() => setNudgeTarget(null)}
        title={`Nudge Interviewers — ${nudgeTarget?.template?.name || "No template"} · ${fmtDate(selectedDate)}`} wide>
        {nudgeTarget && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Select Interviewers ({selectedIvrs.size} selected)</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedIvrs(new Set(nudgeTarget.matched.map(u => u.id)))}
                    className="text-xs text-indigo-600 hover:underline font-medium">Select all matched</button>
                  <button type="button" onClick={() => setSelectedIvrs(new Set())}
                    className="text-xs text-gray-400 hover:underline font-medium">Clear</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {activeInterviewers.map(u => {
                  const overlap = skillOverlap(nudgeTarget.template?.skills || [], u.skills || []);
                  return (
                    <label key={u.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 ${selectedIvrs.has(u.id) ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={selectedIvrs.has(u.id)} onChange={() => toggleIvr(u.id)} className="accent-indigo-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{u.displayName || u.email}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {overlap.map(sid => (
                          <span key={sid} className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            {skills.find(s => s.id === sid)?.name || sid}
                          </span>
                        ))}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Message</p>
              <textarea rows={8} value={message} onChange={e => setMessage(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={sendNudge} disabled={sending || selectedIvrs.size === 0}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {sending ? "Sending…" : `Send to ${selectedIvrs.size} Interviewer${selectedIvrs.size !== 1 ? "s" : ""}`}
              </button>
              <button onClick={() => setNudgeTarget(null)}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
