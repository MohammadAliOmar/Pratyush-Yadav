import React from 'react';
import { Mail, ExternalLink, Clock, CheckCircle2, X } from 'lucide-react';
import { SimulatedEmail } from '../../types';
import { appStorage } from '../../services/storage';
import { SIMULATED_EMAIL_DOMAINS } from '../../config/matchingConfig';

interface SimulatedInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVerifyUrl: (token: string, email: string) => void;
}

export const SimulatedInboxModal: React.FC<SimulatedInboxModalProps> = ({
  isOpen,
  onClose,
  onOpenVerifyUrl,
}) => {
  if (!isOpen) return null;

  const emails = appStorage.getSimulatedEmails().filter((email) => {
    const recipient = email.recipientEmail.toLowerCase();
    return SIMULATED_EMAIL_DOMAINS.some(
      (dom) => recipient.endsWith('@' + dom) || recipient.endsWith('.' + dom)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="inbox-title" className="font-semibold text-base leading-tight">
                Simulated University Inbox
              </h2>
              <p className="text-xs text-slate-300">
                (Mock mail server for testing email confirmation links)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice banner */}
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-900 text-xs flex items-center gap-2">
          <span className="font-semibold px-1.5 py-0.5 bg-amber-200 rounded text-[10px]">NOTE</span>
          <span>
            Only @campusfind.test test addresses appear here. Real university emails go to the student's own mailbox.
          </span>
        </div>

        {/* Email list */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {emails.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              No confirmation emails yet. Submit a sign-up form to see verification messages here.
            </div>
          ) : (
            emails.map((email) => {
              const formattedDate = new Date(email.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={email.id}
                  className={`border rounded-xl p-3.5 transition-all ${
                    email.used
                      ? 'bg-slate-50 border-slate-200 opacity-75'
                      : 'bg-white border-blue-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-slate-900 block">
                        To: {email.recipientEmail}
                      </span>
                      <h3 className="text-sm font-bold text-blue-700">{email.subject}</h3>
                    </div>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {formattedDate}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-3">
                    CampusFind security verification request. To finalize your account setup, follow the single-use confirmation prompt below.
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">
                      Token status:{' '}
                      {email.used ? (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-slate-400" /> Used / Expired
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">Active (Single-use)</span>
                      )}
                    </span>

                    {!email.used ? (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenVerifyUrl(email.token, email.recipientEmail);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Verification Link
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Action completed</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Close Inbox
          </button>
        </div>
      </div>
    </div>
  );
};
