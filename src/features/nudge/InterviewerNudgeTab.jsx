import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, Send, Plus, Search, AlertTriangle, Users, MessageSquare, Megaphone,
} from "lucide-react";
import { formatDate, formatDateShort, formatDateTime } from "../../utils/dates";
import { createNotification, updateNotification } from "../../api/firestore";
import { callAppsScript } from "../../lib/appsScript";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import Button from "../../components/Button";
import DatePicker from "../../components/DatePicker";
import { usePagination } from "../../hooks/usePagination";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

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
  programs, templates, skills, users, activeInterviewers,
  responses,
  ivrSlots, slotsLoading, fetchSlots,
  setToast,
}) {
  const [nudgeProgram,    setNudgeProgram]    = useState("");
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
  const addPickerRef = useRef(null);

  // Templates explicitly assigned to the selected program, plus any template
  // that hasn't been assigned to a program yet (so nothing vanishes silently).
  const templateOptions = useMemo(
    () => templates.filter(t => !nudgeProgram || !t.program || t.program === nudgeProgram),
    [templates, nudgeProgram]
  );

  // Program changed and the selected template no longer applies — clear it.
  useEffect(() => {
    if (nudgeTemplateId && !templateOptions.some(t => t.id === nudgeTemplateId)) setNudgeTemplateId("");
  }, [nudgeProgram]); // eslint-disable-line react-hooks/exhaustive-deps

  const nudgeTemplate    = templateOptions.find(t => t.id === nudgeTemplateId) || null;
  const nudgeProgramName = programs?.find(p => p.id === nudgeProgram)?.name || "";
  const sessionLabel     = nudgeTemplate?.name || "Interview";

  const defaultMessage = useMemo(() => {
    const portal = `${window.location.origin}/interviewer/availability`;
    const timeRange = nudgeTimeStart && nudgeTimeEnd
      ? ` (${formatTime(nudgeTimeStart)} – ${formatTime(nudgeTimeEnd)})`
      : "";
    const programLine = nudgeProgramName ? ` for the ${nudgeProgramName} program` : "";
    return (
      `Hi {{name}},\n\nWe need interviewers${programLine} for "${sessionLabel}" sessions between ` +
      `${formatDate(nudgeDateStart)} and ${formatDate(nudgeDateEnd)}${timeRange}.\n\n` +
      `Please add your available time slots for this period so we can schedule candidates.\n\n` +
      `Click here to respond and add your slots:\n${portal}\n\n` +
      `Thank you,\n${userProfile?.displayName || "Admin"} · NxtWave`
    );
  }, [sessionLabel, nudgeProgramName, nudgeDateStart, nudgeDateEnd, nudgeTimeStart, nudgeTimeEnd, userProfile]);

  const templateOptionIds = templateOptions.map(t => t.id);
  const matchedInterviewers = nudgeTemplateId
    ? activeInterviewers.filter(u => (u.templateIds || []).includes(nudgeTemplateId))
    : nudgeProgram
      ? activeInterviewers.filter(u => (u.templateIds || []).some(tid => templateOptionIds.includes(tid)))
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
          program: nudgeProgramName || "",
          dateRangeStart: nudgeDateStart, dateRangeEnd: nudgeDateEnd,
          timeRangeStart: nudgeTimeStart, timeRangeEnd: nudgeTimeEnd,
          message: message.replace(/\{\{name\}\}/g, r.displayName || r.email),
          status: "unread",
        });
      }
      setNudgeTarget(null);
      let emailError = null;
      if (APPS_SCRIPT_URL) {
        try {
          await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
            action: "sendEmail",
            subject: `Slot Request — ${sessionLabel} · ${formatDate(nudgeDateStart)} – ${formatDate(nudgeDateEnd)}`,
            body: message,
            recipients: recipients.map(r => ({ email: r.email, name: r.displayName || r.email })),
          });
        } catch (e) {
          emailError = e.message;
        }
      } else {
        emailError = "VITE_APPS_SCRIPT_URL is not configured";
      }
      if (emailError) {
        setToast({
          message: `Nudge sent to ${recipients.length} interviewer(s) in-app, but the email failed — ${emailError}`,
          type: "error",
        });
      } else {
        setToast({ message: `Nudge sent to ${recipients.length} interviewer(s).` });
      }
    } catch (e) { setToast({ message: "Failed: " + e.message, type: "error" }); }
    setSending(false);
  };

  const markResponseRead = async (n) => updateNotification(n.id, { status: "read" });
  const incomingResponses = responses.filter(n => n.type === "response");
  const unreadResponses   = incomingResponses.filter(n => n.status === "unread").length;
  const skillName = (id) => skills.find(s => s.id === id)?.name || id;

  const ivrPagination = usePagination(displayedInterviewers);

  const allChecked  = displayedInterviewers.length > 0 && selectedIvrs.size === displayedInterviewers.length;
  const someChecked = selectedIvrs.size > 0 && selectedIvrs.size < displayedInterviewers.length;

  return (
    <div className="space-y-8">
      {/* Config */}
      <motion.div
        initial="hidden" animate="visible" custom={0} variants={fadeUp}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft px-6 py-5"
      >
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5 text-gray-400" /> Slot Request Campaign
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Program</label>
            <select value={nudgeProgram} onChange={e => setNudgeProgram(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All Programs</option>
              {(programs || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
            <select value={nudgeTemplateId} onChange={e => setNudgeTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All Templates</option>
              {templateOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
            <DatePicker value={nudgeDateStart} onChange={e => setNudgeDateStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
            <DatePicker value={nudgeDateEnd} min={nudgeDateStart} onChange={e => setNudgeDateEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
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
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <span className="text-gray-400 pb-2.5">—</span>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Time</label>
              <input type="time" value={nudgeTimeEnd} onChange={e => setNudgeTimeEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {nudgeTimeStart && nudgeTimeEnd && (
              <p className="text-xs text-gray-400 pb-2.5">{formatTime(nudgeTimeStart)} – {formatTime(nudgeTimeEnd)}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Interviewers table */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              Matched Interviewers ({matchedInterviewers.length})
              {manualInterviewers.length > 0 && (
                <span className="ml-1 font-normal text-brand-500 normal-case">+{manualInterviewers.length} manual</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary" size="sm" icon={RefreshCw}
                onClick={() => fetchSlots(activeInterviewers.map(u => u.id))} disabled={slotsLoading}
                className={slotsLoading ? "[&_svg]:animate-spin" : ""}
              >
                {slotsLoading ? "Loading…" : "Refresh slots"}
              </Button>
              <Button variant="primary" size="sm" icon={Send} onClick={openNudge} disabled={selectedIvrs.size === 0}>
                Nudge Selected ({selectedIvrs.size})
              </Button>
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
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
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
                  <tr key={u.id} className={`hover:bg-gray-50/70 transition-colors ${selectedIvrs.has(u.id) ? "bg-brand-50/40" : ""}`}>
                    <td className="pl-4 pr-2 py-3 w-8">
                      <input type="checkbox" checked={selectedIvrs.has(u.id)} onChange={() => toggleIvr(u.id)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{u.displayName || u.email}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                        {isManual && (
                          <span className="text-[10px] font-bold text-brand-600 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full">
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
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 px-1 py-1 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Interviewer Manually
          </button>
          {showAddPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-popover w-72"
            >
              <div className="p-2 border-b border-gray-100 relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input autoFocus type="text" value={addSearch} onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {availableToAdd.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-5">
                    {addSearch ? "No matches" : "All interviewers already listed"}
                  </p>
                ) : availableToAdd.map(u => (
                  <button key={u.id} onClick={() => addInterviewer(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-brand-50 text-left transition-colors">
                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(u.displayName || u.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.displayName || u.email}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Responses */}
      <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" /> Responses
          </h2>
          {unreadResponses > 0 && <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadResponses} new</span>}
        </div>
        {incomingResponses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-10">
            <p className="text-sm text-gray-400">No responses yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incomingResponses.map(n => (
              <div key={n.id} className={`bg-white rounded-2xl border px-5 py-4 flex items-start gap-4 shadow-soft ${n.status === "unread" ? "border-red-200 bg-red-50/60" : "border-gray-100"}`}>
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
      </motion.div>

      {/* Nudge Modal */}
      <Modal open={!!nudgeTarget} onClose={() => setNudgeTarget(null)}
        title={`Nudge Interviewers — ${sessionLabel} · ${formatDate(nudgeDateStart)} – ${formatDate(nudgeDateEnd)}`} wide>
        {nudgeTarget && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Select Interviewers ({selectedIvrs.size} selected)</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedIvrs(new Set(nudgeTarget.interviewers.map(u => u.id)))}
                    className="text-xs text-brand-600 hover:underline font-medium">Select all</button>
                  <button type="button" onClick={() => setSelectedIvrs(new Set())}
                    className="text-xs text-gray-400 hover:underline font-medium">Clear</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {nudgeTarget.interviewers.map(u => {
                  const overlap = skillOverlap(nudgeTarget.template?.skills || [], u.skills || []);
                  return (
                    <label key={u.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 ${selectedIvrs.has(u.id) ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={selectedIvrs.has(u.id)} onChange={() => toggleIvr(u.id)} className="accent-brand-600" />
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
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {messageIssues.map((issue, i) => (
                      <p key={i} className="text-xs text-amber-700">{issue}</p>
                    ))}
                  </div>
                </div>
              )}
              <textarea rows={8} value={message} onChange={e => setMessage(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none font-mono" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="primary" size="lg" icon={Send} onClick={sendNudge} disabled={sending || selectedIvrs.size === 0}
                className="flex-1"
              >
                {sending ? "Sending…" : `Send to ${selectedIvrs.size} Interviewer${selectedIvrs.size !== 1 ? "s" : ""}`}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setNudgeTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
