import { useState, useEffect, useRef } from "react";
import { formatDateShort } from "../../utils/dates";
import * as XLSX from "xlsx";
import {
  updateUser, deleteUser,
  createInvite, deleteInvite,
  subscribeToUsers, subscribeToInvites,
  subscribeToSkills, createSkill, updateSkill, deleteSkill,
} from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const BLANK_INVITE = { name: "", phone: "", email: "", role: "interviewer" };

const ROLE_OPTIONS = [
  { value: "interviewer",          label: "Interviewer",           desc: "Can conduct interviews and submit evaluations" },
  { value: "admin",                label: "Admin",                 desc: "Full access — manage interviews, candidates, users" },
  { value: "content_team",         label: "Content Team",          desc: "Access to Templates page only" },
  { value: "interviewer_content",  label: "Interviewer + Content", desc: "Can conduct interviews AND access Templates" },
];

const ALL_ROLES = [
  { value: "interviewer",          label: "Interviewer" },
  { value: "admin",                label: "Admin" },
  { value: "content_team",         label: "Content Team" },
  { value: "interviewer_content",  label: "Interviewer + Content" },
];

const VALID_ROLES = new Set(["interviewer", "admin", "content_team"]);

// ── CSV / Excel helpers ───────────────────────────────────────────────────────

function splitCSVRow(line) {
  const cols = [];
  let curr = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(curr.trim()); curr = ""; }
    else { curr += ch; }
  }
  cols.push(curr.trim());
  return cols;
}

function parseInvitesCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["File must have a header row and at least one data row."] };

  const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const idx = (names) => names.map(n => headers.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;

  const nameIdx  = idx(["name"]);
  const phoneIdx = idx(["phone", "mobile"]);
  const emailIdx = idx(["email"]);
  const roleIdx  = idx(["role"]);

  if (emailIdx === -1) return { rows: [], errors: ["Missing required column: email"] };

  const errors = [], rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVRow(lines[i]);
    const email = c[emailIdx]?.trim().toLowerCase();
    if (!email) { errors.push(`Row ${i + 1}: email is required`); continue; }
    const rawRole = roleIdx >= 0 ? c[roleIdx]?.trim().toLowerCase() : "";
    const role = VALID_ROLES.has(rawRole) ? rawRole : "interviewer";
    rows.push({
      name:  nameIdx  >= 0 ? c[nameIdx]?.trim()  || "" : "",
      phone: phoneIdx >= 0 ? c[phoneIdx]?.trim() || "" : "",
      email,
      role,
    });
  }
  return { rows, errors };
}

function downloadInviteSampleCSV() {
  const content = [
    "name,phone,email,role",
    "Rahul Sharma,+91 98765 43210,rahul@example.com,interviewer",
    "Priya Patel,+91 98765 43211,priya@example.com,admin",
    "Content Writer,,writer@example.com,content_team",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "invites_sample.csv" });
  a.click();
}

function downloadInviteSampleExcel() {
  const rows = [
    { name: "Rahul Sharma", phone: "+91 98765 43210", email: "rahul@example.com", role: "interviewer" },
    { name: "Priya Patel",  phone: "+91 98765 43211", email: "priya@example.com", role: "admin" },
    { name: "Content Writer", phone: "",              email: "writer@example.com", role: "content_team" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["name", "phone", "email", "role"] });
  ws["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 14 }];

  // Add a note sheet with valid role values
  const noteRows = [
    { "Valid role values": "interviewer" },
    { "Valid role values": "admin" },
    { "Valid role values": "content_team" },
  ];
  const wsNote = XLSX.utils.json_to_sheet(noteRows);
  wsNote["!cols"] = [{ wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invites");
  XLSX.utils.book_append_sheet(wb, wsNote, "Reference");
  XLSX.writeFile(wb, "invites_sample.xlsx");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPanelPage() {
  const { currentUser } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [toast,   setToast]   = useState(null);

  const [pendingRoles, setPendingRoles] = useState({});  // { [userId]: role }

  const [skills,        setSkills]        = useState([]);
  const [newSkillName,  setNewSkillName]  = useState("");
  const [editingSkill,  setEditingSkill]  = useState(null); // { id, name }
  const [addingSkill,   setAddingSkill]   = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm,      setInviteForm]      = useState(BLANK_INVITE);
  const [inviteSaving,    setInviteSaving]    = useState(false);
  const [inviteError,     setInviteError]     = useState("");
  const [savedInvite,     setSavedInvite]     = useState(null);
  const [copiedId,        setCopiedId]        = useState(null);

  // CSV import state
  const [showCSV,      setShowCSV]      = useState(false);
  const [csvPreview,   setCsvPreview]   = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    let usersReady = false, invitesReady = false;
    const checkReady = () => { if (usersReady && invitesReady) setLoading(false); };
    const unsubUsers   = subscribeToUsers(u   => { setUsers(u);   usersReady   = true; checkReady(); });
    const unsubInvites = subscribeToInvites(i => { setInvites(i); invitesReady = true; checkReady(); });
    const unsubSkills  = subscribeToSkills(setSkills);
    return () => { unsubUsers(); unsubInvites(); unsubSkills(); };
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

  // CSV import
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
    let imported = 0;
    for (const row of csvPreview) {
      try { await createInvite(row); imported++; }
      catch { /* skip */ }
    }
    setCsvImporting(false);
    setShowCSV(false);
    setCsvPreview([]);
    setCsvErrors([]);
    setToast({ message: `${imported} invite${imported !== 1 ? "s" : ""} sent.` });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); };

  // Skills CRUD
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

  const usersPagination   = usePagination(activeUsers);
  const invitesPagination = usePagination(invites);

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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, and invitations</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
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
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer"
                      >
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

      {/* ── All Active Users ── */}
      <div className="mb-8">
        {sectionTitle("bg-emerald-500", "All Users", activeUsers.length)}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : activeUsers.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No active users yet.</p>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Email", "Role", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usersPagination.paged.map(u => (
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
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">
                      {u.id === currentUser?.uid ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <select
                            value={u.role || "interviewer"}
                            disabled={saving[u.id]}
                            onChange={e => changeRole(u, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer"
                          >
                            {ALL_ROLES.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <button onClick={() => revoke(u)} disabled={saving[u.id]}
                            className="text-xs text-red-500 font-medium hover:underline disabled:opacity-40">
                            Revoke
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={usersPagination.page} totalPages={usersPagination.totalPages} total={usersPagination.total} pageSize={usersPagination.pageSize} onPageChange={usersPagination.setPage} />
            </>
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
              <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name", "Phone", "Email", "Invited On", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invitesPagination.paged.map(inv => (
                    <tr key={inv.id} className={`hover:bg-gray-50 ${inv.status === "registered" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{inv.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.phone || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{inv.email}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{inv.createdAt ? formatDateShort(inv.createdAt) : "—"}</td>
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
              <Pagination page={invitesPagination.page} totalPages={invitesPagination.totalPages} total={invitesPagination.total} pageSize={invitesPagination.pageSize} onPageChange={invitesPagination.setPage} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Skills ── */}
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

            {/* Add skill */}
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
          {/* Download sample */}
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

          {/* File picker */}
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

          {/* Parse errors / info */}
          {csvErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Notes</p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-amber-600">• {e}</p>)}
            </div>
          )}

          {/* Preview table */}
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
