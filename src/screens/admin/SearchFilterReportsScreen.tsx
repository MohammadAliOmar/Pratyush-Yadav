import React, { useEffect, useState, useRef } from 'react';
import { User, ItemReport, ReportStatus, CAMPUS_LOCATIONS } from '../../types';
import { reportService, ReportFilterOptions } from '../../services/reportService';
import { appStorage } from '../../services/storage';
import { StatusBadge } from '../../components/common/StatusBadge';
import { CategoryDropdown } from '../../components/common/CategoryDropdown';
import { Button } from '../../components/common/Button';
import { ReportPhoto } from '../../components/common/ReportPhoto';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import {
  Search,
  Calendar,
  MapPin,
  User as UserIcon,
  X,
  AlertCircle,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface SearchFilterReportsScreenProps {
  currentUser: User;
  onNavigateToVerification?: (lostReportId: string) => void;
  initialReportId?: string;
  initialType?: 'lost' | 'found';
}

export const SearchFilterReportsScreen: React.FC<SearchFilterReportsScreenProps> = ({
  currentUser,
  onNavigateToVerification,
  initialReportId,
  initialType,
}) => {
  const [reports, setReports] = useState<ItemReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ItemReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');
  const [location, setLocation] = useState('All');
  const [type, setType] = useState<'All' | 'lost' | 'found'>(initialType || 'All');
  const [priority, setPriority] = useState<'All' | 'urgent'>('All');

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Status Change Modal State
  const [statusChangeOpen, setStatusChangeOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<ReportStatus>('Under Review');
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportsToDelete, setReportsToDelete] = useState<ItemReport[]>([]);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear Urgent Dialog State
  const [clearUrgentOpen, setClearUrgentOpen] = useState(false);
  const [clearUrgentReason, setClearUrgentReason] = useState('');
  const [clearUrgentError, setClearUrgentError] = useState<string | null>(null);
  const [isClearingUrgent, setIsClearingUrgent] = useState(false);

  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const handledInitialReportIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (initialType) {
      setType(initialType);
    }
  }, [initialType]);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadReports();
  }, [search, category, status, location, type, priority]);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadReports(true);
  }, [dataVersion]);

  // Handle initialReportId auto-selection & scrolling
  useEffect(() => {
    if (!loading && initialReportId && handledInitialReportIdRef.current !== initialReportId) {
      const match = reports.find((r) => r.id === initialReportId);
      if (match) {
        setSelectedReport(match);
        handledInitialReportIdRef.current = initialReportId;
        setTimeout(() => {
          detailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
  }, [loading, reports, initialReportId]);

  // Keyboard Escape listener for dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteDialogOpen) setDeleteDialogOpen(false);
        if (clearUrgentOpen) setClearUrgentOpen(false);
        if (statusChangeOpen) setStatusChangeOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteDialogOpen, clearUrgentOpen, statusChangeOpen]);

  const loadReports = async (silent = false) => {
    if (!silent) setLoading(true);
    const filters: ReportFilterOptions = {
      search: search.trim() || undefined,
      category: category !== 'All' ? category : undefined,
      status: status !== 'All' ? status : undefined,
      location: location !== 'All' ? location : undefined,
      type: type !== 'All' ? type : undefined,
      urgent: priority === 'urgent' ? true : undefined,
    };
    const data = await reportService.getReportsForAdmin(filters);
    setReports(data);
    if (silent) {
      // Keep the open details panel in step with the latest data
      setSelectedReport((prev) => {
        if (!prev) return prev;
        const latest = appStorage.getReportById(prev.id);
        return latest || prev;
      });
    }
    setLoading(false);
  };

  const handleUpdateStatus = async () => {
    if (!selectedReport) return;
    setStatusError(null);

    // Business Rule 1 check: No manual 'Returned' option
    if (newStatus === 'Returned') {
      setStatusError('Returned status can only be set via the Ownership Verification protocol.');
      return;
    }

    const res = await reportService.updateReportStatus(
      selectedReport.id,
      newStatus,
      statusReason
    );

    if (res.success) {
      setStatusChangeOpen(false);
      setStatusReason('');
      loadReports();
      const updated = appStorage.getReportById(selectedReport.id);
      setSelectedReport(updated || null);
    } else {
      setStatusError(res.error || 'Failed to update status.');
    }
  };

  const handleExecuteDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    const ids = reportsToDelete.map((r) => r.id);
    const res = await reportService.deleteReports(ids, deleteReason);
    setIsDeleting(false);

    if (res.success) {
      setDeleteDialogOpen(false);
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      if (selectedReport && ids.includes(selectedReport.id)) {
        setSelectedReport(null);
      }
      setSuccessMessage(`Deleted ${res.deleted} report(s).`);
      loadReports();
    } else {
      setDeleteError(res.error || 'Failed to delete reports.');
    }
  };

  const handleExecuteClearUrgent = async () => {
    if (!selectedReport) return;
    setIsClearingUrgent(true);
    setClearUrgentError(null);
    const res = await reportService.clearUrgent(selectedReport.id, clearUrgentReason);
    setIsClearingUrgent(false);

    if (res.success) {
      setClearUrgentOpen(false);
      setClearUrgentReason('');
      loadReports();
      const updated = appStorage.getReportById(selectedReport.id);
      setSelectedReport(updated || null);
    } else {
      setClearUrgentError(res.error || 'Failed to clear urgent flag.');
    }
  };

  const returnedCount = reportsToDelete.filter((r) => r.status === 'Returned').length;
  const hasPendingVerification = reportsToDelete.some((r) => r.status === 'Pending Verification');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Search &amp; Filter Reports
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authorised administrator inventory across all Victoria University campus locations.
          </p>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keywords, items, descriptions, submitter names, colours..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {/* Category */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Category</label>
            <CategoryDropdown
              value={category}
              onChange={(val) => setCategory(val)}
              includeAllOption
              label=""
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            >
              <option value="All">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Under Review">Under Review</option>
              <option value="Possible Match">Possible Match</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Returned">Returned</option>
              <option value="Rejected">Rejected</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Report Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            >
              <option value="All">All Types</option>
              <option value="lost">Lost Only</option>
              <option value="found">Found Only</option>
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Campus Location</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            >
              <option value="All">All Locations</option>
              {CAMPUS_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'All' | 'urgent')}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            >
              <option value="All">All reports</option>
              <option value="urgent">Urgent only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area: List + Selected Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports List (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Showing {reports.length} reports</span>
            {(search || category !== 'All' || status !== 'All' || location !== 'All' || type !== 'All' || priority !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategory('All');
                  setStatus('All');
                  setLocation('All');
                  setType('All');
                  setPriority('All');
                }}
                className="text-blue-600 hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Optional Success Alert */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
              <span>{successMessage}</span>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
                aria-label="Dismiss message"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Batch Actions Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={reports.length > 0 && reports.every((r) => selectedIds.includes(r.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(Array.from(new Set([...selectedIds, ...reports.map((r) => r.id)])));
                    } else {
                      const currentShownSet = new Set(reports.map((r) => r.id));
                      setSelectedIds((prev) => prev.filter((id) => !currentShownSet.has(id)));
                    }
                  }}
                  aria-label="Select all shown"
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Select all shown</span>
              </label>
              <span className="text-slate-500 font-semibold">{selectedIds.length} selected</span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-blue-600 hover:underline cursor-pointer"
                >
                  Clear selection
                </button>
              )}
            </div>

            <Button
              variant="danger"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => {
                const targets = appStorage.getReports().filter((r) => selectedIds.includes(r.id));
                setReportsToDelete(targets);
                setDeleteReason('');
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
            >
              Delete selected
            </Button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading reports...</div>
          ) : reports.length === 0 ? (
            /* Empty State */
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-800">No Reports Match Filter Criteria</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try widening your search terms, changing the category, or selecting "All Statuses".
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {reports.map((r) => {
                const isSelected = selectedReport?.id === r.id;
                const isChecked = selectedIds.includes(r.id);

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReport(r)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer bg-white flex items-start gap-3 ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, r.id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== r.id));
                          }
                        }}
                        aria-label={`Select report ${r.itemName}`}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                r.type === 'lost'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {r.type}
                            </span>
                            {r.urgent && <UrgentBadge />}
                            <span className="text-xs text-slate-400 font-mono">#{r.id}</span>
                            <h3 className="font-bold text-sm text-slate-900 truncate">
                              {r.itemName}
                            </h3>
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-2">
                            {r.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {r.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {r.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <UserIcon className="w-3 h-3 text-slate-400" />
                              {r.userName}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <StatusBadge status={r.status} size="sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Report Inspection Panel (1 col) */}
        <div className="lg:col-span-1" ref={detailsPanelRef}>
          {selectedReport ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sticky top-20 space-y-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Report Details
                  </span>
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {selectedReport.itemName}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status and Badge */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedReport.status} size="md" />
                  {selectedReport.urgent && <UrgentBadge />}
                </div>
                <span className="text-xs font-mono text-slate-400">ID: {selectedReport.id}</span>
              </div>

              {/* Urgent banner if present */}
              {selectedReport.urgent && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <UrgentBadge />
                  </div>
                  {selectedReport.urgentReason && (
                    <p className="text-rose-800 leading-relaxed">
                      <strong>Urgent:</strong> {selectedReport.urgentReason}
                    </p>
                  )}
                </div>
              )}

              {/* Submitter info */}
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs space-y-1">
                <span className="font-bold text-blue-900 block">Submitting User Information</span>
                <p className="text-slate-800"><strong>Name:</strong> {selectedReport.userName}</p>
                <p className="text-slate-800"><strong>Email:</strong> {selectedReport.userEmail}</p>
                <p className="text-slate-800">
                  <strong>Contact email:</strong>{' '}
                  {selectedReport.contactEmail ? (
                    <a
                      href={`mailto:${selectedReport.contactEmail}`}
                      className="text-blue-700 underline hover:text-blue-900"
                    >
                      {selectedReport.contactEmail}
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </p>
                <p className="text-slate-800">
                  <strong>Mobile:</strong>{' '}
                  {selectedReport.contactPhone ? (
                    <a
                      href={`tel:${selectedReport.contactPhone}`}
                      className="text-blue-700 underline hover:text-blue-900"
                    >
                      {selectedReport.contactPhone}
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </p>
              </div>

              {/* Attributes list */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold text-slate-900">{selectedReport.category}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Colour:</span>
                  <span className="font-semibold text-slate-900 capitalize">{selectedReport.colour}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Location:</span>
                  <span className="font-semibold text-slate-900">{selectedReport.location}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-semibold text-slate-900">{selectedReport.date}</span>
                </div>
                {selectedReport.whereItemIs && (
                  <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-900 text-xs">
                    <strong>Handover Custody:</strong> {selectedReport.whereItemIs}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700">Description:</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 whitespace-pre-wrap">
                  {selectedReport.description}
                </p>
              </div>

              {/* Photo preview */}
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

              {/* Allowed Admin Actions */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Admin Actions</span>

                {/* Status Change Button */}
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setNewStatus(selectedReport.status === 'Archived' ? 'Submitted' : 'Under Review');
                    setStatusError(null);
                    setStatusChangeOpen(true);
                  }}
                >
                  Change Status
                </Button>

                {/* If Pending Verification, allow jump to verification */}
                {selectedReport.status === 'Pending Verification' && onNavigateToVerification && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => onNavigateToVerification(selectedReport.id)}
                  >
                    Open Verification Checklist &rarr;
                  </Button>
                )}

                {/* Clear Urgent Flag button (only when report is urgent) */}
                {selectedReport.urgent && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setClearUrgentReason('');
                      setClearUrgentError(null);
                      setClearUrgentOpen(true);
                    }}
                  >
                    Clear urgent flag
                  </Button>
                )}

                {/* Delete This Report */}
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setReportsToDelete([selectedReport]);
                    setDeleteReason('');
                    setDeleteError(null);
                    setDeleteDialogOpen(true);
                  }}
                >
                  Delete this report
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
              Select any report from the left to inspect full private details and perform administrative actions.
            </div>
          )}
        </div>
      </div>

      {/* Delete Dialog */}
      {deleteDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4"
          >
            <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
              Delete {reportsToDelete.length} report(s) permanently
            </h3>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                {deleteError}
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              This permanently removes the report(s), their photos and any match suggestions linked to them. This cannot be undone. An entry is kept in the audit log.
            </p>

            {/* Returned cases warning */}
            {returnedCount > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  {returnedCount} of these are Returned (closed) cases. Deleting them removes the record of a completed return.
                </span>
              </div>
            )}

            {/* Pending Verification warning */}
            {hasPendingVerification && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting a report in Pending Verification sends the other report in that pair back to Under Review.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for deleting <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate test report submitted by error"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Minimum 5 characters required for audit entry.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                disabled={isDeleting}
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                disabled={deleteReason.trim().length < 5 || isDeleting}
                onClick={handleExecuteDelete}
              >
                Delete {reportsToDelete.length} report(s)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Urgent Flag Dialog */}
      {clearUrgentOpen && selectedReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-urgent-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4"
          >
            <h3 id="clear-urgent-dialog-title" className="text-base font-bold text-slate-900">
              Clear urgent flag
            </h3>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 block">Report:</span>
              <span className="font-bold text-slate-900">{selectedReport.itemName}</span>
              {selectedReport.urgentReason && (
                <p className="text-slate-600 italic">Current urgent reason: "{selectedReport.urgentReason}"</p>
              )}
            </div>

            {clearUrgentError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                {clearUrgentError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for clearing urgent flag <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={clearUrgentReason}
                onChange={(e) => setClearUrgentReason(e.target.value)}
                placeholder="e.g. Owner notified ID card was reissued; urgency resolved"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Minimum 5 characters required for audit entry.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                disabled={isClearingUrgent}
                onClick={() => setClearUrgentOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isClearingUrgent}
                disabled={clearUrgentReason.trim().length < 5 || isClearingUrgent}
                onClick={handleExecuteClearUrgent}
              >
                Clear flag
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal (Business Rule 1: No manual Returned option) */}
      {statusChangeOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Update Status: {selectedReport.itemName}
            </h3>

            {statusError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                {statusError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                >
                  <option value="Submitted">Submitted</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Possible Match">Possible Match</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Archived">Archived</option>
                  {/* Note: "Returned" is intentionally EXCLUDED per Business Rule 1 */}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Business Rule 1: The "Returned" status cannot be set manually. It is granted strictly via successful ownership verification.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Administrative Reason / Note
                </label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Manual audit completed by security desk"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStatusChangeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpdateStatus}
              >
                Save Status
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
