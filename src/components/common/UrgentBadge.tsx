import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface UrgentBadgeProps {
  className?: string;
  count?: number;
}

export const UrgentBadge: React.FC<UrgentBadgeProps> = ({ className = '', count }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs ${className}`}
    >
      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" aria-hidden="true" />
      <span>Urgent</span>
      {typeof count === 'number' && (
        <span className="ml-0.5 px-1.5 py-0.2 bg-rose-200/80 text-rose-900 rounded-full text-[10px]">
          {count}
        </span>
      )}
    </span>
  );
};
