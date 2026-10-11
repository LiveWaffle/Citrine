import { randomUUID } from 'node:crypto';
import { accountStatuses, roles } from '../models.js';
import { publicUser } from './auth.js';
import { requireValue } from './errors.js';

export function audit(sql, actorId, fields) {
  sql.insertModerationAction.run({
    id: randomUUID(), actorId, reportId: null, targetUserId: null,
    previousStatus: null, newStatus: null, pointsDelta: 0,
    createdAt: new Date().toISOString(), ...fields,
  });
}

export function requireReason(reason) {
  requireValue(typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 1000,
    400, 'REASON_REQUIRED', 'Enter a decision reason of up to 1000 characters.');
  return reason.trim();
}

export function createModeration({ db, statements: sql }) {
  const updateUser = db.transaction((actor, id, input) => {
    const target = sql.getUser.get(id);
    requireValue(target, 404, 'NOT_FOUND', 'Account not found.');
    requireValue(roles.includes(input.role) && accountStatuses.includes(input.status),
      400, 'INVALID_ACCESS', 'Select a valid account role and status.');
    const reason = requireReason(input.reason);
    requireValue(target.role === input.expectedRole && target.status === input.expectedStatus,
      409, 'STALE_ACCOUNT', 'This account changed. Refresh before updating it.');
    if (target.role === 'admin' && target.status === 'active' && (input.role !== 'admin' || input.status !== 'active')) {
      requireValue(sql.countActiveAdmins.get().count > 1, 409, 'LAST_ADMIN', 'The last active admin cannot be demoted or suspended.');
    }
    if (target.role !== input.role || target.status !== input.status) {
      sql.updateUserAccess.run({ id, role: input.role, status: input.status });
      sql.deleteUserSessions.run(id);
      audit(sql, actor.id, {
        targetUserId: id, action: 'Account access changed', reason,
        previousStatus: `${target.role}/${target.status}`, newStatus: `${input.role}/${input.status}`,
      });
    }
    return publicUser(sql.getUser.get(id));
  });

  const promoteAdmin = db.transaction(username => {
    const user = sql.getUserByName.get(username.toLowerCase());
    requireValue(user, 404, 'NOT_FOUND', 'Register this account in Citrine first.');
    requireValue(user.status === 'active', 409, 'ACCOUNT_SUSPENDED', 'A suspended account cannot be promoted.');
    if (user.role !== 'admin') {
      sql.updateUserAccess.run({ id: user.id, role: 'admin', status: user.status });
      sql.deleteUserSessions.run(user.id);
      audit(sql, null, {
        targetUserId: user.id, action: 'Admin assigned from local console', reason: 'Local administrator bootstrap.',
        previousStatus: `${user.role}/${user.status}`, newStatus: `admin/${user.status}`,
      });
    }
    return publicUser(sql.getUser.get(user.id));
  });

  return {
    listUsers: () => sql.listUsers.all().map(publicUser),
    updateUser: (actor, id, input) => updateUser.immediate(actor, id, input),
    promoteAdmin: username => promoteAdmin.immediate(username),
    actions: (reportId = '') => sql.listModerationActions.all({ reportId }).map(row => ({
      id: row.id, actorUsername: row.actor_username ?? 'Local console', actorId: row.actor_id,
      reportId: row.report_id, targetUserId: row.target_user_id, action: row.action, reason: row.reason,
      previousStatus: row.previous_status, newStatus: row.new_status, pointsDelta: row.points_delta, createdAt: row.created_at,
    })),
  };
}
