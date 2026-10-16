import React, { useEffect, useState } from 'react';
import { User, AdminAction } from '../../types';
import { auditService } from '../../services/auditService';
import {
  History,
  ShieldCheck,
  Clock,
  User as UserIcon,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';

interface AuditLogScreenProps {
  currentUser: User;
}

export const AuditLogScreen: React.FC<AuditLogScreenProps> = () => {
  const [logs, setLogs] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);

  const dataVersion = useDataVersion();

  useEffect(() => {
    loadLogs();
  }, []);

  // Live refresh when data arrives from another computer
  useEffect(() => {
    if (dataVersion > 0) loadLogs(true);
  }, [dataVersion]);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await auditService.getAuditLogs();
    setLogs(data);
    setLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Security &amp; Administrative Audit Trail
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              Immutable Log
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Compliant with NFR-08 &amp; Australian Privacy Principles: actions cannot be modified or deleted.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">No actions recorded in audit log.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {logs.map((log) => {
              const formattedDate = new Date(log.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div key={log.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          log.action.includes('Passed')
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.action.includes('Failed') || log.action.includes('Suspended') || log.action.includes('Deleted')
                            ? 'bg-rose-100 text-rose-800'
                            : log.action.includes('Flagged') || log.action.includes('Warning') || log.action.includes('Cleared')
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-xs font-mono text-slate-400">ID: #{log.id}</span>
                      {log.reportId && (
                        <span className="text-xs text-slate-500 font-mono">Ref: {log.reportId}</span>
                      )}
                    </div>

                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formattedDate}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 leading-relaxed font-medium">
                    {log.details}
                  </p>

                  {/* Verification questions log if present */}
                  {log.verificationLog && log.verificationLog.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 mt-2">
                      <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                        Recorded Question Responses:
                      </span>
                      <div className="space-y-1">
                        {log.verificationLog.map((v, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                v.matched ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {v.matched ? 'MATCHED' : 'NOT MATCHED'}
                            </span>
                            <span className="text-slate-700">
                              {v.question} {v.notes && <span className="italic text-slate-500">— {v.notes}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      <strong>Operator:</strong> {log.adminName} ({log.adminId})
                    </span>

                    {log.outcome && (
                      <span className="font-semibold text-slate-700">
                        Outcome: <span className="text-blue-700">{log.outcome}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
