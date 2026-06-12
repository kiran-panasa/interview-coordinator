import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import {
  subscribeToInterviews, getTemplates, getAllUsers,
  subscribeToSkills, subscribeToUserNotifications,
  createNotification, updateNotification,
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

function today() {
  return new Date().toISOString().slice(0, 10);
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

export default function NudgePage() {
  const { currentUser, userProfile } = useAuth();

  const [selectedDate, setSelectedDate] = useState(today());
  const [interviews,   setInterviews]   = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [users,        setUsers]        = useState([]);
  const [skills,       setSkills]       = useState([]);
  const [responses,    setResponses]    = useState([]);
  const [toast,        setToast]        = useState(null);

  // Nudge modal state
  const [nudgeTarget,   setNudgeTarget]   = useState(null); // { template, interviews }
  const [selectedIvrs,  setSelectedIvrs]  = useState(new Set());
  const [message,       setMessage]       = useState("");
  const [sending,       setSending]       = useState(false);

  useEffect(() => {
    const unsub1 = subscribeToInterviews(setInterviews);
    const unsub2 = subscribeToSkills(setSkills);
    const unsub3 = subscribeToUserNotifications(currentUser.uid, setResponses);
    getTemplates().then(setTemplates);
    getAllUsers().then(setUsers);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [currentUser.uid]);

  // Group interviews on selectedDate by templateId
  const forDate = interviews.filter(i =>
    i.scheduledDate === selectedDate &&
    i.status !== "cancelled" && i.status !== "declined"
  );

  const byTemplate = Object.values(
    forDate.reduce((acc, iv) => {
      const tid = iv.templateId || "__none__";
      if (!acc[tid]) {
        acc[tid] = {
          template: templates.find(t => t.id === iv.templateId) || null,
          interviews: [],
        };
      }
      acc[tid].interviews.push(iv);
      return acc;
    }, {})
  ).sort((a, b) => (a.template?.name || "").localeCompare(b.template?.name || ""));

  const activeInterviewers = users.filter(
    u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
  );

  const matchedFor = (template) => {
    const req = template?.skills || [];
    if (!req.length) return activeInterviewers; // no skills defined → show all
    return activeInterviewers.filter(u => skillOverlap(req, u.skills || []).length > 0);
  };

  const openNudge = (template, ivs) => {
    const matched = matchedFor(template);
    const portal = `${window.location.origin}/interviewer/notifications`;
    const defaultMsg =
      `Hi {{name}},\n\nWe have ${ivs.length} interview(s) on ${fmtDate(selectedDate)}` +
      (template ? ` using the "${template.name}" template` : "") +
      `.\nWe'd like to check if you're available to take one.\n\nPlease respond here:\n${portal}\n\nThank you,\n${userProfile?.displayName || "Admin"} · NxtWave`;
    setNudgeTarget({ template, interviews: ivs, matched });
    setSelectedIvrs(new Set(matched.map(u => u.id)));
    setMessage(defaultMsg);
  };

  const sendNudge = async () => {
    if (!nudgeTarget || selectedIvrs.size === 0) return;
    setSending(true);
    try {
      const recipients = users.filter(u => selectedIvrs.has(u.id));
      for (const r of recipients) {
        await createNotification({
          type:         "nudge",
          recipientId:  r.id,
          recipientEmail: r.email,
          senderId:     currentUser.uid,
          senderName:   userProfile?.displayName || userProfile?.email,
          templateId:   nudgeTarget.template?.id  || "",
          templateName: nudgeTarget.template?.name || "General",
          date:         selectedDate,
          message:      message.replace(/\{\{name\}\}/g, r.displayName || r.email),
          status:       "unread",
        });
      }

      if (APPS_SCRIPT_URL) {
        await callAppsScript({
          action:     "sendEmail",
          subject:    `Interview Availability Request${nudgeTarget.template ? ` — ${nudgeTarget.template.name}` : ""} · ${fmtDate(selectedDate)}`,
          body:       message,
          recipients: recipients.map(r => ({ email: r.email, name: r.displayName || r.email })),
        });
      }

      setToast({ message: `Nudge sent to ${recipients.length} interviewer(s).` });
      setNudgeTarget(null);
    } catch (e) {
      setToast({ message: "Failed: " + e.message, type: "error" });
    }
    setSending(false);
  };

  const markResponseRead = async (n) => {
    await updateNotification(n.id, { status: "read" });
  };

  const incomingResponses = responses.filter(n => n.type === "response");
  const unreadResponses   = incomingResponses.filter(n => n.status === "unread").length;

  const skillName = (id) => skills.find(s => s.id === id)?.name || id;

  const toggleIvr = (id) => setSelectedIvrs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Nudge Interviewers</h1>
        <p className="text-sm text-gray-500 mt-0.5">View schedule by date and send availability requests to matched interviewers</p>
      </div>

      {/* ── Date Picker ── */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-semibold text-gray-700">Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-400">
          {forDate.length === 0 ? "No interviews scheduled" : `${forDate.length} interview${forDate.length !== 1 ? "s" : ""} scheduled`}
        </span>
      </div>

      {/* ── Schedule for selected date ── */}
      {byTemplate.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
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
                const matched  = matchedFor(template);
                const reqSkills = template?.skills || [];
                return (
                  <tr key={template?.id || "__none__"} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{template?.name || "No template"}</p>
                    </td>
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
                      ) : (
                        <span className="text-xs text-gray-400">Not defined</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${matched.length > 0 ? "text-emerald-700" : "text-amber-600"}`}>
                        {matched.length} interviewer{matched.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openNudge(template, ivs)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                        </svg>
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

      {/* ── Responses from interviewers ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-700">Responses</h2>
          {unreadResponses > 0 && (
            <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadResponses} new</span>
          )}
        </div>

        {incomingResponses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-12 gap-2">
            <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
            </svg>
            <p className="text-sm text-gray-400">No responses yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incomingResponses.map(n => (
              <div key={n.id}
                className={`bg-white rounded-xl border px-5 py-4 flex items-start gap-4 transition-colors ${
                  n.status === "unread" ? "border-red-200 bg-red-50" : "border-gray-200"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{n.senderName}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                  {n.templateName && (
                    <p className="text-xs text-gray-400 mt-1">
                      {n.templateName}{n.date ? ` · ${fmtDate(n.date)}` : ""}
                    </p>
                  )}
                  <p className="text-xs text-gray-300 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</p>
                </div>
                {n.status === "unread" && (
                  <button onClick={() => markResponseRead(n)}
                    className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Nudge Modal ── */}
      <Modal open={!!nudgeTarget} onClose={() => setNudgeTarget(null)}
        title={`Nudge Interviewers — ${nudgeTarget?.template?.name || "No template"} · ${fmtDate(selectedDate)}`} wide>
        {nudgeTarget && (
          <div className="space-y-5">
            {/* Matched interviewers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Select Interviewers ({selectedIvrs.size} selected)
                </p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedIvrs(new Set(nudgeTarget.matched.map(u => u.id)))}
                    className="text-xs text-indigo-600 hover:underline font-medium">Select all matched</button>
                  <button type="button" onClick={() => setSelectedIvrs(new Set())}
                    className="text-xs text-gray-400 hover:underline font-medium">Clear</button>
                </div>
              </div>

              {nudgeTarget.matched.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  No interviewers match the required skills. You can still select manually below.
                </p>
              ) : null}

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {activeInterviewers.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No active interviewers.</p>
                ) : activeInterviewers.map(u => {
                  const overlap = skillOverlap(nudgeTarget.template?.skills || [], u.skills || []);
                  const isMatch = overlap.length > 0 || !(nudgeTarget.template?.skills?.length);
                  return (
                    <label key={u.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${
                        selectedIvrs.has(u.id) ? "bg-indigo-50" : "hover:bg-gray-50"
                      }`}>
                      <input type="checkbox" checked={selectedIvrs.has(u.id)} onChange={() => toggleIvr(u.id)}
                        className="accent-indigo-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{u.displayName || u.email}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {isMatch && overlap.length > 0 && overlap.map(sid => (
                          <span key={sid} className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            {skills.find(s => s.id === sid)?.name || sid}
                          </span>
                        ))}
                        {!isMatch && (
                          <span className="text-[10px] text-gray-400">No match</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Message editor */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Message</p>
              <p className="text-xs text-gray-400 mb-2">Use <code className="bg-gray-100 px-1 rounded">{"{{name}}"}</code> — it will be replaced with each interviewer's name.</p>
              <textarea
                rows={8}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={sendNudge} disabled={sending || selectedIvrs.size === 0}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {sending ? "Sending…" : `Send to ${selectedIvrs.size} Interviewer${selectedIvrs.size !== 1 ? "s" : ""}`}
              </button>
              <button onClick={() => setNudgeTarget(null)}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
