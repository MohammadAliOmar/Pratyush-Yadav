import React, { useEffect, useState } from 'react';
import { User, ItemReport } from '../../types';
import { reportService } from '../../services/reportService';
import { StatusBadge } from '../../components/common/StatusBadge';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import { ReportPhoto } from '../../components/common/ReportPhoto';
import {
  Archive,
  Calendar,
  MapPin,
  Lock,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface ArchiveScreenProps {
  currentUser: User;
}

export const ArchiveScreen: React.FC<ArchiveScreenProps> = () => {
  const [archivedReports, setArchivedReports] = useState<ItemReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ItemReport | null>(null);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadArchive();
  }, []);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadArchive(true);
  }, [dataVersion]);

  const loadArchive = async (silent = false) => {
    if (!silent) setLoading(true);
    const all = await reportService.getReportsForAdmin();
    // Archive screen shows Returned and Archived cases (Section 4 Screen 6)
    const closed = all.filter((r) => r.status === 'Archived' || r.status === 'Returned');
    setArchivedReports(closed);
    setSelectedReport((prev) => (prev ? closed.find((r) => r.id === prev.id) || prev : prev));
    setLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Historical Archive &amp; Closed Cases
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">
              Read-Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Permanent repository of verified returns and cases archived after the 90-day inactivity retention threshold.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List of Archived cases */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading archive records...</div>
          ) : archivedReports.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Archive className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-800">No Archived Cases Yet</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Completed return cases and items exceeding 90 days of inactivity will be securely catalogued here.
              </p>
            </div>
          ) : (
            archivedReports.map((r) => {
              const isSelected = selectedReport?.id === r.id;

              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className={`p-4 rounded-xl border bg-white transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{r.itemName}</span>
                        <span className="text-[11px] font-mono text-slate-400">#{r.id}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {r.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {r.date}
                        </span>
                        <span>Owner/Claimant: {r.userName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={r.status} size="sm" />
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Read-Only Record */}
        <div className="lg:col-span-1">
          {selectedReport ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sticky top-20 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Archived Case Record
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{selectedReport.itemName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {selectedReport.urgent && <UrgentBadge />}
                  <StatusBadge status={selectedReport.status} size="sm" />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Business Rule 4 Enforced: Read-Only Record</span>
                </div>
                <p>
                  This case has reached its final resolution and cannot be reopened, edited, or re-claimed.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <p><strong>Category:</strong> {selectedReport.category}</p>
                <p><strong>Colour:</strong> <span className="capitalize">{selectedReport.colour}</span></p>
                <p><strong>Location:</strong> {selectedReport.location}</p>
                <p><strong>Submitted By:</strong> {selectedReport.userName} ({selectedReport.userEmail})</p>
                <p><strong>Date Logged:</strong> {selectedReport.date}</p>
                <p>
                  <strong>Contact:</strong>{' '}
                  {selectedReport.contactEmail || selectedReport.contactPhone ? (
                    <span>
                      {selectedReport.contactEmail && (
                        <a
                          href={`mailto:${selectedReport.contactEmail}`}
                          className="text-blue-700 underline hover:text-blue-900"
                        >
                          {selectedReport.contactEmail}
                        </a>
                      )}
                      {selectedReport.contactEmail && selectedReport.contactPhone && ' · '}
                      {selectedReport.contactPhone && (
                        <a
                          href={`tel:${selectedReport.contactPhone}`}
                          className="text-blue-700 underline hover:text-blue-900"
                        >
                          {selectedReport.contactPhone}
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </p>
                {selectedReport.verificationNotes && (
                  <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-900 text-xs">
                    <strong>Handover / Closure Notes:</strong> {selectedReport.verificationNotes}
                  </div>
                )}
              </div>

              {/* Photo & Alt text */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">Photo &amp; Alt text:</span>
                <ReportPhoto
                  imageUrl={selectedReport.imageUrl}
                  imageAltText={selectedReport.imageAltText}
                  label={`Photo of ${selectedReport.itemName}`}
                />
                {selectedReport.imageAltText && (
                  <p className="text-[10px] text-slate-500 italic">
                    Alt: {selectedReport.imageAltText}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700">Description:</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {selectedReport.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
              Select an archived record from the list to view its immutable closure details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
