import React from 'react';
import { MatchFactorBreakdown, MatchLabel } from '../../types';
import { Tag, FileText, MapPin, Calendar, Palette } from 'lucide-react';

interface PerFactorScoreCardProps {
  breakdown: MatchFactorBreakdown;
  label?: MatchLabel;
  compact?: boolean;
}

export const PerFactorScoreCard: React.FC<PerFactorScoreCardProps> = ({
  breakdown,
  label,
  compact = false,
}) => {
  const isLikely = breakdown.totalScore >= 75;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          {label && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isLikely
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {label}
            </span>
          )}
          <span className="text-xs text-slate-500 font-medium">Confidence Breakdown</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-slate-500">Total Score:</span>
          <span className="text-lg font-bold text-slate-900">
            {breakdown.totalScore.toFixed(1)}
          </span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>

      <div className={`grid ${compact ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-5'} gap-2 text-xs`}>
        {/* Category Factor */}
        <div className="bg-white p-2 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 text-slate-500 mb-1">
            <Tag className="w-3 h-3 text-blue-600" />
            <span className="truncate">Category</span>
          </div>
          <div className="font-semibold text-slate-900 text-sm">
            {breakdown.categoryScore.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 35</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {breakdown.categoryScore === 35 ? 'Exact match' : 'Different'}
          </div>
        </div>

        {/* Description Similarity */}
        <div className="bg-white p-2 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 text-slate-500 mb-1">
            <FileText className="w-3 h-3 text-blue-600" />
            <span className="truncate" title="Semantic sentence embedding similarity">Description</span>
          </div>
          <div className="font-semibold text-slate-900 text-sm">
            {breakdown.descriptionScore.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 30</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate" title="Sentence embedding similarity">
            Description sim.
          </div>
        </div>

        {/* Location Factor */}
        <div className="bg-white p-2 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 text-slate-500 mb-1">
            <MapPin className="w-3 h-3 text-emerald-600" />
            <span className="truncate">Location</span>
          </div>
          <div className="font-semibold text-slate-900 text-sm">
            {breakdown.locationScore.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 20</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {breakdown.locationScore === 20 ? 'Exact match' : 'Different location'}
          </div>
        </div>

        {/* Date Factor */}
        <div className="bg-white p-2 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 text-slate-500 mb-1">
            <Calendar className="w-3 h-3 text-amber-600" />
            <span className="truncate">Date decay</span>
          </div>
          <div className="font-semibold text-slate-900 text-sm">
            {breakdown.dateScore.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 10</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {breakdown.dateScore === 10 ? 'Same day' : breakdown.dateScore >= 8 ? '1-3 days' : 'Decayed'}
          </div>
        </div>

        {/* Colour Factor */}
        <div className="bg-white p-2 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1 text-slate-500 mb-1">
            <Palette className="w-3 h-3 text-rose-600" />
            <span className="truncate">Colour</span>
          </div>
          <div className="font-semibold text-slate-900 text-sm">
            {breakdown.colourScore.toFixed(1)} <span className="text-xs font-normal text-slate-500">/ 5</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {breakdown.colourScore === 5 ? 'Exact match' : breakdown.colourScore === 2.5 ? 'Adjacent colour' : 'Mismatch'}
          </div>
        </div>
      </div>
    </div>
  );
};
