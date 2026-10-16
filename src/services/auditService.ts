/**
 * Audit Log Service (FR-10, NFR-08)
 *
 * Immutable audit trail:
 * - Every significant admin action is written to admin_actions.
 * - Reviewing a match, starting or completing verification, changing a status,
 *   returning an item, closing a case, account decisions.
 * - Entries cannot be edited or deleted.
 */

import { AdminAction } from '../types';
import { appStorage } from './storage';

export const auditService = {
  async getAuditLogs(): Promise<AdminAction[]> {
    const user = appStorage.getCurrentUser();
    // Admin only access
    if (!user || user.role !== 'admin') {
      return [];
    }
    return appStorage.getAdminActions();
  },

  async logAction(
    data: Omit<AdminAction, 'id' | 'createdAt'>
  ): Promise<AdminAction> {
    const newAction: AdminAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      adminId: data.adminId,
      adminName: data.adminName,
      action: data.action,
      reportId: data.reportId,
      targetUserId: data.targetUserId,
      details: data.details,
      verificationLog: data.verificationLog,
      secondDetailChecked: data.secondDetailChecked,
      outcome: data.outcome,
      createdAt: new Date().toISOString(),
    };

    appStorage.addAdminAction(newAction);
    return newAction;
  },
};
