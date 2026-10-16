import React, { useState } from 'react';
import { Button } from '../../components/common/Button';
import { authService } from '../../services/authService';
import { ShieldAlert, CheckCircle2, XCircle, ArrowRight, RotateCcw } from 'lucide-react';

interface EmailVerificationScreenProps {
  token: string;
  email: string;
  onNavigateToSignIn: () => void;
  onNavigateToSignUp: () => void;
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  token,
  email,
  onNavigateToSignIn,
  onNavigateToSignUp,
}) => {
  const [decisionState, setDecisionState] = useState<'prompt' | 'confirmed' | 'cancelled'>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDecision = async (confirmed: boolean) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authService.handleVerificationDecision(token, email, confirmed);
      if (res.success) {
        if (confirmed) {
          setDecisionState('confirmed');
        } else {
          setDecisionState('cancelled');
        }
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2">
            <div className="font-medium">{errorMessage}</div>
            {errorMessage.includes('expired') && (
              <button
                type="button"
                onClick={onNavigateToSignUp}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Register again
              </button>
            )}
          </div>
        )}

        {decisionState === 'prompt' && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-800 text-[11px] font-semibold">
              Test address: no real email is sent
            </div>

            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900">
                Confirm Account Registration
              </h1>
              <p className="text-sm text-slate-600">
                Are you trying to create a CampusFind account with:
              </p>
              <div className="py-2 px-4 bg-slate-100 rounded-xl text-sm font-mono font-bold text-slate-900 inline-block">
                {email}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              To prevent unauthorized use of Victoria University email addresses, we require you to verify whether you initiated this request.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <Button
                variant="primary"
                size="md"
                isLoading={isLoading}
                onClick={() => handleDecision(true)}
                className="w-full sm:w-auto px-6 py-2.5 font-bold bg-emerald-600 hover:bg-emerald-700"
                leftIcon={<CheckCircle2 className="w-4 h-4 mr-1.5" />}
              >
                Yes, it's me
              </Button>
              <Button
                variant="danger"
                size="md"
                isLoading={isLoading}
                onClick={() => handleDecision(false)}
                className="w-full sm:w-auto px-6 py-2.5 font-bold"
                leftIcon={<XCircle className="w-4 h-4 mr-1.5" />}
              >
                No, that's not me
              </Button>
            </div>
          </div>
        )}

        {decisionState === 'confirmed' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Account Activated!</h2>
              <p className="text-sm text-slate-600">
                Your email has been confirmed. You can now sign in with your credentials.
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={onNavigateToSignIn}
                rightIcon={<ArrowRight className="w-4 h-4 ml-1.5" />}
              >
                Proceed to Sign In
              </Button>
            </div>
          </div>
        )}

        {decisionState === 'cancelled' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Registration Cancelled</h2>
              <p className="text-sm text-slate-600">
                The pending account registration was discarded immediately. Campus administrators have been notified of this unauthorized attempt.
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={onNavigateToSignUp}
                leftIcon={<RotateCcw className="w-4 h-4 mr-1.5" />}
              >
                Register Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
