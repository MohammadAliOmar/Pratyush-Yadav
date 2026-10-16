import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

interface ReportPhotoProps {
  imageUrl?: string;
  imageAltText?: string;
  label: string;
}

export const ReportPhoto: React.FC<ReportPhotoProps> = ({
  imageUrl,
  imageAltText,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!imageUrl) {
    return (
      <div className="h-36 w-full border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-400 bg-slate-50/50">
        <ImageIcon className="w-5 h-5 text-slate-300" />
        <span className="text-xs">No photo provided</span>
      </div>
    );
  }

  const effectiveAlt = imageAltText?.trim() || label;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Enlarge ${label}`}
        className="h-36 w-full rounded-xl overflow-hidden border border-slate-200 group relative block cursor-pointer focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
      >
        <img
          src={imageUrl}
          alt={effectiveAlt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
        <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="bg-slate-900/80 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-xs">
            Click to enlarge
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close photo"
              className="absolute -top-10 right-0 sm:-right-10 text-white/80 hover:text-white p-1 rounded-lg bg-slate-900/60 hover:bg-slate-900 transition-colors cursor-pointer focus:ring-2 focus:ring-white focus:outline-hidden"
            >
              <X className="w-6 h-6" />
            </button>

            <img
              src={imageUrl}
              alt={effectiveAlt}
              className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl border border-white/10"
            />

            {imageAltText && (
              <p className="text-xs text-white/90 text-center mt-3 px-4 py-1.5 bg-slate-900/70 rounded-md max-w-xl">
                {imageAltText}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
