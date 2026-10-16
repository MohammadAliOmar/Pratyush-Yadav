import React, { useEffect, useState } from 'react';
import { User, ItemReport, MatchSuggestion, Notification } from '../../types';
import { reportService } from '../../services/reportService';
import { matchService } from '../../services/matchService';
import { notificationService } from '../../services/notificationService';
import { adminAccountService } from '../../services/adminAccountService';
import { StatusBadge } from '../../components/common/StatusBadge';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import { Button } from '../../components/common/Button';
import {
  GitCompare,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Bell,
  ArrowRight,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface AdminDashboardScreenProps {
  currentUser: User;
  onNavigate: (
    screen: string,
    reportId?: string,
    matchId?: string,
    preset?: { type?: 'lost' | 'found' }
  ) => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  currentUser,
  onNavigate,
}) => {
  const [reports, setReports] = useState<ItemReport[]>([]);
  const [matches, setMatches] = useState<MatchSuggestion[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [flaggedUsersCount, setFlaggedUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadDashboardData(true);
  }, [dataVersion]);

  const loadDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    const [allReports, queueMatches, notifs, flaggedUsers] = await Promise.all([
      reportService.getReportsForAdmin(),
      matchService.getAdminMatchingQueue(),
      notificationService.getAdminNotifications(),
      adminAccountService.getFlaggedUsers(),
    ]);

    setReports(allReports);
    setMatches(queueMatches);
    setNotifications(notifs);
    setFlaggedUsersCount(flaggedUsers.length);
    setLoading(false);
  };

  const statusCounts = {
    Submitted: reports.filter((r) => r.status === 'Submitted').length,
    UnderReview: reports.filter((r) => r.status === 'Under Review').length,
    PossibleMatch: reports.filter((r) => r.status === 'Possible Match').length,
    PendingVerification: reports.filter((r) => r.status === 'Pending Verification').length,
    Returned: reports.filter((r) => r.status === 'Returned').length,
    Rejected: reports.filter((r) => r.status === 'Rejected').length,
    Archived: reports.filter((r) => r.status === 'Archived').length,
  };

  const pendingMatchesCount = matches.filter((m) => m.status === 'pending').length;

  // Filter open urgent reports (urgent === true and status not Returned, Archived or Rejected)
  const urgentReports = reports.filter(
    (r) =>
      r.urgent === true &&
      r.status !== 'Returned' &&
      r.status !== 'Archived' &&
      r.status !== 'Rejected'
  );

  // Filter and sort open lost and found reports (excluding Returned and Archived)
  const openLostReports = reports.filter(
    (r) => r.type === 'lost' && r.status !== 'Returned' && r.status !== 'Archived'
  );
  const sortedLostReports = [...openLostReports].sort((a, b) => {
    const aUrgent = a.urgent && a.status !== 'Rejected';
    const bUrgent = b.urgent && b.status !== 'Rejected';
    if (aUrgent && !bUrgent) return -1;
    if (!aUrgent && bUrgent) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const displayedLostReports = sortedLostReports.slice(0, 6);

  const openFoundReports = reports.filter(
    (r) => r.type === 'found' && r.status !== 'Returned' && r.status !== 'Archived'
  );
  const sortedFoundReports = [...openFoundReports].sort((a, b) => {
    const aUrgent = a.urgent && a.status !== 'Rejected';
    const bUrgent = b.urgent && b.status !== 'Rejected';
    if (aUrgent && !bUrgent) return -1;
    if (!aUrgent && bUrgent) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const displayedFoundReports = sortedFoundReports.slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Administrative Control Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Overview of Victoria University campus lost &amp; found inventory, match queue, and security alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('admin_search')}
            leftIcon={<FileText className="w-4 h-4 mr-1" />}
          >
            Search All Reports
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('admin_queue')}
            leftIcon={<GitCompare className="w-4 h-4 mr-1" />}
          >
            Review Match Queue ({pendingMatchesCount} new)
          </Button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* New matches waiting */}
        <div
          onClick={() => onNavigate('admin_queue')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">New Matches Waiting</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <GitCompare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{pendingMatchesCount}</div>
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
            <span>Score threshold &ge; 45%</span>
            <ArrowRight className="w-3 h-3" />
          </p>
        </div>

        {/* Pending Verification */}
        <div
          onClick={() => onNavigate('admin_search', undefined)}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">In Verification</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{statusCounts.PendingVerification}</div>
          <p className="text-[11px] text-slate-500 font-medium">Undergoing category checklist</p>
        </div>

        {/* Flagged Accounts */}
        <div
          onClick={() => onNavigate('admin_flagged')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Flagged Accounts</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                flaggedUsersCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{flaggedUsersCount}</div>
          <p
            className={`text-[11px] font-medium ${
              flaggedUsersCount > 0 ? 'text-amber-600' : 'text-slate-500'
            }`}
          >
            Abuse / high rejection counts
          </p>
        </div>

        {/* Successfully Returned */}
        <div
          onClick={() => onNavigate('admin_archive')}
          className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Items Returned</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{statusCounts.Returned}</div>
          <p className="text-[11px] text-slate-500 font-medium">Verified ownership cases closed</p>
        </div>
      </div>

      {/* Reports Count by Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Campus Report Status Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Submitted</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.Submitted}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Under Review</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.UnderReview}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Possible Match</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.PossibleMatch}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-600 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Pending Verif.</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.PendingVerification}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Returned</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.Returned}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Rejected</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.Rejected}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
              <span className="text-[11px] font-medium text-slate-600">Archived</span>
            </div>
            <div className="text-xl font-semibold text-slate-900">{statusCounts.Archived}</div>
          </div>
        </div>
      </div>

      {/* Urgent Panel (shown only when at least one report is urgent and open) */}
      {urgentReports.length > 0 && (
        <div className="bg-white border border-rose-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-rose-50/70 border-b border-rose-100 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-rose-900">Urgent reports</h2>
              <UrgentBadge count={urgentReports.length} />
            </div>
            <span className="text-xs text-rose-700 font-medium">
              Requires immediate administrative review
            </span>
          </div>

          <div className="divide-y divide-rose-100/60 p-2 sm:p-3">
            {urgentReports.map((r) => (
              <div
                key={r.id}
                onClick={() => onNavigate('admin_search', r.id)}
                className="p-3 rounded-xl hover:bg-rose-50/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
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
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {r.itemName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {r.category} · {r.location} · {r.date}
                    </span>
                  </div>

                  {r.urgentReason && (
                    <p className="text-xs text-rose-700 truncate font-medium">
                      Reason: {r.urgentReason}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                    <span>Reporter: <strong className="text-slate-700">{r.userName}</strong></span>
                    {r.contactEmail && <span>Email: {r.contactEmail}</span>}
                    {r.contactPhone && <span>Mobile: {r.contactPhone}</span>}
                  </div>
                </div>

                <div className="shrink-0 self-start sm:self-center">
                  <StatusBadge status={r.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two lists: Lost reports (left) & Found reports (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Lost Reports */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Lost reports ({openLostReports.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin_search', undefined, undefined, { type: 'lost' })}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              View all lost reports
            </button>
          </div>

          {displayedLostReports.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No lost reports yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedLostReports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onNavigate('admin_search', r.id)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-slate-50 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt={r.imageAltText || r.itemName}
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                    )}

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-900 transition-colors">
                          {r.itemName}
                        </span>
                        {r.urgent && <UrgentBadge />}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {r.category} · {r.location} · {r.date}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {r.userName}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Found Reports */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Found reports ({openFoundReports.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin_search', undefined, undefined, { type: 'found' })}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              View all found reports
            </button>
          </div>

          {displayedFoundReports.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No found reports yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedFoundReports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onNavigate('admin_search', r.id)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-slate-50 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt={r.imageAltText || r.itemName}
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                    )}

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-900 transition-colors">
                          {r.itemName}
                        </span>
                        {r.urgent && <UrgentBadge />}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {r.category} · {r.location} · {r.date}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {r.userName}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security & System Notifications (Full width below the two lists) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            Admin Alerts
          </h2>
          <span className="text-xs text-slate-500">Latest activity</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No active notifications.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] ${
                      n.type === 'abuse_alert'
                        ? 'bg-rose-100 text-rose-800'
                        : n.type === 'account_flagged'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {n.type.replace('_', ' ')}
                  </span>
                  <span className="text-slate-400">
                    {new Date(n.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-xs text-slate-800 leading-snug font-medium">
                  {n.message}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
