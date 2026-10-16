import React, { useEffect, useState } from 'react';
import { User } from '../../types';
import { adminAccountService } from '../../services/adminAccountService';
import { Button } from '../../components/common/Button';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileWarning,
  UserX,
  UserCheck,
  History,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface FlaggedAccountsScreenProps {
  currentUser: User;
  onNavigateToAudit?: () => void;
}

export const FlaggedAccountsScreen: React.FC<FlaggedAccountsScreenProps> = ({
  currentUser,
  onNavigateToAudit,
}) => {
  const [flaggedUsers, setFlaggedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Action Modal State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<'clear' | 'warning' | 'suspend' | 'reinstate' | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadFlaggedUsers();
  }, []);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadFlaggedUsers(true);
  }, [dataVersion]);

  const loadFlaggedUsers = async (silent = false) => {
    if (!silent) setLoading(true);
    const users = await adminAccountService.getFlaggedUsers();
    setFlaggedUsers(users);
    setLoading(false);
  };

  const handleExecuteAction = async () => {
    if (!selectedUser || !actionType) return;

    if (actionType === 'clear') {
      await adminAccountService.clearFlag(selectedUser.id, reasonInput || 'Flag cleared after administrative review');
      setActionSuccess(`Flag successfully cleared for ${selectedUser.name}.`);
    } else if (actionType === 'warning') {
      await adminAccountService.issueFormalWarning(selectedUser.id, reasonInput || 'Multiple failed verification claims detected.');
      setActionSuccess(`Formal warning issued to ${selectedUser.name}.`);
    } else if (actionType === 'suspend') {
      await adminAccountService.suspendAccount(selectedUser.id, reasonInput || 'Abuse policy violation; excessive invalid claims.');
      setActionSuccess(`Account suspended for ${selectedUser.name}.`);
    } else if (actionType === 'reinstate') {
      await adminAccountService.reinstateAccount(selectedUser.id, reasonInput || 'Account reinstated following appeal review.');
      setActionSuccess(`Account reinstated for ${selectedUser.name}.`);
    }

    setActionType(null);
    setReasonInput('');
    loadFlaggedUsers();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Flagged Accounts &amp; Abuse Moderation
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              {flaggedUsers.length} Flagged
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Accounts flagged for repeated failed claims (&ge;3), duplicate flood abuse, or manual security notices.
          </p>
        </div>

        {onNavigateToAudit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onNavigateToAudit}
            leftIcon={<History className="w-4 h-4 mr-1 text-slate-400" />}
          >
            View Moderation Audit Trail
          </Button>
        )}
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs text-emerald-700 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading flagged accounts...</div>
      ) : flaggedUsers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">No Flagged Accounts</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All campus student and staff accounts are in good standing with zero abuse threshold flags.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {flaggedUsers.map((user) => {
            const isSuspended = user.accountStatus === 'suspended';

            return (
              <div
                key={user.id}
                className="bg-white border-2 border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{user.name}</h3>
                      <span className="text-xs font-mono text-slate-500">({user.email})</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          isSuspended
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isSuspended ? 'Account Suspended' : 'Flagged for Review'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      <strong>Role:</strong> <span className="capitalize">{user.role}</span> • Member since {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Rejected claims count badge */}
                  <div className="shrink-0 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5 text-center">
                    <div className="text-lg font-black text-rose-700">
                      {user.rejectedClaimCount}
                    </div>
                    <div className="text-[10px] font-semibold text-rose-800 uppercase tracking-tight">
                      Rejected Claims
                    </div>
                  </div>
                </div>

                {/* Flag Reason */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                  <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Flag Trigger Reason:
                  </span>
                  <p className="leading-relaxed">
                    {user.flagReason || 'Exceeded 3 failed ownership verifications across campus lost and found cases.'}
                  </p>
                </div>

                {/* Action Buttons (Section 4 Screen 5) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400">
                    All administrative decisions are permanently recorded in the immutable audit log.
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Clear Flag */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setActionType('clear');
                        setReasonInput('');
                      }}
                      leftIcon={<CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />}
                    >
                      Clear Flag
                    </Button>

                    {/* Formal Warning */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setActionType('warning');
                        setReasonInput('');
                      }}
                      leftIcon={<FileWarning className="w-3.5 h-3.5 mr-1 text-amber-600" />}
                    >
                      Formal Warning
                    </Button>

                    {/* Suspend or Reinstate */}
                    {!isSuspended ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setActionType('suspend');
                          setReasonInput('');
                        }}
                        leftIcon={<UserX className="w-3.5 h-3.5 mr-1" />}
                      >
                        Suspend Account
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setActionType('reinstate');
                          setReasonInput('');
                        }}
                        leftIcon={<UserCheck className="w-3.5 h-3.5 mr-1" />}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Reinstate Account
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Moderation Decision Confirmation Modal */}
      {actionType && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {actionType === 'clear' && `Clear Flag for ${selectedUser.name}`}
              {actionType === 'warning' && `Issue Formal Warning to ${selectedUser.name}`}
              {actionType === 'suspend' && `Suspend Account for ${selectedUser.name}`}
              {actionType === 'reinstate' && `Reinstate Account for ${selectedUser.name}`}
            </h3>

            <p className="text-xs text-slate-600">
              Record the administrative justification for this decision. It will be logged to the security audit trail.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Decision Notes / Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Enter justification or context for audit trail..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActionType(null);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === 'suspend' ? 'danger' : 'primary'}
                size="sm"
                onClick={handleExecuteAction}
              >
                Confirm Decision
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
