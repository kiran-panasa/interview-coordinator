import { useState, useEffect } from "react";
import {
  updateUser, deleteUser,
  createInvite, deleteInvite,
  subscribeToUsers, subscribeToInvites,
} from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const BLANK_INVITE = { name: "", phone: "", email: "", role: "interviewer" };

const ROLE_OPTIONS = [
  { value: "interviewer",   label: "Interviewer",   desc: "Can conduct interviews and submit evaluations" },
  { value: "admin",         label: "Admin",         desc: "Full access — manage interviews, candidates, users" },
  { value: "content_team",  label: "Content Team",  desc: "Access to Templates page only" },
];

export default function AdminPanelPage() {
  const { currentUser } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [toast,   setToast]   = useState(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm,      setInviteForm]      = useState(BLANK_INVITE);
  const [inviteSaving,    setInviteSaving]    = useState(false);
  const [inviteError,     setInviteError]     = useState("");
  const [savedInvite,     setSavedInvite]     = useState(null);
  const [copiedId,        setCopiedId]        = useState(null);

  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };
    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });
    return () => { unsubUsers(); unsubInvites(); };
  }, []);

  const pending     = users.filter(u => u.status === "pending");
  const activeUsers = users.filter(u => u.status === "active").sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    return (a.displayName || "").localeCompare(b.displayName || "");
  });
  const pendingInvites = invites.filter(i => i.status === "pending");

  const signupLink = (email) =>
    `${window.location.origin}/login?mode=signup&email=${encodeURIComponent(email)}`;

  const copyLink = (id, email) => {
    navigator.clipboard.writeText(signupLink(email));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const setSavingFor = (id, val) => setSaving(s => ({ ...s, [id]: val }));

  const approve = async (u) => {
    setSavingFor(u.id, true);
    await updateUser(u.id, { role: "interviewer", status: "active" });
    setToast({ message: `${u.email} approved as Interviewer.` });
    setSavingFor(u.id, false);
  };

  const reject = async (u) => {
    if (!confirm(`Delete ${u.email}'s account?`)) return;
    await deleteUser(u.id);
    setToast({ message: "Account deleted." });
  };

  const promoteToAdmin = async (u) => {
    if (!confirm(`Give admin access to ${u.displayName || u.email}?`)) return;
    setSavingFor(u.id, true);
    await updateUser(u.id, { role: "admin" });
    setToast({ message: `${u.displayName || u.email} is now an admin.` });
    setSavingFor(u.id, false);
  };

  const demoteToInterviewer = async (u) => {
    if (u.id === currentUser?.uid) {
      setToast({ message: "You cannot remove your own admin access.", type: "error" });
      return;
    }
    if (!confirm(`Remove admin access for ${u.displayName || u.email}?`)) return;
    setSavingFor(u.id, true);
    await updateUser(u.id, { role: "interviewer" });
    setToast({ message: `${u.displayName || u.email} is now an interviewer.` });
    setSavingFor(u.id, false);
  };

  const revoke = async (u) => {
    if (!confirm(`Revoke access for ${u.email}?`)) return;
    await updateUser(u.id, { status: "pending", role: null });
    setToast({ message: "Access revoked." });
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

  const sectionTitle = (dot, label, count) => (
    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full inline-block ${dot}`} />
      {label}
      {count != null && count > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">{count}</span>
      )}
    </h2>
  );

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, and invitations</p>
        </div>
        <button
          onClick={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); setInviteError(""); setShowInviteModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite
        </button>
      </div>

      {/* ── Pending Approval ── */}
      <div className="mb-8">
        {sectionTitle(
          pending.length > 0 ? "bg-amber-400" : "bg-gray-300",
          "Pending Approval",
          pending.length
        )}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">No pending sign-ups right now.</p>
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
                        <button onClick={() => reject(u)} className="text-xs text-red-500 font-medium hover:underline">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── All Active Users ── */}
      <div className="mb-8">
        {sectionTitle("bg-emerald-500", "All Users", activeUsers.length)}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : activeUsers.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No active users yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Email", "Role", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeUsers.map(u => (
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
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                          </svg>
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                          Interviewer
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        {u.role === "admin" && u.id !== currentUser?.uid && (
                          <button onClick={() => demoteToInterviewer(u)} disabled={saving[u.id]}
                            className="text-xs text-gray-500 font-medium hover:text-orange-600 hover:underline disabled:opacity-60">
                            {saving[u.id] ? "Updating…" : "Make Interviewer"}
                          </button>
                        )}
                        {u.role === "interviewer" && (
                          <>
                            <button onClick={() => promoteToAdmin(u)} disabled={saving[u.id]}
                              className="text-xs text-purple-600 font-medium hover:underline disabled:opacity-60">
                              {saving[u.id] ? "Updating…" : "Make Admin"}
                            </button>
                            <button onClick={() => revoke(u)}
                              className="text-xs text-red-500 font-medium hover:underline">Revoke</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Invites ── */}
      {(invites.length > 0 || loading) && (
        <div className="mb-8">
          {sectionTitle("bg-indigo-400", "Invited", pendingInvites.length > 0 ? pendingInvites.length : null)}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* ── Invite Modal ── */}
      <Modal open={showInviteModal} onClose={() => { setShowInviteModal(false); setSavedInvite(null); }} title="Invite">
        {savedInvite ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Invite saved!</p>
              <p className="text-sm text-gray-500 text-center">
                Share this link with <strong>{savedInvite.name}</strong>. They'll be registered as{" "}
                <strong>{ROLE_OPTIONS.find(r => r.value === savedInvite.role)?.label || "Interviewer"}</strong>.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signup link</p>
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="flex-1 text-xs font-mono text-gray-700 break-all">{signupLink(savedInvite.email)}</p>
                <button onClick={() => copyLink(savedInvite.id, savedInvite.email)}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copiedId === savedInvite.id ? "bg-emerald-100 text-emerald-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
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
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Role <span className="text-red-400">*</span></label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${inviteForm.role === opt.value ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                    <input type="radio" name="invite-role" value={opt.value} checked={inviteForm.role === opt.value}
                      onChange={() => setInviteForm(f => ({ ...f, role: opt.value }))}
                      className="mt-0.5 accent-indigo-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
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

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
