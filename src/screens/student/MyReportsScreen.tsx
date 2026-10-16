import React, { useEffect, useState } from 'react';
import { ItemReport } from '../../types';
import { reportService } from '../../services/reportService';
import { StatusBadge } from '../../components/common/StatusBadge';
import { UrgentBadge } from '../../components/common/UrgentBadge';
import { Button } from '../../components/common/Button';
import {
  FileText,
  MapPin,
  Calendar,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface MyReportsScreenProps {
  onNavigate: (screen: string, reportId?: string) => void;
  onStartReport: () => void;
}

export const MyReportsScreen: React.FC<MyReportsScreenProps> = ({
  onNavigate,
  onStartReport,
}) => {
  const [reports, setReports] = useState<ItemReport[]>([]);
  const [loading, setLoading] = useState(true);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadReports();
  }, []);

  // Live refresh when an administrator updates one of my reports
  useEffect(() => {
    if (dataVersion > 0) loadReports(true);
  }, [dataVersion]);

  const loadReports = async (silent = false) => {
    if (!silent) setLoading(true);
    const myReports = await reportService.getMyReports();
    setReports(myReports);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            My Campus Reports
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track the status of items you reported lost or found. Confidential under Australian Privacy Principles.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={onStartReport}
          leftIcon={<PlusCircle className="w-4 h-4 mr-1.5" />}
        >
          Submit New Report
        </Button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400">Loading reports...</div>
      ) : reports.length === 0 ? (
        /* Empty state (Section 4 Screen 4) */
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">
              You haven't submitted any reports yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              If you have misplaced an item on campus or handed over found property, submit a report to get started.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={onStartReport}
              leftIcon={<PlusCircle className="w-4 h-4 mr-1.5" />}
            >
              Submit a Report Now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => onNavigate('student_status', report.id)}
              className="w-full text-left bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs rounded-2xl p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
            >
              <div className="space-y-2 flex-1 min-w-0">
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
                  <h3 className="font-bold text-base text-slate-900 truncate">
                    {report.itemName}
                  </h3>
                  {report.urgent && <UrgentBadge />}
                  {report.flaggedDuplicate && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                      Duplicate Flag
                    </span>
                  )}
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
                  <span>Category: {report.category}</span>
                  <span>Colour: {report.colour}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <StatusBadge status={report.status} size="md" />
                <ArrowRight className="w-4 h-4 text-slate-300 sm:block hidden" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
