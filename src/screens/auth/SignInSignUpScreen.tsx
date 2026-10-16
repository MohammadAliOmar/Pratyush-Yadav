import React, { useState, useEffect } from 'react';
import { Button } from '../../components/common/Button';
import { authService, SignUpParams, getRoleForEmail } from '../../services/authService';
import { User } from '../../types';
import { isSharedMode } from '../../config/runtimeMode';
import {
  Compass,
  Lock,
  Mail,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';

interface SignInSignUpScreenProps {
  onSuccess: (user: User) => void;
  onOpenInbox: () => void;
  setCurrentUser?: (user: User | null) => void;
  accountDeleted?: boolean;
}

export const SignInSignUpScreen: React.FC<SignInSignUpScreenProps> = ({
  onSuccess,
  onOpenInbox,
  setCurrentUser,
  accountDeleted,
}) => {
  useEffect(() => {
    if (!authService.getCurrentUser() && setCurrentUser) {
      setCurrentUser(null);
    }
  }, [setCurrentUser]);

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'staff'>('student');

  // Password visibility & CapsLock state
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const resetPasswordVisibility = () => {
    setShowSignInPassword(false);
    setShowSignUpPassword(false);
    setShowConfirmPassword(false);
    setCapsLockOn(false);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSimulatedSuccess, setIsSimulatedSuccess] = useState(false);

  // Email verification resend state
  const [needsVerificationEmail, setNeedsVerificationEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Neutral ?emailConfirmed=1 banner
  const [emailConfirmedBanner, setEmailConfirmedBanner] = useState(false);
  // Account deleted banner
  const [accountDeletedBanner, setAccountDeletedBanner] = useState(false);

  // Recognized role from email domain
  const recognisedRole = getRoleForEmail(email);

  // Auto-select role based on email domain when recognized
  useEffect(() => {
    if (mode === 'signup' && recognisedRole) {
      setRole(recognisedRole);
    }
  }, [email, mode, recognisedRole]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem('campusfind_account_deleted') === '1') {
          setAccountDeletedBanner(true);
          sessionStorage.removeItem('campusfind_account_deleted');
        }
      } catch {}

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('emailConfirmed') === '1') {
        setEmailConfirmedBanner(true);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('emailConfirmed');
        const cleanPath =
          newUrl.pathname + (newUrl.searchParams.toString() ? '?' + newUrl.searchParams.toString() : '');
        window.history.replaceState({}, document.title, cleanPath);
      }
    }
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetPasswordVisibility();
    setError(null);
    setNeedsVerificationEmail(null);
    setResendNotice(null);
    setIsLoading(true);

    try {
      const result = await authService.signIn(email, password);
      if (result.success && result.data) {
        onSuccess(result.data);
      } else if (result.needsEmailVerification) {
        setNeedsVerificationEmail(result.email || email.trim().toLowerCase());
        setError(result.error || `Please confirm your email address first. We emailed a link to ${email}.`);
      } else {
        setError(result.error || 'Failed to sign in.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || !needsVerificationEmail) return;
    setIsResending(true);
    setResendNotice(null);
    try {
      const res = await authService.resendVerificationEmail(needsVerificationEmail, password);
      if (res.success) {
        setResendNotice(res.message);
        setResendCooldown(60);
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetPasswordVisibility();
    setError(null);
    setSuccessNotice(null);
    setIsSimulatedSuccess(false);
    setIsLoading(true);

    try {
      const params: SignUpParams = {
        name,
        email,
        password,
        confirmPassword,
        role,
      };

      const result = await authService.signUp(params);
      if (result.success) {
        if (result.isRealVerification) {
          setIsSimulatedSuccess(false);
          setSuccessNotice(
            result.message ||
              `We emailed a confirmation link to ${email.trim().toLowerCase()} (from noreply@campusfind-ba71c.firebaseapp.com). Open your university mailbox (check Junk), click the link, then come back and sign in.`
          );
        } else {
          setIsSimulatedSuccess(true);
          setSuccessNotice(
            result.message ||
              `Verification email sent to ${email.trim().toLowerCase()}. Open the Simulated Inbox to confirm your address.`
          );
        }
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Sign-up failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetPasswordVisibility();
    setError(null);
    setSuccessNotice(null);
    setIsLoading(true);

    try {
      const result = await authService.requestPasswordReset(email);
      if (result.success) {
        setSuccessNotice(
          result.message || 'If an account exists for that address, we emailed a reset link.'
        );
      } else {
        setError(result.error || 'Failed to request password reset.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50/50">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-700 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-700/20">
            <Compass className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            CampusFind
          </h1>
          <p className="text-xs text-slate-500">
            Victoria University Sydney • Secure Admin-Controlled Lost &amp; Found
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Tab switches */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                resetPasswordVisibility();
                setError(null);
                setSuccessNotice(null);
                setNeedsVerificationEmail(null);
                setResendNotice(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                resetPasswordVisibility();
                setError(null);
                setSuccessNotice(null);
                setNeedsVerificationEmail(null);
                setResendNotice(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register (Student / Staff)
            </button>
          </div>

          {/* Account deleted banner */}
          {(accountDeletedBanner || accountDeleted) && mode === 'signin' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="leading-relaxed font-medium">
                Your account has been deleted. You can register again with the same email address.
              </span>
            </div>
          )}

          {/* Neutral email confirmed banner */}
          {emailConfirmedBanner && mode === 'signin' && (
            <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl text-slate-800 text-xs flex items-center gap-2.5">
              <Info className="w-4 h-4 shrink-0 text-slate-600" />
              <span className="leading-relaxed font-medium">
                If you confirmed your email address, you can sign in below.
              </span>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="leading-relaxed">
                  {error.includes('Forgot password') ? (
                    <span>
                      An account for this address already exists.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signin');
                          resetPasswordVisibility();
                          setError(null);
                        }}
                        className="font-semibold underline hover:text-rose-950 cursor-pointer"
                      >
                        Sign in
                      </button>
                      , or use{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          resetPasswordVisibility();
                          setError(null);
                          setSuccessNotice(null);
                        }}
                        className="font-semibold underline hover:text-rose-950 cursor-pointer"
                      >
                        Forgot password
                      </button>
                      .
                    </span>
                  ) : (
                    error
                  )}
                </div>
              </div>
              {needsVerificationEmail && mode === 'signin' && (
                <div className="pt-1.5 border-t border-rose-200/60 flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={resendCooldown > 0 || isResending}
                    isLoading={isResending}
                    onClick={handleResendVerification}
                    className="w-full text-xs font-semibold py-1.5"
                  >
                    {resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : 'Resend confirmation email'}
                  </Button>
                  {resendNotice && (
                    <p className="text-[11px] text-emerald-700 font-medium text-center">
                      {resendNotice}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs space-y-2">
              {isSimulatedSuccess ? (
                <>
                  <h4 className="text-xs font-bold text-emerald-950">
                    Test address: no real email is sent
                  </h4>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                    <div className="leading-relaxed font-medium">{successNotice}</div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenInbox}
                    className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Open Simulated Inbox Now &rarr;
                  </button>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div className="leading-relaxed font-medium">{successNotice}</div>
                </div>
              )}
            </div>
          )}

          {/* Sign In Form */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  University Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="s8019455@student.vu.edu.au or @campusfind.test"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      resetPasswordVisibility();
                      setError(null);
                      setSuccessNotice(null);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showSignInPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLockOn(false)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword((v) => !v)}
                    aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showSignInPassword}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                  >
                    {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    Caps Lock is on
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full py-2.5 text-sm"
              >
                Sign In to CampusFind
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    resetPasswordVisibility();
                    setError(null);
                    setSuccessNotice(null);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 mb-1">
                  Forgot Password?
                </h2>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Enter your university email address. If an account exists, a password reset link will be sent to your mailbox.
                </p>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  University Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="studentID@student.vu.edu.au"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Accepted: @student.vu.edu.au, @live.vu.edu.au, @vu.edu.au
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full py-2.5 text-sm"
              >
                Send Reset Link
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    resetPasswordVisibility();
                    setError(null);
                    setSuccessNotice(null);
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 hover:underline font-semibold cursor-pointer"
                >
                  &larr; Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* Sign Up Form */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  University Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="s1234567@student.vu.edu.au"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Students: use your @student.vu.edu.au or @live.vu.edu.au address. Staff: use your @vu.edu.au address (for example e1234567@vu.edu.au or jane.smith@vu.edu.au).
                </p>
                {authService.isSimulatedEmail(email) ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isSharedMode()
                      ? 'Test address: no email is sent and no confirmation is needed. Your account is ready as soon as you register.'
                      : 'Test address: the confirmation appears in the Simulated Inbox, no real email is sent.'}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Real university addresses receive an email from Firebase (check your Junk folder if it does not appear in your inbox).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-semibold ${
                      recognisedRole !== null && recognisedRole !== 'student'
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                        : role === 'student'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 cursor-pointer'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="student"
                      checked={role === 'student'}
                      disabled={recognisedRole !== null && recognisedRole !== 'student'}
                      onChange={() => setRole('student')}
                      className="sr-only"
                    />
                    Student
                  </label>
                  <label
                    className={`flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-semibold ${
                      recognisedRole !== null && recognisedRole !== 'staff'
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                        : role === 'staff'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 cursor-pointer'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="staff"
                      checked={role === 'staff'}
                      disabled={recognisedRole !== null && recognisedRole !== 'staff'}
                      onChange={() => setRole('staff')}
                      className="sr-only"
                    />
                    Staff
                  </label>
                </div>
                {recognisedRole && (
                  <p className="text-[11px] text-blue-600 font-medium mt-1">
                    Role set from your email address.
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Note: Administrator accounts cannot be created via public sign-up.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showSignUpPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLockOn(false)}
                    placeholder="Min 8 chars, 1 letter & 1 number"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword((v) => !v)}
                    aria-label={showSignUpPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showSignUpPassword}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                  >
                    {showSignUpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    Caps Lock is on
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLockOn(false)}
                    placeholder="Confirm your password"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showConfirmPassword}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  password === confirmPassword ? (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">
                      Passwords match
                    </p>
                  ) : (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">
                      Passwords do not match
                    </p>
                  )
                )}
                {capsLockOn && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    Caps Lock is on
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                disabled={
                  isLoading ||
                  !authService.isValidPassword(password) ||
                  confirmPassword.length === 0 ||
                  password !== confirmPassword
                }
                className="w-full py-2.5 text-sm"
              >
                Send Verification Email
              </Button>
            </form>
          )}
        </div>

        {/* Footnote */}
        <p className="text-center text-xs text-slate-400">
          In compliance with the Australian Privacy Principles (OAIC).
        </p>
      </div>
    </div>
  );
};
