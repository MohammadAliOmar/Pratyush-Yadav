import React, { useEffect, useState } from 'react';
import { ItemReport, CAMPUS_LOCATIONS } from '../../types';
import { reportService } from '../../services/reportService';
import { Button } from '../../components/common/Button';
import { ArrowLeft, AlertCircle, Lock } from 'lucide-react';

interface EditReportScreenProps {
  reportId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const EditReportScreen: React.FC<EditReportScreenProps> = ({
  reportId,
  onBack,
  onSuccess,
}) => {
  const [report, setReport] = useState<ItemReport | null>(null);
  const [itemName, setItemName] = useState('');
  const [colour, setColour] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [whereItemIs, setWhereItemIs] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  const loadReport = async () => {
    setLoading(true);
    const data = await reportService.getReportById(reportId);
    if (data) {
      setReport(data);
      setItemName(data.itemName);
      setColour(data.colour);
      setLocation(data.location);
      setDate(data.date);
      setDescription(data.description);
      setWhereItemIs(data.whereItemIs || '');
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading...</div>;
  }

  if (!report) {
    return (
      <div className="max-w-md mx-auto p-8 text-center space-y-3">
        <p className="text-sm text-slate-700">Report not found.</p>
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  // Business Rule 2 & 4: Editing Lock
  const isLocked =
    report.locked ||
    report.status === 'Pending Verification' ||
    report.status === 'Returned' ||
    report.status === 'Archived';

  if (isLocked) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Editing Locked</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          {report.status === 'Pending Verification'
            ? 'Editing is locked because this report is currently undergoing match verification.'
            : 'Closed and archived cases cannot be modified.'}
        </p>
        <Button variant="secondary" size="md" onClick={onBack}>
          Return to Status View
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await reportService.updateReport(report.id, {
        itemName,
        colour,
        location,
        date,
        description,
        whereItemIs: report.type === 'found' ? whereItemIs : undefined,
      });

      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Failed to update report.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Edit Report: {report.itemName}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Category cannot be altered once logged. You may update description, color, or location.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Item Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Colour <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Campus Location <span className="text-rose-500">*</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              >
                {CAMPUS_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          {report.type === 'found' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Where is the item now?
              </label>
              <input
                type="text"
                value={whereItemIs}
                onChange={(e) => setWhereItemIs(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" size="md" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
