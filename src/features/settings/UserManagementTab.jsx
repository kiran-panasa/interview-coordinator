import { formatDateShort } from "../../utils/dates";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";

const ALL_ROLES = [
  { value: "interviewer",         label: "Interviewer" },
  { value: "admin",               label: "Admin" },
  { value: "content_team",        label: "Content Team" },
  { value: "interviewer_content", label: "Interviewer + Content" },
];

function roleBadge(role) {
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
}

export default function UserManagementTab({
  loading,
  filteredUsers, usersPagination,
  filteredInvites, invitesPagination, pendingInvites,
  userRoleFilter, setUserRoleFilter,
  inviteRoleFilter, setInviteRoleFilter,
  activeUsers, pending,
  pendingRoles, setPendingRoles,
  saving,
  currentUser,
  copiedId, copyLink,
  approve, reject, changeRole, revoke, sendReset, openPhoneModal,
  handleRemoveInvite,
  onOpenInviteModal, onOpenCSV,
}) {
  return (
    <>
      {/* Action buttons */}
      <div className="flex justify-end gap-2 mb-8">
        <button
          onClick={onOpenCSV}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import CSV
        </button>
        <button
          onClick={onOpenInviteModal}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite
        </button>
      </div>

      {/* Users table */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full inline-block bg-emerald-500" />
            Users
            <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">
              {activeUsers.length + pending.length}
            </span>
            {pending.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                {pending.length} pending
              </span>
            )}
          </h2>
          <select
            value={userRoleFilter}
            onChange={e => setUserRoleFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-600 cursor-pointer">
            <option value="">All roles</option>
            <option value="pending">Pending</option>
            {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No users match this filter.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name", "Email", "Role", ""].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {usersPagination.paged.map(u => u.status === "pending" ? (
                    <tr key={u.id} className="hover:bg-amber-50 bg-amber-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{u.displayName || "—"}</span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">Pending</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{u.createdAt ? formatDateShort(u.createdAt) : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={pendingRoles[u.id] || "interviewer"}
                          onChange={e => setPendingRoles(s => ({ ...s, [u.id]: e.target.value }))}
                          disabled={saving[u.id]}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer">
                          {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <KebabMenu actions={[
                          { label: saving[u.id] ? "Approving…" : "Approve", onClick: () => approve(u), highlight: true, disabled: saving[u.id] },
                          { label: "Reject", onClick: () => reject(u), danger: true },
                        ]} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{u.displayName || "—"}</span>
                          {u.id === currentUser?.uid && (
                            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">You</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.id === currentUser?.uid ? (
                          roleBadge(u.role)
                        ) : (
                          <select
                            value={u.role || "interviewer"}
                            disabled={saving[u.id]}
                            onChange={e => changeRole(u, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-700 disabled:opacity-60 cursor-pointer">
                            {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <KebabMenu actions={[
                          { label: "Send reset email", onClick: () => sendReset(u) },
                          { label: u.phone ? "Update phone" : "Set phone", onClick: () => openPhoneModal(u) },
                          { label: "Revoke access", onClick: () => revoke(u), danger: true, disabled: saving[u.id], show: u.id !== currentUser?.uid },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={usersPagination.page}
                totalPages={usersPagination.totalPages}
                total={usersPagination.total}
                pageSize={usersPagination.pageSize}
                onPageChange={usersPagination.setPage}
              />
            </>
          )}
        </div>
      </div>

      {/* Invited — awaiting signup */}
      {(pendingInvites.length > 0 || loading) && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block bg-indigo-400" />
              Invited — Awaiting Signup
              {pendingInvites.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">{pendingInvites.length}</span>
              )}
            </h2>
            <select
              value={inviteRoleFilter}
              onChange={e => setInviteRoleFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-600 cursor-pointer">
              <option value="">All roles</option>
              {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {filteredInvites.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No invites match this filter.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["Name", "Email", "Role", "Invited On", ""].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invitesPagination.paged.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold text-gray-900">{inv.name || "—"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{inv.email}</td>
                          <td className="px-4 py-3">{roleBadge(inv.role)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{inv.createdAt ? formatDateShort(inv.createdAt) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 whitespace-nowrap">
                              <button onClick={() => copyLink(inv.id, inv.email)}
                                className={`text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${copiedId === inv.id ? "text-emerald-600" : "text-indigo-600 hover:text-indigo-800"}`}>
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={copiedId === inv.id ? "M5 13l4 4L19 7" : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                                </svg>
                                {copiedId === inv.id ? "Copied!" : "Copy link"}
                              </button>
                              <button onClick={() => handleRemoveInvite(inv)}
                                className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination
                    page={invitesPagination.page}
                    totalPages={invitesPagination.totalPages}
                    total={invitesPagination.total}
                    pageSize={invitesPagination.pageSize}
                    onPageChange={invitesPagination.setPage}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
