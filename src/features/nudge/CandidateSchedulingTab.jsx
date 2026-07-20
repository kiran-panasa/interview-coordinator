import { useState, useEffect, useMemo } from "react";
import { formatDate, formatDateTime } from "../../utils/dates";
import {
  createScheduleInvite, updateScheduleInvite, deleteScheduleInvite,
  markSlotFree, createInterview, getTemplate,
} from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { NUDGE_ROUND_OPTIONS, NUDGE_ROUND_OTHER } from "../../constants/nudgeRounds";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function today() { return new Date().toISOString().slice(0, 10); }
function inDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

export default function CandidateSchedulingTab({
  currentUser,
  templates, programs, candidates, users, activeInterviewers,
  invites, ivrSlots,
  setToast,
}) {
  const [dateStart,      setDateStart]      = useState(today());
  const [dateEnd,        setDateEnd]        = useState(inDays(7));
  const [expiryHours,    setExpiryHours]    = useState(24);
  const [filterProgram,  setFilterProgram]  = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [round,          setRound]          = useState("");
  const [roundCustomMode, setRoundCustomMode] = useState(false);
  const [selCandidates,  setSelCandidates]  = useState(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);
  const [confirmingId,   setConfirmingId]   = useState(null);
  const [resendingId,    setResendingId]    = useState(null);
  const [deletingId,     setDeletingId]     = useState(null);
  const [copiedId,       setCopiedId]       = useState(null);

  // Slot summary: per template, count free slots from matched interviewers within dateStart–dateEnd
  const slotSummary = templates.map(tmpl => {
    const matched = activeInterviewers.filter(u => {
      const req = tmpl.skills || [];
      return req.length === 0 || skillOverlap(req, u.skills || []).length > 0;
    });
    const total = matched.reduce((sum, u) => {
      const slots = ivrSlots[u.id] || [];
      return sum + slots.filter(s => !s.isBooked && s.date >= dateStart && s.date <= dateEnd).length;
    }, 0);
    return { tmpl, matched: matched.length, freeSlots: total };
  }).filter(s => s.matched > 0);

  // Templates explicitly assigned to the selected program, plus any template
  // that hasn't been assigned to a program yet (so nothing vanishes silently).
  const templateOptions = useMemo(
    () => templates.filter(t => !filterProgram || !t.program || t.program === filterProgram),
    [templates, filterProgram]
  );

  // Program changed and the selected template no longer applies — clear it.
  useEffect(() => {
    if (filterTemplate && !templateOptions.some(t => t.id === filterTemplate)) setFilterTemplate("");
  }, [filterProgram]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!round) {
      setToast({ message: "Please select a round before sending invites.", type: "error" }); return;
    }
    const tmpl = templates.find(t => t.id === filterTemplate);
    setSendingInvites(true);
    try {
      const chosen = candidates.filter(c => selCandidates.has(c.id));
      const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();
      const link = `${window.location.origin}/student/schedule`;
      let sent = 0;
      const emailFailures = [];
      for (const c of chosen) {
        const inviteToken = crypto.randomUUID();
        const candidateProgramLabel = programs.find(p => p.id === c.program)?.name || "";
        await createScheduleInvite({
          candidateId:    c.id,
          candidateName:  c.name,
          candidateEmail: c.email,
          templateId:     filterTemplate,
          templateName:   tmpl?.name || "",
          round,
          program:        c.program || "",
          programName:    candidateProgramLabel,
          dateRangeStart: dateStart,
          dateRangeEnd:   dateEnd,
          inviteToken,
          expiryHours,
          status:         "sent",
          sentAt:         new Date().toISOString(),
          expiresAt,
          sentBy:         currentUser.uid,
        });
        sent++;
        // One candidate's email failing shouldn't stop the rest of the batch —
        // but unlike a true fire-and-forget, we still surface who failed and why.
        if (!APPS_SCRIPT_URL) {
          emailFailures.push(`${c.name}: VITE_APPS_SCRIPT_URL is not configured`);
          continue;
        }
        if (!c.email) {
          emailFailures.push(`${c.name}: no email on file`);
          continue;
        }
        try {
          await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
            action:    "sendEmail",
            subject:   `Schedule Your Interview — ${round}`,
            recipients: [{ email: c.email, name: c.name }],
            body:
              `Hi ${c.name},\n\nYou've been invited to schedule your interview.\n\n` +
              `${candidateProgramLabel ? `Program: ${candidateProgramLabel}\n` : ""}Round: ${round}\nDate Range: ${formatDate(dateStart)} – ${formatDate(dateEnd)}\n\n` +
              `Click below to pick your slot (link valid for ${expiryHours} hours):\n${link}?invite=${inviteToken}\n\n` +
              `NxtWave Interview Team`,
          });
        } catch (emailErr) {
          emailFailures.push(`${c.name}: ${emailErr.message}`);
        }
      }
      if (emailFailures.length > 0) {
        const extra = emailFailures.length > 1 ? ` (+${emailFailures.length - 1} more)` : "";
        setToast({
          message: `${sent} invite${sent !== 1 ? "s" : ""} created, but ${emailFailures.length} email(s) failed — ${emailFailures[0]}${extra}`,
          type: "error",
        });
      } else {
        setToast({ message: `${sent} invite${sent !== 1 ? "s" : ""} sent.` });
      }
      setSelCandidates(new Set());
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setSendingInvites(false);
  };

  const handleConfirmBooking = async (inv) => {
    setConfirmingId(inv.id);
    try {
      const tmpl = inv.templateId ? await getTemplate(inv.templateId) : null;
      const ivr  = users.find(u => u.id === inv.bookedInterviewerId);
      const roundLabel = inv.round || tmpl?.name || "Interview";
      if (!ivr?.email || !inv.candidateEmail) {
        throw new Error("Missing interviewer or candidate email — cannot schedule.");
      }
      // Must succeed before we create the interview record or mark the invite
      // confirmed — otherwise the admin sees "confirmed" with no Meet link sent.
      const result = await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:           "schedule",
        candidateEmail:   inv.candidateEmail,
        interviewerEmail: ivr.email,
        candidateName:    inv.candidateName,
        interviewerName:  ivr?.displayName || ivr?.email || "",
        round:            roundLabel,
        date:             inv.bookedDate,
        startTime:        inv.bookedTime,
        durationMinutes:  60,
      });
      const id = await createInterview({
        candidateId:      inv.candidateId,
        candidateName:    inv.candidateName,
        candidateEmail:   inv.candidateEmail,
        interviewerId:    inv.bookedInterviewerId,
        interviewerName:  ivr?.displayName || ivr?.email || "",
        interviewerEmail: ivr?.email || "",
        scheduledDate:    inv.bookedDate,
        scheduledTime:    inv.bookedTime,
        duration:         60,
        round:            roundLabel,
        templateId:       inv.templateId || "",
        templateName:     inv.templateName || "",
        meetLink:         result?.meetLink || "",
        eventId:          result?.eventId || "",
        recallBotId:      result?.recallBotId || "",
        createdBy:        currentUser.uid,
        // Candidate slots come from the panelist's own published availability
        // and the Meet link is already generated — skip the interviewer's
        // separate manual accept/decline step for this flow.
        status:           "scheduled",
      });
      await updateScheduleInvite(inv.id, { status: "confirmed", interviewId: id });
      if (result?.hostManagementWarning) {
        console.error("Host management warning:", result.hostManagementWarning);
        setToast({ message: "Booking confirmed, but couldn't enable panelist recording access — see browser console for details.", type: "info" });
      } else {
        setToast({ message: `Booking confirmed for ${inv.candidateName}.` });
      }
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

  const handleResendInvite = async (inv) => {
    setResendingId(inv.id);
    try {
      const newToken  = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + (inv.expiryHours || 24) * 3600 * 1000).toISOString();
      await updateScheduleInvite(inv.id, {
        inviteToken: newToken, status: "sent",
        sentAt: new Date().toISOString(), expiresAt,
        bookedSlotId: null, bookedInterviewerId: null, bookedDate: null, bookedTime: null,
      });
      const link = `${window.location.origin}/student/schedule`;
      const invProgramLabel = programs.find(p => p.id === inv.program)?.name || "";
      const invRound = inv.round || inv.templateName || "Interview";
      if (!APPS_SCRIPT_URL) throw new Error("VITE_APPS_SCRIPT_URL is not configured");
      await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action: "sendEmail",
        subject: `Schedule Your Interview — ${invRound}`,
        recipients: [{ email: inv.candidateEmail, name: inv.candidateName }],
        body:
          `Hi ${inv.candidateName},\n\nYou've been invited to schedule your interview.\n\n` +
          `${invProgramLabel ? `Program: ${invProgramLabel}\n` : ""}Round: ${invRound}\nDate Range: ${formatDate(inv.dateRangeStart)} – ${formatDate(inv.dateRangeEnd)}\n\n` +
          `Click below to pick your slot (link valid for ${inv.expiryHours || 24} hours):\n${link}?invite=${newToken}\n\n` +
          `NxtWave Interview Team`,
      });
      setToast({ message: `Invite resent to ${inv.candidateName}.` });
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setResendingId(null);
  };

  const handleCopyLink = (inv) => {
    const link = `${window.location.origin}/student/schedule?invite=${inv.inviteToken}`;
    navigator.clipboard.writeText(link);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportLinks = () => {
    const rows = [["Candidate Name", "Email", "Template", "Round", "Date Range", "Status", "Scheduling Link"]];
    invites.forEach(inv => {
      const link = inv.inviteToken
        ? `${window.location.origin}/student/schedule?invite=${inv.inviteToken}`
        : "—";
      rows.push([
        inv.candidateName, inv.candidateEmail, inv.templateName || "", inv.round || "",
        `${formatDate(inv.dateRangeStart)} – ${formatDate(inv.dateRangeEnd)}`,
        STATUS_LABEL[inv.status] || inv.status, link,
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "candidate_invite_links.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteInvite = async (inv) => {
    if (!confirm(`Delete invite for ${inv.candidateName}? This cannot be undone.`)) return;
    setDeletingId(inv.id);
    try {
      await deleteScheduleInvite(inv.id);
      setToast({ message: `Invite for ${inv.candidateName} deleted.` });
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setDeletingId(null);
  };

  const pendingBookings = invites.filter(i => i.status === "pending_confirmation");
  const programName = (id) => programs.find(p => p.id === id)?.name || id || "—";

  const candPagination = usePagination(filteredCandidates);
  const invPagination  = usePagination(invites);

  return (
    <div className="space-y-8">
      {/* Slot availability summary */}
      {slotSummary.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Available Slots · {formatDate(dateStart)} – {formatDate(dateEnd)}
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {slotSummary.map(({ tmpl, matched, freeSlots }) => (
              <div key={tmpl.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{tmpl.name}</p>
                  <p className="text-xs text-gray-400">{matched} matched interviewer{matched !== 1 ? "s" : ""}</p>
                </div>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                  freeSlots > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"
                }`}>
                  {freeSlots} free slot{freeSlots !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign config */}
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
              {templateOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Filter by Program</label>
            <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Programs</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Round (required)</label>
            <select
              value={roundCustomMode ? NUDGE_ROUND_OTHER : round}
              onChange={e => {
                const v = e.target.value;
                if (v === NUDGE_ROUND_OTHER) { setRoundCustomMode(true); setRound(""); }
                else { setRoundCustomMode(false); setRound(v); }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Select round —</option>
              {NUDGE_ROUND_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              <option value={NUDGE_ROUND_OTHER}>Other…</option>
            </select>
            {roundCustomMode && (
              <input type="text" value={round} onChange={e => setRound(e.target.value)}
                placeholder="Enter custom round name…" autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            )}
          </div>
          <div>
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
            ) : candPagination.paged.map(c => (
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
        <Pagination page={candPagination.page} totalPages={candPagination.totalPages} total={candPagination.total} pageSize={candPagination.pageSize} onPageChange={candPagination.setPage} />
      </div>

      {/* Invites log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Sent Invites</h2>
          {invites.length > 0 && (
            <button onClick={handleExportLinks}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
              Export Links CSV
            </button>
          )}
        </div>
        {invites.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-10">
            <p className="text-sm text-gray-400">No invites sent yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Candidate", "Template", "Round", "Date Range", "Status", "Sent At", ""].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invPagination.paged.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{inv.candidateName}</p>
                      <p className="text-xs text-gray-400">{inv.candidateEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{inv.templateName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{inv.round || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {formatDate(inv.dateRangeStart)} – {formatDate(inv.dateRangeEnd)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[inv.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {inv.sentAt ? formatDateTime(inv.sentAt) : "—"}
                    </td>
                    <td className="px-4 py-3 w-20">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyLink(inv)}
                          disabled={!inv.inviteToken}
                          title="Copy scheduling link"
                          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                            copiedId === inv.id
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}>
                          {copiedId === inv.id ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                        <KebabMenu actions={[
                          {
                            label: resendingId === inv.id ? "Resending…" : "Resend",
                            onClick: () => handleResendInvite(inv),
                            disabled: resendingId === inv.id || deletingId === inv.id || ["confirmed", "cancelled"].includes(inv.status),
                          },
                          {
                            label: deletingId === inv.id ? "Deleting…" : "Delete",
                            onClick: () => handleDeleteInvite(inv),
                            danger: true,
                            disabled: resendingId === inv.id || deletingId === inv.id,
                          },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={invPagination.page} totalPages={invPagination.totalPages} total={invPagination.total} pageSize={invPagination.pageSize} onPageChange={invPagination.setPage} />
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
                    <span className="text-xs text-gray-600">{formatDate(inv.bookedDate)} · {inv.bookedTime}</span>
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
  );
}
