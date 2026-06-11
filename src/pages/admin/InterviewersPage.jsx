import { useState, useEffect } from "react";
import {
  updateUser, deleteUser, getInterviewerAvailability,
  createInvite, deleteInvite,
  subscribeToUsers, subscribeToInvites,
} from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const BLANK_INVITE = { name: "", phone: "", email: "" };

export default function InterviewersPage() {
  const { currentUser } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [viewAvail, setViewAvail] = useState(null);
  const [saving,   setSaving]   = useState({});

  // invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm,      setInviteForm]      = useState(BLANK_INVITE);
  const [inviteSaving,    setInviteSaving]    = useState(false);
  const [inviteError,     setInviteError]     = useState("");
  const [savedInvite,     setSavedInvite]     = useState(null); // invite just created → show link
  const [copiedId,        setCopiedId]        = useState(null);

  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };

    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });

    return () => { unsubUsers(); unsubInvites(); };
  }, []);

  const pending      = users.filter(u => u.status === "pending");
  const interviewers = users.filter(u => u.role === "interviewer" && u.status === "active");
  const admins       = users.filter(u => u.role === "admin" && u.status === "active");

  const signupLink = (email) =>
    `${window.location.origin}/login?mode=signup&email=${encodeURIComponent(email)}`;

  const copyLink = (id, email) => {
    navigator.clipboard.writeText(signupLink(email));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviteError("");
    if (!inviteForm.name.trim()) { setInviteError("Name is required."); return; }
    if (!inviteForm.email.trim()) { setInviteError("Email is required."); return; }
    const alreadyInvited = invites.find(
      i => i.email === inviteForm.email.toLowerCase().trim() && i.status === "pending"
    );
    if (alreadyInvited) { setInviteError("This email already has a pending invite."); return; }
    setInviteSaving(true);
    try {
      const id = await createInvite(inviteForm);
      const created = { id, ...inviteForm, email: inviteForm.email.toLowerCase().trim(), status: "pending", createdAt: new Date().toISOString() };
      setSavedInvite(created);
      setInviteForm(BLANK_INVITE);
    } catch {
      setInviteError("Failed to save invite. Try again.");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleRemoveInvite = async (invite) => {
    if (!confirm(`Remove invite for ${invite.email}?`)) return;
    await deleteInvite(invite.id);
    setToast({ message: "Invite removed." });
  };

  const approve = async (user) => {
    setSaving(s => ({ ...s, [user.id]: true }));
    await updateUser(user.id, { role: "interviewer", status: "active" });
    setToast({ message: `${user.email} approved as Interviewer.` });
    setSaving(s => ({ ...s, [user.id]: false }));
  };

  const reject = async (user) => {
    if (!confirm(`Delete ${user.email}'s account?`)) return;
    await deleteUser(user.id);
    setToast({ message: "Account deleted." });
  };

  const revoke = async (user) => {
    if (!confirm(`Revoke access for ${user.email}?`)) return;
    await updateUser(user.id, { status: "pending", role: null });
    setToast({ message: "Access revoked." });
  };

  const promoteToAdmin = async (user) => {
    if (!confirm(`Give admin access to ${user.displayName || user.email}? They will be able to manage all interviews, candidates, and users.`)) return;
    setSaving(s => ({ ...s, [user.id]: true }));
    await updateUser(user.id, { role: "admin" });
    setToast({ message: `${user.displayName || user.email} is now an admin.` });
    setSaving(s => ({ ...s, [user.id]: false }));
  };

  const demoteToInterviewer = async (user) => {
    if (user.id === currentUser?.uid) {
      setToast({ message: "You cannot remove your own admin access.", type: "error" });
      return;
    }
    if (!confirm(`Remove admin access for ${user.displayName || user.email}? They will become a regular interviewer.`)) return;
    setSaving(s => ({ ...s, [user.id]: true }));
    await updateUser(user.id, { role: "interviewer" });
    setToast({ message: `${user.displayName || user.email} is now an interviewer.` });
    setSaving(s => ({ ...s, [user.id]: false }));
  };

  const viewAvailability = async (user) => {
    const slots = await getInterviewerAvailability(user.id);
    setViewAvail({ user, slots });
  };

  const today = new Date().toISOString().slice(0, 10);

  const pendingInvites     = invites.filter(i => i.status === "pending");
  const registeredInvites  = invites.filter(i => i.status === "registered");

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Interviewers</h1>
          <p className="text-sm text-gray-500">
            {interviewers.length} active · {pending.length} pending approval · {pendingInvites.length} invited
          </p>
        </div>
        <button
          onClick={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); setInviteError(""); setShowInviteModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite Interviewer
        </button>
      </div>

      {/* Pending approvals — always visible */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full inline-block ${pending.length > 0 ? "bg-amber-400" : "bg-gray-300"}`} />
          Pending Approval
          {pending.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
              {pending.length}
            </span>
          )}
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">No pending sign-ups right now.</p>
              <p className="text-xs text-gray-300">New interviewers who register will appear here for approval.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Email", "Requested", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pending.map(u => (
                  <tr key={u.id} className="hover:bg-amber-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{u.displayName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => approve(u)} disabled={saving[u.id]}
                          className="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-600 disabled:opacity-60 transition-colors">
                          {saving[u.id] ? "Approving…" : "Approve"}
                        </button>
                        <button onClick={() => reject(u)}
                          className="text-xs text-red-500 font-medium hover:underline">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Admins section */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-500 rounded-full inline-block" />
          Admins ({admins.length})
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Email", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {admins.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{u.displayName || "—"}</span>
                        {u.id === currentUser?.uid && (
                          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.id !== currentUser?.uid && (
                        <button onClick={() => demoteToInterviewer(u)} disabled={saving[u.id]}
                          className="text-xs text-gray-500 font-medium hover:text-orange-600 hover:underline disabled:opacity-60">
                          {saving[u.id] ? "Updating…" : "Make Interviewer"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Active interviewers */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
          Active Interviewers ({interviewers.length})
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
          ) : interviewers.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">No active interviewers yet. Approve sign-ups above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Email", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {interviewers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{u.displayName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => viewAvailability(u)}
                          className="text-xs text-indigo-600 font-medium hover:underline">Availability</button>
                        <button onClick={() => promoteToAdmin(u)} disabled={saving[u.id]}
                          className="text-xs text-purple-600 font-medium hover:underline disabled:opacity-60">
                          {saving[u.id] ? "Updating…" : "Make Admin"}
                        </button>
                        <button onClick={() => revoke(u)}
                          className="text-xs text-red-500 font-medium hover:underline">Revoke</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Invites section */}
      {invites.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Invited
            {pendingInvites.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full">
                {pendingInvites.length} awaiting signup
              </span>
            )}
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Phone", "Email", "Invited On", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invites.map(inv => (
                  <tr key={inv.id} className={`hover:bg-gray-50 ${inv.status === "registered" ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{inv.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{inv.email}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      {inv.status === "registered" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Registered
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Awaiting signup</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 items-center">
                        {inv.status === "pending" && (
                          <button onClick={() => copyLink(inv.id, inv.email)}
                            className={`text-xs font-medium transition-colors flex items-center gap-1 ${copiedId === inv.id ? "text-emerald-600" : "text-indigo-600 hover:text-indigo-800"}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={copiedId === inv.id ? "M5 13l4 4L19 7" : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                            </svg>
                            {copiedId === inv.id ? "Copied!" : "Copy link"}
                          </button>
                        )}
                        <button onClick={() => handleRemoveInvite(inv)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite modal */}
      <Modal open={showInviteModal} onClose={() => { setShowInviteModal(false); setSavedInvite(null); }} title="Invite Interviewer">
        {savedInvite ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Invite saved!</p>
              <p className="text-sm text-gray-500 text-center">Share this link with <strong>{savedInvite.name}</strong>. When they sign up using this link, they'll be automatically approved as an interviewer.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signup link</p>
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="flex-1 text-xs font-mono text-gray-700 break-all">{signupLink(savedInvite.email)}</p>
                <button
                  onClick={() => copyLink(savedInvite.id, savedInvite.email)}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copiedId === savedInvite.id ? "bg-emerald-100 text-emerald-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={copiedId === savedInvite.id ? "M5 13l4 4L19 7" : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                  </svg>
                  {copiedId === savedInvite.id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); }}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Invite another
              </button>
              <button onClick={() => { setShowInviteModal(false); setSavedInvite(null); }}
                className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Full Name <span className="text-red-400">*</span></label>
              <input type="text" value={inviteForm.name} placeholder="e.g. Rahul Sharma"
                onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Phone Number</label>
              <input type="tel" value={inviteForm.phone} placeholder="e.g. +91 98765 43210"
                onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email <span className="text-red-400">*</span></label>
              <input type="email" value={inviteForm.email} placeholder="interviewer@example.com"
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {inviteError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{inviteError}</p>}
            <p className="text-xs text-gray-400">After saving, you'll get a signup link to share with the interviewer.</p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowInviteModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={inviteSaving}
                className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                {inviteSaving ? "Saving…" : "Save & Get Link"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Availability modal */}
      <Modal open={!!viewAvail} onClose={() => setViewAvail(null)}
        title={viewAvail ? `${viewAvail.user.displayName || viewAvail.user.email} — Availability` : ""} wide>
        {viewAvail && (() => {
          const upcoming = viewAvail.slots.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
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
