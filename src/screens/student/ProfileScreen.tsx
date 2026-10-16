import React, { useState } from 'react';
import { User } from '../../types';
import { authService } from '../../services/authService';
import { Button } from '../../components/common/Button';
import {
  User as UserIcon,
  Mail,
  Shield,
  AlertTriangle,
  LogOut,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  X,
} from 'lucide-react';

interface ProfileScreenProps {
  currentUser: User;
  onSignOut: () => void;
  onAccountDeleted?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  currentUser,
  onSignOut,
  onAccountDeleted,
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteCapsLockOn, setDeleteCapsLockOn] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = () => {
    onSignOut();
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteCapsLockOn(false);
    setDeleteError(null);
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const res = await authService.deleteAccount(currentUser, deletePassword);
      if (res.success) {
        closeDeleteDialog();
        try {
          sessionStorage.setItem('campusfind_account_deleted', '1');
        } catch {}
        if (onAccountDeleted) {
          onAccountDeleted();
        } else {
          onSignOut();
        }
      } else {
        setDeleteError(res.error || 'Failed to delete account.');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {/* User Identity */}
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-2xl shadow-inner">
            {currentUser.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{currentUser.name}</h1>
            <p className="text-xs text-slate-500 capitalize">{currentUser.role} Account</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
              Verified University Email
            </span>
          </div>
        </div>

        {/* Profile details */}
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              Email Address
            </span>
            <span className="font-semibold text-slate-900 font-mono">{currentUser.email}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400" />
              Role Authorization
            </span>
            <span className="font-semibold text-slate-900 capitalize">{currentUser.role}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-slate-400" />
              Account Status
            </span>
            <span className="font-semibold text-emerald-700 uppercase">{currentUser.accountStatus}</span>
          </div>

          {currentUser.flagged && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-amber-800 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Account Flagged for Review</span>
              </div>
              <p className="text-amber-700 text-[11px]">
                {currentUser.flagReason || 'Requires review by campus security.'}
              </p>
            </div>
          )}

          {currentUser.rejectedClaimCount > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px]">
              <span className="text-slate-500">Unverified Claims Recorded</span>
              <span className="font-bold text-slate-800">{currentUser.rejectedClaimCount}</span>
            </div>
          )}
        </div>

        {/* Sign Out */}
        <div className="pt-4 border-t border-slate-100">
          <Button
            variant="secondary"
            size="md"
            onClick={handleSignOut}
            className="w-full text-slate-700"
            leftIcon={<LogOut className="w-4 h-4 mr-1.5" />}
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-rose-50/50 rounded-2xl border border-rose-200 shadow-xs p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-100 rounded-xl text-rose-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-rose-950">Danger Zone</h2>
            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
              Permanently delete your account. This action will revoke your access, remove your profile details, and clean up your login credentials.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="w-full sm:w-auto"
            leftIcon={<Trash2 className="w-4 h-4 mr-1.5" />}
          >
            Delete my account
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-rose-700">
                <Trash2 className="w-5 h-5" />
                <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
                  Delete Account Permanently
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action cannot be undone. Your user profile, verification credentials, and notifications will be permanently deleted from the system. (Resolved reports and university audit records remain preserved for statutory compliance).
            </p>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="leading-relaxed font-medium">{deleteError}</div>
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter your current password to confirm
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    onKeyDown={(e) => setDeleteCapsLockOn(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setDeleteCapsLockOn(e.getModifierState('CapsLock'))}
                    onBlur={() => setDeleteCapsLockOn(false)}
                    placeholder="Enter current password"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((v) => !v)}
                    aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showDeletePassword}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {deleteCapsLockOn && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    Caps Lock is on
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closeDeleteDialog}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  isLoading={isDeleting}
                >
                  Delete permanently
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
