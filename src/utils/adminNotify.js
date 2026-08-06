import { ROLE } from "../constants/roles";

// Resolves who should receive an admin-facing email for an action that was
// originally initiated by a specific admin (e.g. the admin who sent a nudge
// invite, or scheduled an interview) — only that admin, not every admin.
// Falls back to all active admins when the actor can't be resolved (legacy
// data with no stamped actor, or an admin who's since been deactivated), so
// the notification isn't silently dropped.
export function resolveActionAdminRecipients(allUsers, actorUid) {
  const admins = allUsers.filter(u => u.role === ROLE.ADMIN && u.status === "active");
  const actor = actorUid ? admins.find(a => a.id === actorUid) : null;
  return actor ? [actor] : admins;
}
