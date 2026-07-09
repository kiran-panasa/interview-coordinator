import { useState, useEffect, useRef, useMemo } from "react";
import { formatDate, formatDateShort, formatDateTime } from "../../utils/dates";
import { createNotification, updateNotification } from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

function today() { return new Date().toISOString().slice(0, 10); }
function inDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`;
}
function skillOverlap(templateSkills = [], userSkills = []) {
  const ts = new Set(templateSkills);
  return userSkills.filter(s => ts.has(s));
}

export default function InterviewerNudgeTab({
  currentUser, userProfile,
  templates, skills, users, activeInterviewers,
  responses,
  ivrSlots, slotsLoading, fetchSlots,
  setToast,
}) {
  const [nudgeTemplateId, setNudgeTemplateId] = useState("");
  const [nudgeDateStart,  setNudgeDateStart]  = useState(today());
  const [nudgeDateEnd,    setNudgeDateEnd]    = useState(inDays(7));
  const [nudgeTimeStart,  setNudgeTimeStart]  = useState("09:00");
  const [nudgeTimeEnd,    setNudgeTimeEnd]    = useState("18:00");
  const [nudgeTarget,     setNudgeTarget]     = useState(null);
  const [selectedIvrs,    setSelectedIvrs]    = useState(new Set());
  const [manuallyAdded,   setManuallyAdded]   = useState(new Set());
  const [showAddPicker,   setShowAddPicker]   = useState(false);
  const [addSearch,       setAddSearch]       = useState("");
  const [message,         setMessage]         = useState("");
  const [sending,         setSending]         = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);
  const addPickerRef = useRef(null);

  const nudgeTemplate = templates.find(t => t.id === nudgeTemplateId) || null;

  const defaultMessage = useMemo(() => {
    const portal = `${window.location.origin}/interviewer/notifications`;
    const templateName = nudgeTemplate?.name || "Interview";
    const timeRange = nudgeTimeStart && nudgeTimeEnd
      ? ` (${formatTime(nudgeTimeStart)} – ${formatTime(nudgeTimeEnd)})`
      : "";
    return (
      `Hi {{name}},\n\nWe need interviewers for "${templateName}" sessions between ` +
      `${formatDate(nudgeDateStart)} and ${formatDate(nudgeDateEnd)}${timeRange}.\n\n` +
      `Please add your available time slots for this period so we can schedule candidates.\n\n` +
      `Click here to respond and add your slots:\n${portal}\n\n` +
      `Thank you,\n${userProfile?.displayName || "Admin"} · NxtWave`
    );
  }, [nudgeTemplate, nudgeDateStart, nudgeDateEnd, nudgeTimeStart, nudgeTimeEnd, userProfile]);

  const matchedInterviewers = nudgeTemplateId
    ? activeInterviewers.filter(u => (u.templateIds || []).includes(nudgeTemplateId))
    : activeInterviewers;

  const manualInterviewers = activeInterviewers.filter(u =>
    manuallyAdded.has(u.id) && !matchedInterviewers.some(m => m.id === u.id)
  );
  const displayedInterviewers = [...matchedInterviewers, ...manualInterviewers];

  // When template changes, reset selection to all matched + clear manual adds
  useEffect(() => {
    setSelectedIvrs(new Set(matchedInterviewers.map(u => u.id)));
    setManuallyAdded(new Set());
    setShowAddPicker(false);
  }, [nudgeTemplateId]); // eslint-disable-line

  // Close add picker on outside click
  useEffect(() => {
    if (!showAddPicker) return;
    const handler = (e) => {
      if (addPickerRef.current && !addPickerRef.current.contains(e.target))
        setShowAddPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddPicker]);

  const freeSlotCount = (ivrId) => {
    const slots = ivrSlots[ivrId] || [];
    return slots.filter(s => {
      if (s.isBooked) return false;
      if (s.date < nudgeDateStart || s.date > nudgeDateEnd) return false;
      if (s.startTime) {
        const t = s.startTime.slice(0, 5);
        if (nudgeTimeStart && t < nudgeTimeStart) return false;
        if (nudgeTimeEnd   && t > nudgeTimeEnd)   return false;
      }
      return true;
    }).length;
  };

  const lastNudgeResponse = (ivrId) => {
    const relevant = responses
      .filter(n => n.type === "response" && n.senderId === ivrId)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return relevant[0] || null;
  };

  const toggleIvr = (id) => setSelectedIvrs(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const addInterviewer = (u) => {
    setManuallyAdded(prev => new Set([...prev, u.id]));
    setSelectedIvrs(prev => new Set([...prev, u.id]));
    setAddSearch("");
    setShowAddPicker(false);
  };

  const availableToAdd = activeInterviewers.filter(u =>
    !displayedInterviewers.some(d => d.id === u.id) &&
    (!addSearch ||
      u.displayName?.toLowerCase().includes(addSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(addSearch.toLowerCase()))
  );

  const openNudge = () => {
    const toSend = displayedInterviewers.filter(u => selectedIvrs.has(u.id));
    if (!toSend.length) return;
    setNudgeTarget({ template: nudgeTemplate, interviewers: toSend });
    setSelectedIvrs(new Set(toSend.map(u => u.id)));
    setMessage(defaultMessage);
  };

  const messageIssues = useMemo(() => {
    if (!nudgeTarget) return [];
    const issues = [];
    if (!message.includes("{{name}}"))
      issues.push('Missing {{name}} — recipients won\'t be addressed by name.');
    if (!/https?:\/\//.test(message))
      issues.push('No link found — interviewers won\'t know where to respond.');
    return issues;
  }, [message, nudgeTarget]);

  const sendNudge = async () => {
    if (!nudgeTarget || selectedIvrs.size === 0) return;
    setSending(true);
    try {
      const recipients = users.filter(u => selectedIvrs.has(u.id));
      for (const r of recipients) {
        await createNotification({
          type: "nudge", recipientId: r.id, recipientEmail: r.email,
          senderId: currentUser.uid, senderName: userProfile?.displayName || userProfile?.email,
          senderEmail: currentUser.email || userProfile?.email || "",
          templateId: nudgeTarget.template?.id || "", templateName: nudgeTarget.template?.name || "General",
          dateRangeStart: nudgeDateStart, dateRangeEnd: nudgeDateEnd,
          timeRangeStart: nudgeTimeStart, timeRangeEnd: nudgeTimeEnd,
          message: message.replace(/\{\{name\}\}/g, r.displayName || r.email),
          status: "unread",
        });
      }
      setToast({ message: `Nudge sent to ${recipients.length} interviewer(s).` });
      setNudgeTarget(null);
      // Email is best-effort — notification already created above
      if (APPS_SCRIPT_URL) {
        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action: "sendEmail",
          subject: `Slot Request — ${nudgeTemplate?.name || "Interview"} · ${formatDate(nudgeDateStart)} – ${formatDate(nudgeDateEnd)}`,
          body: message,
          recipients: recipients.map(r => ({ email: r.email, name: r.displayName || r.email })),
        }).catch(() => {});
      }
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setSending(false);
  };

  const markResponseRead = async (n) => updateNotification(n.id, { status: "read" });
  const incomingResponses = responses.filter(n => n.type === "response");
  const unreadResponses   = incomingResponses.filter(n => n.status === "unread").length;
  const skillName = (id) => skills.find(s => s.id === id)?.name || id;

  const ivrPagination = usePagination(displayedInterviewers);

  const allChecked = displayedInterviewers.length > 0 && selectedIvrs.size === displayedInterviewers.length;
  const someChecked = selectedIvrs.size > 0 && selectedIvrs.size < displayedInterviewers.length;

  return (
    <div className="space-y-8">
      {/* Config */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Slot Request Campaign</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
            <select value={nudgeTemplateId} onChange={e => setNudgeTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Templates</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
            <input type="date" value={nudgeDateStart} onChange={e => setNudgeDateStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
            <input type="date" value={nudgeDateEnd} min={nudgeDateStart} onChange={e => setNudgeDateEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">
            Daily time window
            <span className="text-gray-400 font-normal ml-1">— ask interviewers for slots within this range</span>
          </p>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Time</label>
              <input type="time" value={nudgeTimeStart} onChange={e => setNudgeTimeStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <span className="text-gray-400 pb-2.5">—</span>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Time</label>
              <input type="time" value={nudgeTimeEnd} onChange={e => setNudgeTimeEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {nudgeTimeStart && nudgeTimeEnd && (
              <p className="text-xs text-gray-400 pb-2.5">{formatTime(nudgeTimeStart)} – {formatTime(nudgeTimeEnd)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Message Preview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setShowPreview(p => !p)}
          className="w-full flex items-center justify-between px-6 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview Message
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showPreview ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPreview && (
          <div className="border-t border-gray-100 px-6 py-4">
            {displayedInterviewers.length > 0 && (
              <p className="text-xs text-gray-400 mb-3">
                Showing as it will appear for <span className="font-medium text-gray-600">{displayedInterviewers[0].displayName || displayedInterviewers[0].email}</span>
              </p>
            )}
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-xl px-4 py-3">
              {defaultMessage.replace(/\{\{name\}\}/g, displayedInterviewers[0]?.displayName || displayedInterviewers[0]?.email || "{{name}}")}
            </pre>
          </div>
        )}
      </div>

      {/* Interviewers table */}
      <div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Matched Interviewers ({matchedInterviewers.length})
              {manualInterviewers.length > 0 && (
                <span className="ml-2 font-normal text-indigo-500">+{manualInterviewers.length} manual</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchSlots(activeInterviewers.map(u => u.id))} disabled={slotsLoading}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-gray-200 bg-white transition-colors">
                <svg className={`w-3.5 h-3.5 ${slotsLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {slotsLoading ? "Loading…" : "Refresh slots"}
              </button>
              <button onClick={openNudge} disabled={selectedIvrs.size === 0}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
                Nudge Selected ({selectedIvrs.size})
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pl-4 pr-2 py-3 w-8">
                  <input type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked; }}
                    onChange={() => setSelectedIvrs(allChecked ? new Set() : new Set(displayedInterviewers.map(u => u.id)))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                {["Interviewer", "Skills", "Free Slots in Range", "Last Response"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayedInterviewers.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-10 text-sm">
                  No interviewers match the selected template.
                </td></tr>
              ) : ivrPagination.paged.map(u => {
                const slots    = freeSlotCount(u.id);
                const lastResp = lastNudgeResponse(u.id);
                const overlap  = skillOverlap(nudgeTemplate?.skills || [], u.skills || []);
                const isManual = manuallyAdded.has(u.id);
                return (
                  <tr key={u.id} className={`hover:bg-gray-50 ${selectedIvrs.has(u.id) ? "bg-indigo-50/40" : ""}`}>
                    <td className="pl-4 pr-2 py-3 w-8">
                      <input type="checkbox" checked={selectedIvrs.has(u.id)} onChange={() => toggleIvr(u.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{u.displayName || u.email}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                        {isManual && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                            Manual
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {overlap.length > 0
                          ? overlap.map(sid => (
                              <span key={sid} className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
                                {skillName(sid)}
                              </span>
                            ))
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${slots > 0 ? "text-emerald-600" : "text-amber-500"}`}>
                        {slots} slot{slots !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lastResp ? (
                        <div>
                          <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded-full ${
                            lastResp.message?.includes("NOT available")
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            {lastResp.message?.includes("NOT available") ? "Not Available" : "Available"}
                          </span>
                          <p className="text-[10px] text-gray-300 mt-0.5">
                            {lastResp.createdAt ? formatDateShort(lastResp.createdAt) : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">No response</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={ivrPagination.page} totalPages={ivrPagination.totalPages} total={ivrPagination.total} pageSize={ivrPagination.pageSize} onPageChange={ivrPagination.setPage} />
        </div>

        {/* Add Interviewer — outside overflow-hidden container so dropdown isn't clipped */}
        <div className="relative mt-2" ref={addPickerRef}>
          <button
            onClick={() => { setShowAddPicker(p => !p); setAddSearch(""); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-1 py-1 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Interviewer Manually
          </button>
          {showAddPicker && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-72">
              <div className="p-2 border-b border-gray-100">
                <input autoFocus type="text" value={addSearch} onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {availableToAdd.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-5">
                    {addSearch ? "No matches" : "All interviewers already listed"}
                  </p>
                ) : availableToAdd.map(u => (
                  <button key={u.id} onClick={() => addInterviewer(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 text-left transition-colors">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(u.displayName || u.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.displayName || u.email}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responses */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-700">Responses</h2>
          {unreadResponses > 0 && <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadResponses} new</span>}
        </div>
        {incomingResponses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-10">
            <p className="text-sm text-gray-400">No responses yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incomingResponses.map(n => (
              <div key={n.id} className={`bg-white rounded-xl border px-5 py-4 flex items-start gap-4 ${n.status === "unread" ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{n.senderName}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-300 mt-1">{n.createdAt ? formatDateTime(n.createdAt) : ""}</p>
                </div>
                {n.status === "unread" && (
                  <button onClick={() => markResponseRead(n)} className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 font-medium">Mark read</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nudge Modal */}
      <Modal open={!!nudgeTarget} onClose={() => setNudgeTarget(null)}
        title={`Nudge Interviewers — ${nudgeTarget?.template?.name || "All Templates"} · ${formatDate(nudgeDateStart)} – ${formatDate(nudgeDateEnd)}`} wide>
        {nudgeTarget && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Select Interviewers ({selectedIvrs.size} selected)</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedIvrs(new Set(nudgeTarget.interviewers.map(u => u.id)))}
                    className="text-xs text-indigo-600 hover:underline font-medium">Select all</button>
                  <button type="button" onClick={() => setSelectedIvrs(new Set())}
                    className="text-xs text-gray-400 hover:underline font-medium">Clear</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {nudgeTarget.interviewers.map(u => {
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
                            {skillName(sid)}
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
              {messageIssues.length > 0 && (
                <div className="mb-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div className="space-y-0.5">
                    {messageIssues.map((issue, i) => (
                      <p key={i} className="text-xs text-amber-700">{issue}</p>
                    ))}
                  </div>
                </div>
              )}
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
    </div>
  );
}
