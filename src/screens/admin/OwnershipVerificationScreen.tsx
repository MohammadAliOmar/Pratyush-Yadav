import React, { useEffect, useState } from 'react';
import { User, ItemReport, MatchSuggestion } from '../../types';
import { reportService } from '../../services/reportService';
import { matchService } from '../../services/matchService';
import { verificationService } from '../../services/verificationService';
import { VerificationChecklistItem } from '../../components/common/VerificationChecklistItem';
import { Button } from '../../components/common/Button';
import { ReportPhoto } from '../../components/common/ReportPhoto';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import {
  ArrowLeft,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Lock,
} from 'lucide-react';

interface OwnershipVerificationScreenProps {
  currentUser: User;
  lostReportId: string;
  matchId?: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const OwnershipVerificationScreen: React.FC<OwnershipVerificationScreenProps> = ({
  currentUser,
  lostReportId,
  matchId,
  onBack,
  onSuccess,
}) => {
  const [lostReport, setLostReport] = useState<ItemReport | null>(null);
  const [foundReport, setFoundReport] = useState<ItemReport | null>(null);
  const [currentMatch, setCurrentMatch] = useState<MatchSuggestion | null>(null);

  // Verification Form State
  const [checklist, setChecklist] = useState<
    { id: string; question: string; isCrucial?: boolean; matched: boolean | null; notes: string }[]
  >([]);
  const [secondDetailChecked, setSecondDetailChecked] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [lostReportId, matchId]);

  const loadData = async () => {
    const lost = await reportService.getReportById(lostReportId);
    setLostReport(lost);

    if (lost) {
      // Find matching suggestion
      const queue = await matchService.getAdminMatchingQueue();
      const match = queue.find(
        (m) =>
          (matchId && m.id === matchId) ||
          m.lostReportId === lost.id ||
          m.foundReportId === lost.matchedWithReportId
      );

      if (match) {
        setCurrentMatch(match);
        const found = await reportService.getReportById(match.foundReportId);
        setFoundReport(found);
      } else if (lost.matchedWithReportId) {
        const found = await reportService.getReportById(lost.matchedWithReportId);
        setFoundReport(found);
      }

      // Load category-specific questions (Section 7)
      const questions = verificationService.getQuestionsForCategory(lost.category);
      setChecklist(
        questions.map((q) => ({
          id: q.id,
          question: q.question,
          isCrucial: q.isCrucial,
          matched: null,
          notes: '',
        }))
      );
    }
  };

  const isHighValue = lostReport
    ? verificationService.isHighValueCategory(lostReport.category)
    : false;

  const handleDecision = async (outcome: 'Passed' | 'Failed') => {
    setError(null);

    if (!lostReport || !foundReport) {
      setError('Cannot submit verification without active report pair.');
      return;
    }

    // High value validation check (Section 7)
    if (outcome === 'Passed' && isHighValue && !secondDetailChecked) {
      setError(
        'High-value items (Laptop/tablet, Phone) require checking and recording a second unpublished detail before passing.'
      );
      return;
    }

    // Check if at least some questions were answered
    const unanswered = checklist.filter((item) => item.matched === null);
    if (unanswered.length > 0) {
      setError('Please record Matched or Not Matched for all verification questions.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await verificationService.submitVerificationResult({
        matchSuggestionId: currentMatch?.id || 'manual_verification',
        lostReportId: lostReport.id,
        foundReportId: foundReport.id,
        checklistResponses: checklist.map((c) => ({
          question: c.question,
          matched: c.matched === true,
          notes: c.notes,
        })),
        secondDetailChecked: isHighValue ? secondDetailChecked : undefined,
        adminNotes,
        outcome,
      });

      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Failed to submit verification result.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!lostReport) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading verification case...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Match Review Queue
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Case Header Card */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden space-y-4">
        {/* Navy Case Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-600 text-white">
                Ownership Verification Protocol
              </span>
              <span className="text-xs text-slate-300">Category: {lostReport.category}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white mt-1">
                Case Verification: {lostReport.itemName}
              </h1>
              {(lostReport.urgent || foundReport?.urgent) && <UrgentBadge />}
            </div>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-300 space-y-0.5">
            <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Claimant</span>
            <span className="text-sm font-bold text-white block">{lostReport.userName}</span>
            <span className="text-slate-300 block">{lostReport.userEmail}</span>
            {lostReport.contactEmail && (
              <span className="block text-slate-300">
                Contact: <a href={`mailto:${lostReport.contactEmail}`} className="underline hover:text-white">{lostReport.contactEmail}</a>
              </span>
            )}
            {lostReport.contactPhone && (
              <span className="block text-slate-300">
                Mobile: <a href={`tel:${lostReport.contactPhone}`} className="underline hover:text-white">{lostReport.contactPhone}</a>
              </span>
            )}
          </div>
        </div>

        {/* Urgent Reasons Note */}
        {(lostReport.urgent || foundReport?.urgent) && (
          <div className="px-4 sm:px-6 pt-3 space-y-1.5">
            {lostReport.urgent && lostReport.urgentReason && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                <span className="font-bold shrink-0">Lost report urgent:</span>
                <span>{lostReport.urgentReason}</span>
              </div>
            )}
            {foundReport?.urgent && foundReport.urgentReason && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                <span className="font-bold shrink-0">Found report urgent:</span>
                <span>{foundReport.urgentReason}</span>
              </div>
            )}
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-4">

        {/* Comparison Snippet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <h3 className="font-bold text-rose-800 mb-1">Lost Report Details</h3>
            <p className="text-slate-700"><strong>Item:</strong> {lostReport.itemName}</p>
            <p className="text-slate-700"><strong>Colour:</strong> {lostReport.colour}</p>
            <p className="text-slate-700"><strong>Lost Location:</strong> {lostReport.location}</p>
            <div className="pt-2">
              <ReportPhoto
                imageUrl={lostReport.imageUrl}
                imageAltText={lostReport.imageAltText}
                label={`Lost report photo for ${lostReport.itemName}`}
              />
            </div>
            <p className="text-slate-600 italic mt-2 bg-white p-2 rounded border border-slate-200">
              "{lostReport.description}"
            </p>
          </div>

          <div>
            <h3 className="font-bold text-emerald-800 mb-1">Found Item in Custody</h3>
            <p className="text-slate-700"><strong>Item:</strong> {foundReport?.itemName || 'Pending pair'}</p>
            <p className="text-slate-700"><strong>Colour:</strong> {foundReport?.colour}</p>
            <p className="text-slate-700"><strong>Handover / Custody:</strong> {foundReport?.whereItemIs || foundReport?.location}</p>
            {(foundReport?.contactEmail || foundReport?.contactPhone) && (
              <p className="text-slate-700">
                <strong>Finder Contact:</strong>{' '}
                {foundReport.contactEmail && (
                  <a href={`mailto:${foundReport.contactEmail}`} className="text-blue-700 underline mr-1.5">
                    {foundReport.contactEmail}
                  </a>
                )}
                {foundReport.contactPhone && (
                  <a href={`tel:${foundReport.contactPhone}`} className="text-blue-700 underline">
                    {foundReport.contactPhone}
                  </a>
                )}
              </p>
            )}
            <div className="pt-2">
              <ReportPhoto
                imageUrl={foundReport?.imageUrl}
                imageAltText={foundReport?.imageAltText}
                label={`Found report photo for ${foundReport?.itemName || 'found item'}`}
              />
            </div>
            <p className="text-slate-600 italic mt-2 bg-white p-2 rounded border border-slate-200">
              "{foundReport?.description || 'N/A'}"
            </p>
          </div>
        </div>

        {/* High-Value Notice */}
        {isHighValue && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              <span>High-Value Item Protocol (Laptop / Tablet / Phone)</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              To prevent fraudulent claims on high-value electronics, the administrator must verify physical device unlock or a second unpublished detail before authorizing release.
            </p>
          </div>
        )}

        {/* Verification Checklist */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-blue-600" />
              Category Verification Checklist ({lostReport.category})
            </h2>
            <span className="text-xs text-slate-400">Ask claimant directly (in-person or phone)</span>
          </div>

          <div className="space-y-3">
            {checklist.map((item, index) => (
              <VerificationChecklistItem
                key={item.id}
                id={item.id}
                question={item.question}
                isCrucial={item.isCrucial}
                matched={item.matched}
                notes={item.notes}
                onMatchedChange={(val) => {
                  const updated = [...checklist];
                  updated[index].matched = val;
                  setChecklist(updated);
                }}
                onNotesChange={(val) => {
                  const updated = [...checklist];
                  updated[index].notes = val;
                  setChecklist(updated);
                }}
              />
            ))}
          </div>

          {/* Second Unpublished Detail Checkbox for High-Value (Section 7) */}
          {isHighValue && (
            <div className="p-4 bg-purple-50/60 border-2 border-purple-200 rounded-xl space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={secondDetailChecked}
                  onChange={(e) => setSecondDetailChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-300 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-purple-950 block">
                    Second unpublished detail verified (Required for High-Value Items)
                  </span>
                  <span className="text-[11px] text-purple-800 leading-tight block mt-0.5">
                    Confirmed wallpaper, serial number, student system entry, or hardware passcode under staff supervision.
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Admin Verification Summary Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Administrator Summary &amp; Hand-over Notes
            </label>
            <textarea
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Record any additional notes, photo ID presented, or handover staff signature..."
              className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          {/* Final Action Buttons (Passed or Failed) */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-slate-500 max-w-sm">
              <strong>Mark Passed:</strong> Updates both reports to Returned and closes case.
              <br />
              <strong>Mark Failed:</strong> Reverts reports to Under Review and increments claimant's rejected claim count.
            </p>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="danger"
                size="md"
                isLoading={submitting}
                onClick={() => handleDecision('Failed')}
                leftIcon={<XCircle className="w-4 h-4 mr-1.5" />}
                className="flex-1 sm:flex-initial"
              >
                Mark Failed
              </Button>

              <Button
                variant="primary"
                size="md"
                isLoading={submitting}
                onClick={() => handleDecision('Passed')}
                leftIcon={<CheckCircle2 className="w-4 h-4 mr-1.5" />}
                className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-initial"
              >
                Mark Passed &amp; Return Item
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
