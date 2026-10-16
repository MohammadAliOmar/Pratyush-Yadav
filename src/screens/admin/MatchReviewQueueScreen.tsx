import React, { useEffect, useState } from 'react';
import { User, MatchSuggestion } from '../../types';
import { matchService } from '../../services/matchService';
import { verificationService } from '../../services/verificationService';
import { PerFactorScoreCard } from '../../components/common/PerFactorScoreCard';
import { Button } from '../../components/common/Button';
import { ReportPhoto } from '../../components/common/ReportPhoto';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import {
  GitCompare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  MapPin,
  Calendar,
  Tag,
  Palette,
  FileText,
  Building,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface MatchReviewQueueScreenProps {
  currentUser: User;
  onStartVerification: (matchId: string, lostReportId: string, foundReportId: string) => void;
}

export const MatchReviewQueueScreen: React.FC<MatchReviewQueueScreenProps> = ({
  currentUser,
  onStartVerification,
}) => {
  const [matches, setMatches] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadQueue();
  }, []);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadQueue(true);
  }, [dataVersion]);

  const loadQueue = async (silent = false) => {
    if (!silent) setLoading(true);
    const queue = await matchService.getAdminMatchingQueue();
    setMatches(queue);
    setLoading(false);
  };

  const handleDismiss = async (matchId: string) => {
    setActionError(null);
    const success = await matchService.dismissMatch(matchId, currentUser.id, currentUser.name);
    if (success) {
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    }
  };

  const handlePursueMatch = async (match: MatchSuggestion) => {
    setActionError(null);

    // Business Rule 6 Check: Conflict of interest
    if (
      match.lostReport?.userId === currentUser.id ||
      match.foundReport?.userId === currentUser.id
    ) {
      setActionError(
        'Conflict of Interest Rule Enforced: Administrators cannot review or verify reports they submitted themselves. Please assign to another campus administrator.'
      );
      return;
    }

    const res = await verificationService.startVerification(match.id);
    if (res.success) {
      onStartVerification(match.id, match.lostReportId, match.foundReportId);
    } else {
      setActionError(res.error || 'Failed to start verification.');
    }
  };

  // Group matches by Lost Report (Section 4 Screen 2)
  const groupedByLostReport: Record<string, MatchSuggestion[]> = {};
  matches.forEach((m) => {
    const key = m.lostReportId;
    if (!groupedByLostReport[key]) {
      groupedByLostReport[key] = [];
    }
    groupedByLostReport[key].push(m);
  });

  // Sort groups: a group containing any urgent pair first, then the group with the highest best score
  const sortedGroupEntries = Object.entries(groupedByLostReport).sort(([, aMatches], [, bMatches]) => {
    const aHasUrgent = aMatches.some((m) => m.lostReport?.urgent === true || m.foundReport?.urgent === true);
    const bHasUrgent = bMatches.some((m) => m.lostReport?.urgent === true || m.foundReport?.urgent === true);

    if (aHasUrgent && !bHasUrgent) return -1;
    if (!aHasUrgent && bHasUrgent) return 1;

    const aBestScore = Math.max(...aMatches.map((m) => m.totalScore));
    const bBestScore = Math.max(...bMatches.map((m) => m.totalScore));
    return bBestScore - aBestScore;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Match Review Queue
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              {matches.length} Candidates
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated scoring breakdown: Category (35) + Description similarity (30) + Location (20) + Date (10) + Colour (5).
          </p>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-medium">{actionError}</div>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading matching queue...</div>
      ) : matches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <GitCompare className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">No Pending Match Suggestions</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            When new lost and found reports score 45% or higher against active reports, they will be ranked and queued here for admin review.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroupEntries.map(([lostReportId, candidateMatches]) => {
            const lostRep = candidateMatches[0].lostReport;
            if (!lostRep) return null;

            return (
              <div
                key={lostReportId}
                className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden space-y-4"
              >
                {/* Lost Report Group Header */}
                <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600 uppercase tracking-wider text-white">
                        Lost Item
                      </span>
                      {lostRep.urgent && <UrgentBadge />}
                      <span className="text-xs text-slate-300">Ref: #{lostRep.id}</span>
                      <span className="text-xs text-slate-400">• Submitter: {lostRep.userName}</span>
                    </div>
                    <h2 className="text-lg font-bold">{lostRep.itemName}</h2>
                    {lostRep.urgent && lostRep.urgentReason && (
                      <p className="text-xs text-rose-200 mt-0.5">
                        Urgent reason: {lostRep.urgentReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {lostRep.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {lostRep.date}
                    </span>
                    <span>Colour: <strong className="capitalize text-white">{lostRep.colour}</strong></span>
                  </div>
                </div>

                {/* Candidate Found Reports List */}
                <div className="p-4 sm:p-6 space-y-6">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {candidateMatches.length} Candidate Matches Surfaced (Ranked by Total Score):
                  </div>

                  {candidateMatches.map((m, idx) => {
                    const foundRep = m.foundReport;
                    if (!foundRep) return null;

                    const isConflict =
                      lostRep.userId === currentUser.id || foundRep.userId === currentUser.id;

                    return (
                      <div
                        key={m.id}
                        className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-slate-50/50 space-y-4 hover:border-blue-300 transition-all"
                      >
                        {/* Conflict Notice if admin submitted this report */}
                        {isConflict && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>
                              <strong>Conflict of Interest (Rule 6):</strong> You submitted this report. Another administrator must review and verify this candidate.
                            </span>
                          </div>
                        )}

                        {/* Candidate Card Header */}
                        <div className="flex items-center justify-between pb-1">
                          <span className="text-xs font-bold text-slate-700">
                            Candidate #{idx + 1}
                          </span>
                          {lostRep.urgent && <UrgentBadge />}
                        </div>

                        {/* Top: Score breakdown card */}
                        <PerFactorScoreCard breakdown={m} label={m.label} />

                        {/* Side-by-Side Comparison of Lost vs Found (Section 4 Screen 2) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Lost details */}
                          <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                              <span className="font-bold text-rose-700">Lost Item Details</span>
                              <span className="text-slate-400 text-[11px]">{lostRep.userName}</span>
                            </div>
                            <div className="space-y-1 text-slate-700">
                              <p><strong>Item:</strong> {lostRep.itemName}</p>
                              <p><strong>Location:</strong> {lostRep.location}</p>
                              <p><strong>Reported Date:</strong> {lostRep.date}</p>
                              <p><strong>Colour:</strong> <span className="capitalize">{lostRep.colour}</span></p>
                              {(lostRep.contactEmail || lostRep.contactPhone) && (
                                <p className="text-slate-600">
                                  <strong>Contact:</strong>{' '}
                                  {lostRep.contactEmail && (
                                    <a href={`mailto:${lostRep.contactEmail}`} className="text-blue-700 underline hover:text-blue-900 mr-2">
                                      {lostRep.contactEmail}
                                    </a>
                                  )}
                                  {lostRep.contactPhone && (
                                    <a href={`tel:${lostRep.contactPhone}`} className="text-blue-700 underline hover:text-blue-900">
                                      {lostRep.contactPhone}
                                    </a>
                                  )}
                                </p>
                              )}
                              {lostRep.urgent && lostRep.urgentReason && (
                                <p className="text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                                  <strong>Urgent reason:</strong> {lostRep.urgentReason}
                                </p>
                              )}
                            </div>
                            <div className="pt-1">
                              <ReportPhoto
                                imageUrl={lostRep.imageUrl}
                                imageAltText={lostRep.imageAltText}
                                label={`Lost report photo for ${lostRep.itemName}`}
                              />
                            </div>
                            <p className="bg-slate-50 p-2 rounded text-slate-600 italic">
                              "{lostRep.description}"
                            </p>
                          </div>

                          {/* Found details */}
                          <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-emerald-700">Found Candidate Details</span>
                                {foundRep.urgent && <UrgentBadge />}
                              </div>
                              <span className="text-slate-400 text-[11px]">{foundRep.userName}</span>
                            </div>
                            <div className="space-y-1 text-slate-700">
                              <p><strong>Item:</strong> {foundRep.itemName}</p>
                              <p><strong>Location:</strong> {foundRep.location}</p>
                              <p><strong>Date Found:</strong> {foundRep.date}</p>
                              <p><strong>Colour:</strong> <span className="capitalize">{foundRep.colour}</span></p>
                              {foundRep.whereItemIs && (
                                <p className="text-emerald-800 font-medium">
                                  <strong>Handover:</strong> {foundRep.whereItemIs}
                                </p>
                              )}
                              {(foundRep.contactEmail || foundRep.contactPhone) && (
                                <p className="text-slate-600">
                                  <strong>Contact:</strong>{' '}
                                  {foundRep.contactEmail && (
                                    <a href={`mailto:${foundRep.contactEmail}`} className="text-blue-700 underline hover:text-blue-900 mr-2">
                                      {foundRep.contactEmail}
                                    </a>
                                  )}
                                  {foundRep.contactPhone && (
                                    <a href={`tel:${foundRep.contactPhone}`} className="text-blue-700 underline hover:text-blue-900">
                                      {foundRep.contactPhone}
                                    </a>
                                  )}
                                </p>
                              )}
                              {foundRep.urgent && foundRep.urgentReason && (
                                <p className="text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                                  <strong>Urgent reason:</strong> {foundRep.urgentReason}
                                </p>
                              )}
                            </div>
                            <div className="pt-1">
                              <ReportPhoto
                                imageUrl={foundRep.imageUrl}
                                imageAltText={foundRep.imageAltText}
                                label={`Found report photo for ${foundRep.itemName}`}
                              />
                            </div>
                            <p className="bg-slate-50 p-2 rounded text-slate-600 italic">
                              "{foundRep.description}"
                            </p>
                          </div>
                        </div>

                        {/* Admin Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                          <span className="text-xs text-slate-500">
                            Candidate #{idx + 1} • Status: <strong className="capitalize">{m.status}</strong>
                          </span>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDismiss(m.id)}
                              leftIcon={<XCircle className="w-3.5 h-3.5 mr-1 text-slate-400" />}
                            >
                              Dismiss Candidate
                            </Button>

                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isConflict}
                              onClick={() => handlePursueMatch(m)}
                              rightIcon={<ArrowRight className="w-3.5 h-3.5 ml-1" />}
                            >
                              Confirm Match &amp; Start Verification
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
