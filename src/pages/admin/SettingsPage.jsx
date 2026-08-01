import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, SlidersHorizontal, Shield, ShieldCheck, BookOpen, Sparkles, User as UserIcon,
  CheckCircle2, Copy, Check, FileSpreadsheet, FileText, UploadCloud, CalendarOff,
} from "lucide-react";
import UserManagementTab from "../../features/settings/UserManagementTab";
import GeneralTab from "../../features/settings/GeneralTab";
import BlockedDatesTab from "../../features/settings/BlockedDatesTab";
import PreInterviewResourcesTab from "../../features/settings/PreInterviewResourcesTab";
import InterviewIntegrityTab from "../../features/settings/InterviewIntegrityTab";
import { parseInvitesCSV, downloadInviteSampleCSV, downloadInviteSampleExcel } from "../../utils/settingsCSV";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import {
  updateUser,
  createInvite, deleteInvite,
  subscribeToUsers, subscribeToInvites,
  subscribeToSkills, createSkill, updateSkill, deleteSkill,
  subscribeToPrograms, createProgram, updateProgram, deleteProgram,
  getTemplates, updateTemplate, getCandidates, updateCandidate,
  subscribeToBlockedDates, createBlockedDate, updateBlockedDate, deleteBlockedDate,
} from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import DatePicker from "../../components/DatePicker";
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


const SECTIONS = [
  { value: "User Management",          icon: Users },
  { value: "General",                  icon: SlidersHorizontal },
  { value: "Blocked Dates",            icon: CalendarOff },
  { value: "Pre-Interview Resources",  icon: FileText },
  { value: "Interview Integrity",      icon: ShieldCheck },
];

const BLANK_BLOCK = { startDate: "", endDate: "", reason: "" };

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
  const [userSearch,       setUserSearch]       = useState("");
  const [inviteSearch,     setInviteSearch]     = useState("");

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

  // ── Blocked Dates state ───────────────────────────────────────────────────
  const [blockedDates,    setBlockedDates]    = useState([]);
  const [showBlockModal,  setShowBlockModal]  = useState(false);
  const [blockEditTarget, setBlockEditTarget] = useState(null); // null = new
  const [blockForm,       setBlockForm]       = useState(BLANK_BLOCK);
  const [blockSaving,     setBlockSaving]     = useState(false);

  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };
    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });
    const unsubSkills  = subscribeToSkills(setSkills);
    const unsubPrograms = subscribeToPrograms(setPrograms);
    const unsubBlocked  = subscribeToBlockedDates(setBlockedDates);
    return () => { unsubUsers(); unsubInvites(); unsubSkills(); unsubPrograms(); unsubBlocked(); };
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
    let result = !userRoleFilter ? all
      : userRoleFilter === "pending" ? pending
      : activeUsers.filter(u => u.role === userRoleFilter);
    const q = userSearch.trim().toLowerCase();
    if (q) result = result.filter(u =>
      (u.displayName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
    );
    return result;
  }, [pending, activeUsers, userRoleFilter, userSearch]);

  const filteredInvites = useMemo(() => {
    let result = !inviteRoleFilter ? pendingInvites : pendingInvites.filter(i => i.role === inviteRoleFilter);
    const q = inviteSearch.trim().toLowerCase();
    if (q) result = result.filter(i =>
      (i.name || "").toLowerCase().includes(q) || (i.email || "").toLowerCase().includes(q)
    );
    return result;
  }, [pendingInvites, inviteRoleFilter, inviteSearch]);

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
    if (!confirm(`Reject and archive ${u.email}'s account?\n\nThey will lose access but their record is preserved.`)) return;
    await updateUser(u.id, { status: "archived", archivedAt: new Date().toISOString() });
    setToast({ message: "Account rejected and archived." });
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

  // ── Blocked Dates handlers ────────────────────────────────────────────────
  const openNewBlock = () => {
    setBlockEditTarget(null);
    setBlockForm(BLANK_BLOCK);
    setShowBlockModal(true);
  };
  const openEditBlock = (b) => {
    setBlockEditTarget(b);
    setBlockForm({ startDate: b.startDate, endDate: b.endDate, reason: b.reason || "" });
    setShowBlockModal(true);
  };
  const handleSaveBlock = async () => {
    if (!blockForm.startDate) return setToast({ message: "Pick a start date.", type: "error" });
    const endDate = blockForm.endDate || blockForm.startDate;
    if (endDate < blockForm.startDate) return setToast({ message: "End date can't be before the start date.", type: "error" });
    if (!blockForm.reason.trim()) return setToast({ message: "Please add a reason for blocking these dates.", type: "error" });
    setBlockSaving(true);
    try {
      const data = { startDate: blockForm.startDate, endDate, reason: blockForm.reason.trim() };
      if (blockEditTarget) {
        await updateBlockedDate(blockEditTarget.id, data);
        setToast({ message: "Blocked dates updated." });
      } else {
        await createBlockedDate({ ...data, createdBy: currentUser.uid });
        setToast({ message: "Dates blocked." });
      }
      setShowBlockModal(false);
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setBlockSaving(false);
  };
  const handleDeleteBlock = async (b) => {
    const label = b.startDate === b.endDate ? b.startDate : `${b.startDate} – ${b.endDate}`;
    if (!confirm(`Unblock ${label}? Interviewers and candidates will be able to use these dates again.`)) return;
    try {
      await deleteBlockedDate(b.id);
      setToast({ message: "Dates unblocked." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const usersPagination   = usePagination(filteredUsers,   10);
  const invitesPagination = usePagination(filteredInvites, 10);

  const roleBadge = (role) => {
    if (role === "admin") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
        <Shield className="w-2.5 h-2.5" />
        Admin
      </span>
    );
    if (role === "content_team") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        <BookOpen className="w-2.5 h-2.5" />
        Content Team
      </span>
    );
    if (role === "interviewer_content") return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
        <Sparkles className="w-2.5 h-2.5" />
        Interviewer + Content
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <UserIcon className="w-2.5 h-2.5" />
        Interviewer
      </span>
    );
  };

  return (
    <div className="p-8 max-w-5xl">
      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, roles, invitations, and programs</p>
      </motion.div>

      {/* ── Section tabs ── */}
      <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-xl mb-8">
        {SECTIONS.map(s => (
          <button key={s.value} onClick={() => setActiveSection(s.value)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeSection === s.value
                ? "bg-white text-brand-600 shadow-soft"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            <s.icon className="w-4 h-4" />
            {s.value}
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
          userSearch={userSearch} setUserSearch={setUserSearch}
          inviteSearch={inviteSearch} setInviteSearch={setInviteSearch}
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

      {activeSection === "Blocked Dates" && (
        <BlockedDatesTab
          blockedDates={blockedDates}
          onAdd={openNewBlock} onEdit={openEditBlock} onDelete={handleDeleteBlock}
        />
      )}

      {activeSection === "Pre-Interview Resources" && <PreInterviewResourcesTab />}

      {activeSection === "Interview Integrity" && <InterviewIntegrityTab />}

      {/* ── Invite Modal ── */}
      <Modal open={showInviteModal} onClose={() => { setShowInviteModal(false); setSavedInvite(null); }} title="Invite">
        {savedInvite ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
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
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copiedId === savedInvite.id ? "bg-emerald-100 text-emerald-700" : "bg-brand-600 text-white hover:bg-brand-700"}`}>
                  {copiedId === savedInvite.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === savedInvite.id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setSavedInvite(null); setInviteForm(BLANK_INVITE); }}>
                Invite another
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => { setShowInviteModal(false); setSavedInvite(null); }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Full Name <span className="text-red-400">*</span></label>
              <input type="text" value={inviteForm.name} placeholder="e.g. Rahul Sharma"
                onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Phone Number</label>
              <input type="tel" value={inviteForm.phone} placeholder="e.g. +91 98765 43210"
                onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email <span className="text-red-400">*</span></label>
              <input type="email" value={inviteForm.email} placeholder="interviewer@example.com"
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Role <span className="text-red-400">*</span></label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${inviteForm.role === opt.value ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                    <input type="radio" name="invite-role" value={opt.value} checked={inviteForm.role === opt.value}
                      onChange={() => setInviteForm(f => ({ ...f, role: opt.value }))}
                      className="mt-0.5 accent-brand-600 flex-shrink-0" />
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
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowInviteModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={inviteSaving}>
                {inviteSaving ? "Saving…" : "Save & Get Link"}
              </Button>
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
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Download Excel (.xlsx)
              </button>
              <button onClick={downloadInviteSampleCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 px-3 py-1.5 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors">
            <UploadCloud className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
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
                      <tr key={i} className="hover:bg-gray-50/70 transition-colors">
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
            <Button variant="secondary" className="flex-1" onClick={closeCSV}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleCSVImport} disabled={csvImporting || csvPreview.length === 0}>
              {csvImporting ? "Sending…" : `Send ${csvPreview.length || ""} Invites`}
            </Button>
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
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Include country code, e.g. +91 for India. Leave blank to remove the phone number.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="submit" variant="primary" className="flex-1" disabled={phoneSaving}>
                {phoneSaving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPhoneModal(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Block Dates modal ── */}
      <Modal open={showBlockModal} onClose={() => setShowBlockModal(false)} title={blockEditTarget ? "Edit Blocked Dates" : "Block Dates"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Start Date <span className="text-red-400">*</span></label>
              <DatePicker value={blockForm.startDate}
                onChange={e => setBlockForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? "" : f.endDate }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">End Date</label>
              <DatePicker value={blockForm.endDate} min={blockForm.startDate || undefined}
                onChange={e => setBlockForm(f => ({ ...f, endDate: e.target.value }))}
                placeholder={blockForm.startDate || "dd/mm/yyyy"}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="text-[11px] text-gray-400 mt-1">Leave blank to block a single day.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Reason / Remark <span className="text-red-400">*</span></label>
            <textarea rows={3} value={blockForm.reason}
              onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Public holiday — Independence Day"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <p className="text-[11px] text-gray-400 mt-1">Visible to panelists on their Availability calendar.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="primary" className="flex-1" onClick={handleSaveBlock} disabled={blockSaving}>
              {blockSaving ? "Saving…" : blockEditTarget ? "Save Changes" : "Block Dates"}
            </Button>
            <Button variant="secondary" onClick={() => setShowBlockModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
