import { useState, useEffect, useRef, useMemo } from "react";
import UserManagementTab from "../../features/settings/UserManagementTab";
import GeneralTab from "../../features/settings/GeneralTab";
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
import { usePagination } from "../../hooks/usePagination";

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

  // ── Set phone modal ────────────────────────────────────────────────────────
  const [phoneModal,    setPhoneModal]    = useState(null); // user object | null
  const [phoneInput,    setPhoneInput]    = useState("");
  const [phoneSaving,   setPhoneSaving]   = useState(false);

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

  const [userRoleFilter,   setUserRoleFilter]   = useState("");
  const [inviteRoleFilter, setInviteRoleFilter] = useState("");

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
  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };
    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });
    const unsubSkills  = subscribeToSkills(setSkills);
    const unsubPrograms = subscribeToPrograms(setPrograms);
    return () => { unsubUsers(); unsubInvites(); unsubSkills(); unsubPrograms(); };
  }, []);

  // ── User Management handlers ──────────────────────────────────────────────
  const pending     = useMemo(() => users.filter(u => u.status === "pending"), [users]);
  const activeUsers = useMemo(() => users.filter(u => u.status === "active").sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    return (a.displayName || "").localeCompare(b.displayName || "");
  }), [users]);
  const pendingInvites = useMemo(() => invites.filter(i => i.status === "pending"), [invites]);

  const filteredUsers = useMemo(() => {
    const all = [...pending, ...activeUsers];
    if (!userRoleFilter) return all;
    if (userRoleFilter === "pending") return pending;
    return activeUsers.filter(u => u.role === userRoleFilter);
  }, [pending, activeUsers, userRoleFilter]);

  const filteredInvites = useMemo(() => {
    if (!inviteRoleFilter) return pendingInvites;
    return pendingInvites.filter(i => i.role === inviteRoleFilter);
  }, [pendingInvites, inviteRoleFilter]);

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

  const openPhoneModal = (u) => { setPhoneModal(u); setPhoneInput(u.phone || ""); };
  const handleSetPhone = async (e) => {
    e.preventDefault();
    setPhoneSaving(true);
    try {
      await updateUser(phoneModal.id, { phone: phoneInput.trim() || null });
      setToast({ message: `Phone updated for ${phoneModal.displayName || phoneModal.email}.` });
      setPhoneModal(null);
    } catch {
      setToast({ message: "Failed to update phone. Try again.", type: "error" });
    }
    setPhoneSaving(false);
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

  const usersPagination   = usePagination(filteredUsers,   10);
  const invitesPagination = usePagination(filteredInvites, 10);

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
        <UserManagementTab
          loading={loading}
          filteredUsers={filteredUsers} usersPagination={usersPagination}
          filteredInvites={filteredInvites} invitesPagination={invitesPagination} pendingInvites={pendingInvites}
          userRoleFilter={userRoleFilter} setUserRoleFilter={setUserRoleFilter}
          inviteRoleFilter={inviteRoleFilter} setInviteRoleFilter={setInviteRoleFilter}
          activeUsers={activeUsers} pending={pending}
          pendingRoles={pendingRoles} setPendingRoles={setPendingRoles}
          saving={saving}
          currentUser={currentUser}
          copiedId={copiedId} copyLink={copyLink}
          approve={approve} reject={reject} changeRole={changeRole} revoke={revoke}
          sendReset={sendReset} openPhoneModal={openPhoneModal}
          handleRemoveInvite={handleRemoveInvite}
          onOpenInviteModal={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); setInviteError(""); setShowInviteModal(true); }}
          onOpenCSV={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}
        />
      )}


      {activeSection === "General" && (
        <GeneralTab
          skills={skills} programs={programs}
          addingSkill={addingSkill} setAddingSkill={setAddingSkill}
          newSkillName={newSkillName} setNewSkillName={setNewSkillName}
          editingSkill={editingSkill} setEditingSkill={setEditingSkill}
          handleAddSkill={handleAddSkill} handleRenameSkill={handleRenameSkill}
          handleDeleteSkill={handleDeleteSkill}
          addingProgram={addingProgram} setAddingProgram={setAddingProgram}
          newProgramName={newProgramName} setNewProgramName={setNewProgramName}
          editingProgram={editingProgram} setEditingProgram={setEditingProgram}
          handleAddProgram={handleAddProgram} handleRenameProgram={handleRenameProgram}
          handleDeleteProgram={handleDeleteProgram} deletingProgram={deletingProgram}
        />
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

      {/* ── Set phone modal ── */}
      <Modal open={!!phoneModal} onClose={() => setPhoneModal(null)} title="Set Phone Number">
        {phoneModal && (
          <form onSubmit={handleSetPhone} className="space-y-4">
            <p className="text-sm text-gray-600">
              Set a phone number for <strong>{phoneModal.displayName || phoneModal.email}</strong>.
              Once saved, they can use OTP-based password recovery from the login page.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                autoFocus
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Include country code, e.g. +91 for India. Leave blank to remove the phone number.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={phoneSaving}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {phoneSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setPhoneModal(null)}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
