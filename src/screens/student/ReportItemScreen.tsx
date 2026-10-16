import React, { useState } from 'react';
import { ItemCategory, ReportType, CAMPUS_LOCATIONS } from '../../types';
import { reportService } from '../../services/reportService';
import { CategoryDropdown } from '../../components/common/CategoryDropdown';
import { Button } from '../../components/common/Button';
import {
  ArrowLeft,
  Camera,
  AlertCircle,
  HelpCircle,
  MapPin,
  Calendar,
  Palette,
  FileText,
} from 'lucide-react';

import { appStorage } from '../../services/storage';
import { validateContact, validateUrgent } from '../../services/contactValidation';

interface ReportItemScreenProps {
  initialType?: ReportType;
  onBack: () => void;
  onSuccess: (reportId: string) => void;
}

export const ReportItemScreen: React.FC<ReportItemScreenProps> = ({
  initialType = 'lost',
  onBack,
  onSuccess,
}) => {
  const currentUser = appStorage.getCurrentUser();
  const [reportType, setReportType] = useState<ReportType>(initialType);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('Wallet');
  const [colour, setColour] = useState('');
  const [location, setLocation] = useState<string>('Library (Level 2)');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [whereItemIs, setWhereItemIs] = useState('');

  // Contact details & Urgency
  const [contactEmail, setContactEmail] = useState(currentUser?.email || '');
  const [contactPhone, setContactPhone] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');

  // Image upload simulation
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageAltText, setImageAltText] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!itemName.trim()) {
      newErrors.itemName = 'Item name is required.';
    }
    if (!category) {
      newErrors.category = 'Please select a category.';
    }
    if (!colour.trim()) {
      newErrors.colour = 'Primary colour is required (e.g. black, brown, silver).';
    }
    if (!location.trim()) {
      newErrors.location = 'Campus location is required.';
    }
    if (!date) {
      newErrors.date = 'Date is required.';
    }
    if (!description.trim()) {
      newErrors.description = 'Please provide a clear description of the item.';
    } else if (description.trim().length < 10) {
      newErrors.description = 'Description should be at least 10 characters long to aid matching.';
    }

    // Found item handover
    if (reportType === 'found' && !whereItemIs.trim()) {
      newErrors.whereItemIs = 'Please specify where the item was deposited (e.g. Handed to Level 1 Security).';
    }

    // Contact details validation
    const contactErr = validateContact(contactEmail, contactPhone);
    if (contactErr) {
      newErrors.contact = contactErr;
    }

    // Urgent validation
    const urgentErr = validateUrgent(urgent, urgentReason);
    if (urgentErr) {
      newErrors.urgentReason = urgentErr;
    }

    // Photo Alt Text requirement (NFR-06 WCAG 2.2 AA)
    if (imageUrl && !imageAltText.trim()) {
      newErrors.imageAltText = 'Accessibility requirement: A short description (alt text) for the photo is required before submitting.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);

    try {
      const res = await reportService.submitReport({
        type: reportType,
        itemName,
        category,
        colour,
        location,
        date,
        description,
        whereItemIs: reportType === 'found' ? whereItemIs : undefined,
        imageUrl: imageUrl || undefined,
        imageAltText: imageUrl ? imageAltText : undefined,
        contactEmail,
        contactPhone,
        urgent,
        urgentReason: urgent ? urgentReason : undefined,
      });

      if (res.success && res.report) {
        onSuccess(res.report.id);
      } else {
        setErrors({ form: res.error || 'Failed to submit report.' });
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Storage is full')) {
        setErrors({ form: 'Storage is full - remove the photo and try again' });
      } else {
        setErrors({ form: err.message || 'An error occurred.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image.'));
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 800;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('Canvas context not available.'));
          }
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.7;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);

          // Ensure data URL is under 250 KB (~340,000 base64 chars)
          const maxChars = 250 * 1024 * 1.35;
          while (dataUrl.length > maxChars && quality > 0.15) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          resolve(dataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Persistent photo upload handler (canvas-scaled JPEG < 250 KB)
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject non-image files
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({
        ...prev,
        photo: 'Please upload an image file (e.g. JPEG, PNG, WEBP).',
      }));
      return;
    }

    // Reject originals over 5 MB
    const fiveMB = 5 * 1024 * 1024;
    if (file.size > fiveMB) {
      setErrors((prev) => ({
        ...prev,
        photo: 'Image file size must be 5 MB or less.',
      }));
      return;
    }

    try {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.photo;
        return copy;
      });
      const persistentDataUrl = await processImageFile(file);
      setImageUrl(persistentDataUrl);
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        photo: err.message || 'Error processing image file.',
      }));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-xs text-slate-400">
          Takes ~1 minute to complete
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {reportType === 'lost' ? 'Report a Lost Item' : 'Report a Found Item'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Provide details used by our campus matching system. Only authorised staff can view these details.
          </p>
        </div>

        {/* Type Toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setReportType('lost');
              setErrors({});
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              reportType === 'lost'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            I Lost an Item
          </button>
          <button
            type="button"
            onClick={() => {
              setReportType('found');
              setErrors({});
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              reportType === 'found'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            I Found an Item
          </button>
        </div>

        {errors.form && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Item Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Item Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Black Leather Wallet, Silver MacBook Pro"
              className={`w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                errors.itemName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
              }`}
            />
            {errors.itemName && (
              <p className="text-xs text-rose-600 mt-1">{errors.itemName}</p>
            )}
          </div>

          {/* 2. Category Dropdown (fixed list) */}
          <CategoryDropdown
            value={category}
            onChange={(val) => setCategory(val)}
            required
            label="Item Category"
            error={errors.category}
          />

          {/* 3. Colour and Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Colour <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Palette className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  placeholder="e.g. Black, Navy, Silver"
                  className={`w-full pl-9 pr-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    errors.colour ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              </div>
              {errors.colour && (
                <p className="text-xs text-rose-600 mt-1">{errors.colour}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Campus Location <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    errors.location ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                >
                  {CAMPUS_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              {errors.location && (
                <p className="text-xs text-rose-600 mt-1">{errors.location}</p>
              )}
            </div>
          </div>

          {/* 4. Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Date {reportType === 'lost' ? 'Lost' : 'Found'} <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                  errors.date ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                }`}
              />
            </div>
            {errors.date && (
              <p className="text-xs text-rose-600 mt-1">{errors.date}</p>
            )}
          </div>

          {/* 5. Free-Text Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Free-Text Description <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe distinguishing marks, brand, condition, or unique stickers..."
              className={`w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                errors.description ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
              }`}
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <span>Used by semantic description similarity matching</span>
              <span>{description.length} chars</span>
            </div>
            {errors.description && (
              <p className="text-xs text-rose-600 mt-1">{errors.description}</p>
            )}
          </div>

          {/* 6. Handover detail (Found items only) */}
          {reportType === 'found' && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-1.5">
              <label className="block text-xs font-bold text-emerald-900">
                Where is the item now? <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={whereItemIs}
                onChange={(e) => setWhereItemIs(e.target.value)}
                placeholder="e.g. Handed to Level 1 Security Reception, or Library Desk"
                className={`w-full px-3 py-2 text-sm bg-white border rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-hidden ${
                  errors.whereItemIs ? 'border-rose-400' : 'border-emerald-300'
                }`}
              />
              <p className="text-[11px] text-emerald-700">
                Found items must be transferred to campus security or a verified department desk.
              </p>
              {errors.whereItemIs && (
                <p className="text-xs text-rose-600">{errors.whereItemIs}</p>
              )}
            </div>
          )}

          {/* Contact Details Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800">
                How can an administrator reach you?
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Give at least one. Only campus administrators can see this. It is used only to contact you about this report.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    errors.contact ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 0412 345 678"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    errors.contact ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              </div>
            </div>

            {errors.contact && (
              <p className="text-xs text-rose-600 font-medium">{errors.contact}</p>
            )}
          </div>

          {/* Urgent Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800">
                {reportType === 'found'
                  ? 'This found item is time-critical (for example a passport, student ID or keys the owner will need soon)'
                  : 'This is urgent (I need this back as soon as possible)'}
              </span>
            </label>
            <p className="text-[11px] text-slate-500">
              CampusFind is not an emergency service. In an emergency call 000.
            </p>

            {urgent && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    {reportType === 'found' ? 'Why is it time-critical?' : 'Why is it urgent?'}
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {urgentReason.length}/140
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={140}
                  value={urgentReason}
                  onChange={(e) => setUrgentReason(e.target.value)}
                  placeholder={
                    reportType === 'found'
                      ? 'Say why it is time-critical, for example: a passport or student ID the owner will need soon. Do not include medical details.'
                      : 'Say why it is time-critical, for example: needed for an exam today. Do not include medical details.'
                  }
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                    errors.urgentReason ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
                <p className="text-[11px] text-slate-500">
                  {reportType === 'found'
                    ? 'Say why it is time-critical, for example: a passport or student ID the owner will need soon. Do not include medical details.'
                    : 'Say why it is time-critical, for example: needed for an exam today. Do not include medical details.'}
                </p>
                {errors.urgentReason && (
                  <p className="text-xs text-rose-600 font-medium">{errors.urgentReason}</p>
                )}
              </div>
            )}
          </div>

          {/* 7. Optional Photo Upload & REQUIRED Alt Text */}
          <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-700">Attach Photo (Optional)</span>
              </div>
              <label className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer shadow-xs">
                <span>{imageUrl ? 'Change Photo' : 'Select Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="sr-only"
                />
              </label>
            </div>
            {errors.photo && (
              <p className="text-xs text-rose-600 font-medium">{errors.photo}</p>
            )}

            {imageUrl && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-3">
                  <img
                    src={imageUrl}
                    alt={imageAltText || 'Uploaded item preview'}
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-slate-700 block">
                      Image attached
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setImageAltText('');
                      }}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove photo
                    </button>
                  </div>
                </div>

                {/* Alt Text input - REQUIRED when image is added */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Photo Description (Alt text) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={imageAltText}
                    onChange={(e) => setImageAltText(e.target.value)}
                    placeholder="e.g. Front view of black leather bi-fold wallet on table"
                    className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden ${
                      errors.imageAltText ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Required for accessibility (WCAG 2.2 AA) and administrator review.
                  </p>
                  {errors.imageAltText && (
                    <p className="text-xs text-rose-600 mt-1">{errors.imageAltText}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Submission Button Pair */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onBack}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
            >
              Submit Report
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
