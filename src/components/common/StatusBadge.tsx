import React from 'react';
import { ReportStatus } from '../../types';
import {
  FileText,
  Search,
  Sparkles,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Archive,
} from 'lucide-react';

interface StatusBadgeProps {
  status: ReportStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'Submitted':
        return {
          bg: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
          icon: FileText,
          description: 'Report received and queued for review.',
        };
      case 'Under Review':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300',
          icon: Search,
          description: 'Being examined by campus security or lost-and-found staff.',
        };
      case 'Possible Match':
        return {
          bg: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
          icon: Sparkles,
          description: 'Potential corresponding report identified by campus system.',
        };
      case 'Pending Verification':
        return {
          bg: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300',
          icon: ClipboardCheck,
          description: 'Ownership verification question checklist in progress.',
        };
      case 'Returned':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300',
          icon: CheckCircle2,
          description: 'Item successfully verified and returned to verified claimant.',
        };
      case 'Rejected':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300',
          icon: XCircle,
          description: 'Claim could not be verified or was deemed invalid.',
        };
      case 'Archived':
        return {
          bg: 'bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
          icon: Archive,
          description: 'Case closed and stored in campus archives.',
        };
      default:
        return {
          bg: 'bg-gray-100 border-gray-300 text-gray-700',
          icon: FileText,
          description: '',
        };
    }
  };

  const config = getStatusStyles();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-xs transition-colors ${config.bg} ${sizeClasses[size]}`}
      title={config.description}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
      <span>{status}</span>
    </span>
  );
};
