import { useState, useEffect, useRef, useMemo } from "react";
import { formatDateShort } from "../../utils/dates";
import { parseInvitesCSV, downloadInviteSampleCSV, downloadInviteSampleExcel } from "../../utils/settingsCSV";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import {
  updateUser, deleteUser,
  createInvite, deleteInvite,
  subscribeToUsers, subscribeToInvites,
  subscribeToSkills, createSkill, updateSkill, deleteSkill,
  subscribeToPrograms, createProgram, updateProgram, deleteProgram,
  getTemplates, updateTemplate, getCandidates, updateCandidate,
} from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const BLANK_INVITE = { name: "", phone: "", email: "", role: "interviewer" };

const ROLE_OPTIONS = [
  { value: "interviewer",         label: "Interviewer",           desc: "Can conduct interviews and submit evaluations" },
  { value: "admin",               label: "Admin",                 desc: "Full access — manage interviews, candidates, users" },
  { value: "content_team",        label: "Content Team",          desc: "Access to Templates page only" },
  { value: "interviewer_content", label: "Interviewer + Content", desc: "Can conduct interviews AND access Templates" },
];

const ALL_ROLES = [
  { value: "interviewer",         label: "Interviewer" },
  { value: "admin",               label: "Admin" },
  { value: "content_team",        label: "Content Team" },
  { value: "interviewer_content", label: "Interviewer + Content" },
];


const SECTIONS = ["User Management", "General"];

const ROLE_GROUPS = [
  { value: "admin",               label: "Admin",                 dot: "bg-purple-400",  badge: "text-purple-700 bg-purple-50 border-purple-200" },
  { value: "interviewer",         label: "Interviewer",           dot: "bg-emerald-400", badge: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "interviewer_content", label: "Interviewer + Content", dot: "bg-teal-400",    badge: "text-teal-700 bg-teal-50 border-teal-200" },
  { value: "content_team",        label: "Content Team",          dot: "bg-blue-400",    badge: "text-blue-700 bg-blue-50 border-blue-200" },
];

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [activeSection, setActiveSection] = useState("User Management");

  // ── User Management state ─────────────────────────────────────────────────
  const [users,   setUsers]   = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [toast,   setToast]   = useState(null);

  const [pendingRoles, setPendingRoles] = useState({});

  const [skills,       setSkills]       = useState([]);
  const [newSkillName, setNewSkillName] = useState("");
  const [editingSkill, setEditingSkill] = useState(null);
  const [addingSkill,  setAddingSkill]  = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm,      setInviteForm]      = useState(BLANK_INVITE);
  const [inviteSaving,    setInviteSaving]    = useState(false);
  const [inviteError,     setInviteError]     = useState("");
  const [savedInvite,     setSavedInvite]     = useState(null);
  const [copiedId,        setCopiedId]        = useState(null);

  const [showCSV,      setShowCSV]      = useState(false);
  const [csvPreview,   setCsvPreview]   = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileRef = useRef();

  // ── Programs state ────────────────────────────────────────────────────────
  const [programs,      setPrograms]      = useState([]);
  const [addingProgram, setAddingProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [editingProgram, setEditingProgram] = useState(null);
  const [deletingProgram, setDeletingProgram] = useState(false);
  const newProgramRef = useRef(null);

  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };
    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });
    const unsubSkills  = subscribeToSkills(setSkills);
    const unsubPrograms = subscribeToPrograms(setPrograms);
    return () => { unsubUsers(); unsubInvites(); unsubSkills(); unsubPrograms(); };
  }, []);

  useEffect(() => {
    if (addingProgram) newProgramRef.current?.focus();
  }, [addingProgram]);

  // ── User Management handlers ──────────────────────────────────────────────
  const pending     = useMemo(() => users.filter(u => u.status === "pending"), [users]);
  const activeUsers = useMemo(() => users.filter(u => u.status === "active").sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    return (a.displayName || "").localeCompare(b.displayName || "");
  }), [users]);
  const pendingInvites = useMemo(() => invites.filter(i => i.status === "pending"), [invites]);

  const signupLink = (email) =>
    `${window.location.origin}/login?mode=signup&email=${encodeURIComponent(email)}`;

  const copyLink = (id, email) => {
    navigator.clipboard.writeText(signupLink(email));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const setSavingFor = (id, val) => setSaving(s => ({ ...s, [id]: val }));

  const approve = async (u) => {
    const role = pendingRoles[u.id] || "interviewer";
    const label = ALL_ROLES.find(r => r.value === role)?.label || role;
    setSavingFor(u.id, true);
    await updateUser(u.id, { role, status: "active" });
    setToast({ message: `${u.email} approved as ${label}.` });
    setSavingFor(u.id, false);
  };

  const reject = async (u) => {
    if (!confirm(`Delete ${u.email}'s account?`)) return;
    await deleteUser(u.id);
    setToast({ message: "Account deleted." });
  };

  const changeRole = async (u, newRole) => {
    if (u.role === newRole) return;
    const label = ALL_ROLES.find(r => r.value === newRole)?.label || newRole;
    if (!confirm(`Change ${u.displayName || u.email}'s role to "${label}"?`)) return;
    setSavingFor(u.id, true);
    await updateUser(u.id, { role: newRole });
    setToast({ message: `${u.displayName || u.email} is now ${label}.` });
    setSavingFor(u.id, false);
  };

  const revoke = async (u) => {
    if (!confirm(`Revoke access for ${u.email}? They will be moved to pending.`)) return;
    await updateUser(u.id, { status: "pending", role: null });
    setToast({ message: "Access revoked." });
  };

  const sendReset = async (u) => {
    try {
      await sendPasswordResetEmail(auth, u.email);
      setToast({ message: `Password reset email sent to ${u.email}.` });
    } catch {
      setToast({ message: "Failed to send reset email. Try again.", type: "error" });
    }
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

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseInvitesCSV(ev.target.result);
      const existingEmails = new Set(invites.filter(i => i.status === "pending").map(i => i.email));
      const filtered = rows.filter(r => !existingEmails.has(r.email));
      const skipped  = rows.length - filtered.length;
      setCsvPreview(filtered);
      setCsvErrors([
        ...errors,
        ...(skipped > 0 ? [`${skipped} row(s) skipped — already have pending invites`] : []),
      ]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCSVImport = async () => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    const results = await Promise.allSettled(csvPreview.map(row => createInvite(row)));
    const imported = results.filter(r => r.status === "fulfilled").length;
    setCsvImporting(false);
    setShowCSV(false);
    setCsvPreview([]);
    setCsvErrors([]);
    setToast({ message: `${imported} invite${imported !== 1 ? "s" : ""} sent.` });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); };

  const handleAddSkill = async () => {
    const name = newSkillName.trim();
    if (!name) return;
    await createSkill(name);
    setNewSkillName("");
    setAddingSkill(false);
  };

  const handleRenameSkill = async () => {
    if (!editingSkill?.name?.trim()) return;
    await updateSkill(editingSkill.id, editingSkill.name.trim());
    setEditingSkill(null);
  };

  const handleDeleteSkill = async (s) => {
    if (!confirm(`Delete skill "${s.name}"?`)) return;
    await deleteSkill(s.id);
    setToast({ message: `"${s.name}" removed.` });
  };

  // ── Programs handlers ─────────────────────────────────────────────────────
  const handleAddProgram = async () => {
    const name = newProgramName.trim();
    if (!name) return;
    await createProgram(name, programs.length);
    setNewProgramName("");
    setAddingProgram(false);
  };

  const handleRenameProgram = async () => {
    if (!editingProgram?.name?.trim()) return;
    await updateProgram(editingProgram.id, { name: editingProgram.name.trim() });
    setEditingProgram(null);
  };

  const handleDeleteProgram = async (p) => {
    setDeletingProgram(true);
    const [allTemplates, allCandidates] = await Promise.all([getTemplates(), getCandidates()]);
    setDeletingProgram(false);

    const affectedTemplates  = allTemplates.filter(t => t.program === p.id);
    const affectedCandidates = allCandidates.filter(c => c.program === p.id);

    const parts = [];
    if (affectedTemplates.length  > 0) parts.push(`${affectedTemplates.length} template(s)`);
    if (affectedCandidates.length > 0) parts.push(`${affectedCandidates.length} candidate(s)`);

    const msg = parts.length > 0
      ? `Delete "${p.name}"? ${parts.join(" and ")} will be moved to Unassigned.`
      : `Delete program "${p.name}"?`;

    if (!confirm(msg)) return;

    await Promise.all([
      ...affectedTemplates.map(t  => updateTemplate(t.id,  { program: "" })),
      ...affectedCandidates.map(c => updateCandidate(c.id, { program: "" })),
      deleteProgram(p.id),
    ]);

    setToast({ message: `"${p.name}" deleted.` });
  };

  // ── Role-grouped views ────────────────────────────────────────────────────
  const usersByRole = useMemo(() =>
    ROLE_GROUPS
      .map(g => ({ ...g, users: activeUsers.filter(u => u.role === g.value) }))
      .filter(g => g.users.length > 0),
  [activeUsers]);

  const pendingInvitesByRole = useMemo(() =>
    ROLE_GROUPS
      .map(g => ({ ...g, invites: pendingInvites.filter(i => i.role === g.value) }))
      .filter(g => g.invites.length > 0),
  [pendingInvites]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sectionTitle = (dot, label, count) => (
    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full inline-block ${dot}`} />
      {label}
      {count != null && count > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">{count}</span>
      )}
    </h2>
  );

  const roleBadge = (role) => {
    if (role === "admin") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
        </svg>
        Admin
      </span>
    );
    if (role === "content_team") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        Content Team
      </span>
    );
    if (role === "interviewer_content") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
        Interviewer + Content
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
        Interviewer
      </span>
    );
  };

  return (
    <div className="p-8 max-w-5xl">
      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, invitations, and programs</p>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex border-b border-gray-200 mb-8 gap-1">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeSection === s
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          USER MANAGEMENT SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSection === "User Management" && (
        <>
          {/* Action buttons */}
          <div className="flex justify-end gap-2 mb-8">
            <button
              onClick={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
            <button
              onClick={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); setInviteError(""); setShowInviteModal(true); }}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite
            </button>
          </div>

          {/* Pending Approval */}
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
                      {["Name", "Email", "Requested", "Assign Role", "Actions"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pending.map(u => (
                      <tr key={u.id} className="hover:bg-amber-50">
                        <td className="px-4 py-3 font-semibold text-gray-900">{u.displayName || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{u.createdAt ? formatDateShort(u.createdAt) : "—"}</td>
                        <td className="px-4 py-3">
                          <select
                            value={pendingRoles[u.id] || "interviewer"}
                            onChange={e => setPendingRoles(s => ({ ...s, [u.id]: e.target.value }))}
                            disabled={saving[u.id]}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer">
                            {ALL_ROLES.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>
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

          {/* All Active Users — grouped by role */}
          <div className="mb-8">
            {sectionTitle("bg-emerald-500", "All Users", activeUsers.length)}
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Loading…</div>
            ) : activeUsers.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No active users yet.</div>
            ) : (
              <div className="space-y-4">
                {usersByRole.map(group => (
                  <div key={group.value} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{group.label}</span>
                      <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-white border border-gray-200 text-gray-500 rounded-full">{group.users.length}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {["Name", "Email", "Change Role", "Actions"].map(h => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{u.displayName || "—"}</span>
                                {u.id === currentUser?.uid && (
                                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">You</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.email}</td>
                            <td className="px-4 py-3">
                              {u.id === currentUser?.uid ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : (
                                <select
                                  value={u.role || "interviewer"}
                                  disabled={saving[u.id]}
                                  onChange={e => changeRole(u, e.target.value)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer">
                                  {ALL_ROLES.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3 whitespace-nowrap">
                                <button onClick={() => sendReset(u)}
                                  className="text-xs text-indigo-600 font-medium hover:underline">
                                  Send reset
                                </button>
                                {u.id !== currentUser?.uid && (
                                  <button onClick={() => revoke(u)} disabled={saving[u.id]}
                                    className="text-xs text-red-500 font-medium hover:underline disabled:opacity-40">
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invited — grouped by role, only pending (awaiting signup) */}
          {(pendingInvites.length > 0 || loading) && (
            <div className="mb-8">
              {sectionTitle("bg-indigo-400", "Invited — Awaiting Signup", pendingInvites.length > 0 ? pendingInvites.length : null)}
              {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Loading…</div>
              ) : pendingInvitesByRole.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">No pending invites.</div>
              ) : (
                <div className="space-y-4">
                  {pendingInvitesByRole.map(group => (
                    <div key={group.value} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{group.label}</span>
                        <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-white border border-gray-200 text-gray-500 rounded-full">{group.invites.length}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {["Name", "Phone", "Email", "Invited On", "Actions"].map(h => (
                              <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-2.5">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {group.invites.map(inv => (
                            <tr key={inv.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-900">{inv.name || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{inv.phone || "—"}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{inv.email}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{inv.createdAt ? formatDateShort(inv.createdAt) : "—"}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3 whitespace-nowrap">
                                  <button onClick={() => copyLink(inv.id, inv.email)}
                                    className={`text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${copiedId === inv.id ? "text-emerald-600" : "text-indigo-600 hover:text-indigo-800"}`}>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={copiedId === inv.id ? "M5 13l4 4L19 7" : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                                    </svg>
                                    {copiedId === inv.id ? "Copied!" : "Copy link"}
                                  </button>
                                  <button onClick={() => handleRemoveInvite(inv)}
                                    className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors whitespace-nowrap">
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          GENERAL SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSection === "General" && (
        <div>
          {/* Skills */}
          <div className="mb-8">
            {sectionTitle("bg-violet-400", "Skills")}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-400 mb-4">These skills are shared across templates and interviewer profiles for matching.</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {skills.map(s => (
                  <div key={s.id} className="group flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full pl-3 pr-1 py-0.5">
                    {editingSkill?.id === s.id ? (
                      <input
                        autoFocus
                        value={editingSkill.name}
                        onChange={e => setEditingSkill(x => ({ ...x, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameSkill(); if (e.key === "Escape") setEditingSkill(null); }}
                        onBlur={handleRenameSkill}
                        className="text-xs font-semibold text-indigo-700 bg-transparent border-b border-indigo-400 focus:outline-none w-24"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-indigo-700">{s.name}</span>
                    )}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button onClick={() => setEditingSkill({ id: s.id, name: s.name })}
                        className="p-0.5 text-indigo-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                      </button>
                      <button onClick={() => handleDeleteSkill(s)}
                        className="p-0.5 text-indigo-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 font-bold text-sm leading-none">×</button>
                    </div>
                  </div>
                ))}
                {addingSkill ? (
                  <input
                    autoFocus
                    value={newSkillName}
                    onChange={e => setNewSkillName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddSkill(); if (e.key === "Escape") { setAddingSkill(false); setNewSkillName(""); } }}
                    onBlur={() => { if (!newSkillName.trim()) { setAddingSkill(false); setNewSkillName(""); } }}
                    placeholder="Skill name…"
                    className="text-xs border border-indigo-400 rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-36"
                  />
                ) : (
                  <button onClick={() => setAddingSkill(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-dashed border-indigo-300 rounded-full px-3 py-1 hover:bg-indigo-50 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Add Skill
                  </button>
                )}
              </div>
              {skills.length === 0 && !addingSkill && (
                <p className="text-xs text-gray-400">No skills defined yet. Click "Add Skill" to create the first one.</p>
              )}
            </div>
          </div>

          {/* Programs */}
          <div className="mb-6">
            {sectionTitle("bg-indigo-400", "Programs")}
            <p className="text-xs text-gray-400 mb-4">Programs group templates and candidates. They are used as filter tabs across the app.</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {programs.length === 0 && !addingProgram ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-sm text-gray-400">No programs yet.</p>
                <button onClick={() => setAddingProgram(true)}
                  className="text-sm font-semibold text-indigo-600 hover:underline">
                  Create the first program →
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {programs.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 group">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    {editingProgram?.id === p.id ? (
                      <input
                        autoFocus
                        value={editingProgram.name}
                        onChange={e => setEditingProgram(s => ({ ...s, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameProgram(); if (e.key === "Escape") setEditingProgram(null); }}
                        onBlur={handleRenameProgram}
                        className="flex-1 text-sm border-b border-indigo-400 focus:outline-none bg-transparent text-gray-900 font-medium"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium text-gray-900">{p.name}</span>
                    )}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingProgram({ id: p.id, name: p.name })}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="Rename">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteProgram(p)}
                        disabled={deletingProgram}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete program">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add program row */}
            <div className="px-5 py-3 border-t border-gray-100">
              {addingProgram ? (
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-indigo-300 flex-shrink-0" />
                  <input
                    ref={newProgramRef}
                    value={newProgramName}
                    onChange={e => setNewProgramName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddProgram(); if (e.key === "Escape") { setAddingProgram(false); setNewProgramName(""); } }}
                    onBlur={() => { if (!newProgramName.trim()) { setAddingProgram(false); setNewProgramName(""); } }}
                    placeholder="Program name…"
                    className="flex-1 text-sm border-b border-indigo-400 focus:outline-none bg-transparent text-gray-900"
                  />
                  <button onClick={handleAddProgram}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1">
                    Add
                  </button>
                  <button onClick={() => { setAddingProgram(false); setNewProgramName(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-1">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setAddingProgram(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                  Add Program
                </button>
              )}
            </div>
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

      {/* ── CSV Import Modal ── */}
      <Modal open={showCSV} onClose={closeCSV} title="Import Invites from CSV" wide>
        <div className="space-y-5">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Template format</p>
            <p className="text-xs text-gray-400 mb-1">Columns: name, phone, email, role</p>
            <p className="text-xs text-gray-400 mb-3">Valid roles: <span className="font-mono">interviewer</span>, <span className="font-mono">admin</span>, <span className="font-mono">content_team</span> (defaults to interviewer if blank/invalid)</p>
            <div className="flex gap-2">
              <button onClick={downloadInviteSampleExcel}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Excel (.xlsx)
              </button>
              <button onClick={downloadInviteSampleCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
            <p className="text-xs text-gray-400">.csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
          </div>

          {csvErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Notes</p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-amber-600">• {e}</p>)}
            </div>
          )}

          {csvPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{csvPreview.length} invites ready to send</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {["Name", "Email", "Phone", "Role"].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvPreview.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{r.email}</td>
                        <td className="px-3 py-2 text-gray-600">{r.phone || "—"}</td>
                        <td className="px-3 py-2">{roleBadge(r.role)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={closeCSV}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleCSVImport} disabled={csvImporting || csvPreview.length === 0}
              className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {csvImporting ? "Sending…" : `Send ${csvPreview.length || ""} Invites`}
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
