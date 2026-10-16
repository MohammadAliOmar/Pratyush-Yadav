import React from 'react';
import { Check, X } from 'lucide-react';

interface VerificationChecklistItemProps {
  id: string;
  question: string;
  isCrucial?: boolean;
  matched: boolean | null; // null: unselected, true: matched, false: not matched
  notes?: string;
  onMatchedChange: (matched: boolean) => void;
  onNotesChange: (notes: string) => void;
}

export const VerificationChecklistItem: React.FC<VerificationChecklistItemProps> = ({
  question,
  isCrucial = false,
  matched,
  notes = '',
  onMatchedChange,
  onNotesChange,
}) => {
  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2.5 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{question}</span>
            {isCrucial && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                Key Identifier
              </span>
            )}
          </div>
        </div>

        {/* Matched / Not Matched Toggle Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onMatchedChange(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
              matched === true
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300'
            }`}
            aria-pressed={matched === true}
          >
            <Check className="w-3.5 h-3.5" />
            Matched
          </button>
          <button
            type="button"
            onClick={() => onMatchedChange(false)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
              matched === false
                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-rose-50 hover:border-rose-300'
            }`}
            aria-pressed={matched === false}
          >
            <X className="w-3.5 h-3.5" />
            Not matched
          </button>
        </div>
      </div>

      {/* Answer Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Claimant's Recorded Answer / Verification Note:
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. Claimant described stickers accurately; password unlocked on first attempt."
          className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50"
        />
      </div>
    </div>
  );
};
