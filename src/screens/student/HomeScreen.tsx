import React, { useEffect, useState } from 'react';
import { User, ItemReport } from '../../types';
import { reportService } from '../../services/reportService';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button } from '../../components/common/Button';
import {
  Search,
  CheckCircle2,
  Calendar,
  MapPin,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface HomeScreenProps {
  currentUser: User;
  onNavigate: (screen: string, reportId?: string) => void;
  onStartReport: (type: 'lost' | 'found') => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  currentUser,
  onNavigate,
  onStartReport,
}) => {
  const [recentReports, setRecentReports] = useState<ItemReport[]>([]);
  const [loading, setLoading] = useState(true);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadReports();
  }, [currentUser.id]);

  // Live refresh when an administrator updates one of my reports
  useEffect(() => {
    if (dataVersion > 0) loadReports(true);
  }, [dataVersion]);

  const loadReports = async (silent = false) => {
    if (!silent) setLoading(true);
    const myReports = await reportService.getMyReports();
    setRecentReports(myReports.slice(0, 5));
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white rounded-3xl p-6 sm:p-8 shadow-md">
        <div className="max-w-xl space-y-2">
          <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-semibold backdrop-blur-xs">
            Victoria University Sydney Campus
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome, {currentUser.name}
          </h1>
          <p className="text-sm text-blue-100 leading-relaxed">
            Report lost or found belongings across campus buildings. Our administration team securely coordinates verified returns to protect student privacy.
          </p>
        </div>
      </div>

      {/* Two Big Actions (Section 4 Screen 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Action 1: Report Lost */}
        <button
          type="button"
          onClick={() => onStartReport('lost')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border-2 border-slate-200 hover:border-blue-600 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Search className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                I Lost Something
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Submit an item description, category, and where you last had it. Campus administrators will review matching found property.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            <span>Report a lost item</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Action 2: Report Found */}
        <button
          type="button"
          onClick={() => onStartReport('found')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border-2 border-slate-200 hover:border-emerald-600 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                I Found Something
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Hand the item to a security desk or library and log its details so administrators can return it to the rightful owner.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
            <span>Report a found item</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </button>
      </div>

      {/* Account Flag Notification if any */}
      {currentUser.flagged && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <div className="font-bold">Account Notice</div>
            <p>
              Your account has a notice: {currentUser.flagReason || 'Requires review by campus administration'}.
              If you have questions, please visit Level 1 Security.
            </p>
          </div>
        </div>
      )}

      {/* User's 5 Most Recent Reports */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Recent Reports</h2>
            <p className="text-xs text-slate-500">
              Only you and authorised administrators can see your report statuses.
            </p>
          </div>
          {recentReports.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('student_my_reports')}
              rightIcon={<ArrowRight className="w-3.5 h-3.5 ml-1" />}
            >
              View All ({recentReports.length})
            </Button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading reports...</div>
        ) : recentReports.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">No reports submitted yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                If you have misplaced personal belongings or found an unattended item on campus, submit a report above.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {recentReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => onNavigate('student_status', report.id)}
                className="w-full text-left bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs rounded-xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                        report.type === 'lost'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {report.type}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 truncate">
                      {report.itemName}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {report.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {report.date}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span>Category: {report.category}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <StatusBadge status={report.status} />
                  <ArrowRight className="w-4 h-4 text-slate-300 sm:block hidden" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
