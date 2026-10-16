/**
 * Admin Account Moderation Service (Section 4 Screen 5, Section 8.7, UC6)
 * Handles flagged accounts, suspensions, warnings, and clear flag actions.
 * Every action is logged to admin_actions.
 */

import { User } from '../types';
import { appStorage } from './storage';
import { auditService } from './auditService';

export const adminAccountService = {
  async getFlaggedUsers(): Promise<User[]> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') return [];

    return appStorage.getUsers().filter((u) => u.flagged || u.accountStatus === 'suspended' || u.rejectedClaimCount >= 3);
  },

  async clearFlag(userId: string, notes: string): Promise<boolean> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') return false;

    const user = appStorage.getUserById(userId);
    if (!user) return false;

    user.flagged = false;
    user.flagReason = undefined;
    appStorage.saveUser(user);

    await auditService.logAction({
      adminId: admin.id,
      adminName: admin.name,
      action: 'Clear Flag',
      targetUserId: user.id,
      details: `Admin cleared flag on user ${user.name} (${user.email}). Notes: ${notes}`,
      outcome: 'Flag Cleared',
    });

    return true;
  },

  async issueFormalWarning(userId: string, warningReason: string): Promise<boolean> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') return false;

    const user = appStorage.getUserById(userId);
    if (!user) return false;

    user.flagReason = `Formal warning issued: ${warningReason}`;
    appStorage.saveUser(user);

    await auditService.logAction({
      adminId: admin.id,
      adminName: admin.name,
      action: 'Formal Warning',
      targetUserId: user.id,
      details: `Formal warning issued to ${user.name} (${user.email}). Reason: ${warningReason}`,
      outcome: 'Warning Issued',
    });

    return true;
  },

  async suspendAccount(userId: string, reason: string): Promise<boolean> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') return false;

    const user = appStorage.getUserById(userId);
    if (!user) return false;

    user.accountStatus = 'suspended';
    user.flagged = true;
    user.flagReason = `Account Suspended: ${reason}`;
    appStorage.saveUser(user);

    await auditService.logAction({
      adminId: admin.id,
      adminName: admin.name,
      action: 'Account Suspended',
      targetUserId: user.id,
      details: `Account suspended by admin. Reason: ${reason}`,
      outcome: 'Suspended',
    });

    return true;
  },

  async reinstateAccount(userId: string, notes: string): Promise<boolean> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') return false;

    const user = appStorage.getUserById(userId);
    if (!user) return false;

    user.accountStatus = 'active';
    user.flagged = false;
    user.flagReason = undefined;
    appStorage.saveUser(user);

    await auditService.logAction({
      adminId: admin.id,
      adminName: admin.name,
      action: 'Account Reinstated',
      targetUserId: user.id,
      details: `Account reinstated by admin. Notes: ${notes}`,
      outcome: 'Active',
    });

    return true;
  },
};
