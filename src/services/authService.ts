/**
 * Authentication and Access Control Service (FR-01)
 *
 * Enforces:
 * - Domain validation (vu.edu.au, student.vu.edu.au, live.vu.edu.au, campusfind.test)
 * - Password complexity (>=8 chars, letter + number)
 * - 5 attempts rate limiting (24-hour lockout)
 * - Email verification flow ("Yes it's me" vs "No that's not me")
 * - Role-based permissions (Student, Staff, Admin)
 * - Suspended account blocking
 */

import { User, UserRole, SimulatedEmail } from '../types';
import { appStorage, hashPassword } from './storage';
import {
  ALLOWED_EMAIL_DOMAINS,
  SIMULATED_EMAIL_DOMAINS,
  STAFF_EMAIL_DOMAIN,
  STUDENT_EMAIL_DOMAINS,
  MAX_SIGNUP_ATTEMPTS,
  SIGNUP_LOCKOUT_HOURS,
  VERIFICATION_LINK_EXPIRY_HOURS,
} from '../config/matchingConfig';
import { notificationService } from './notificationService';
import { auditService } from './auditService';
import { reportService } from './reportService';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, waitForPendingWrites } from 'firebase/firestore';
import { auth, db } from './firebase';
import { SEEDED_USER_IDS } from './seedData';
import { isSharedMode, isAdminEmail } from '../config/runtimeMode';
import { firestoreSync } from './firestoreSync';
import { cloudSync } from './cloudSync';

export interface SignUpParams {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
  role: 'student' | 'staff'; // Admin accounts CANNOT be created through signup
}

export interface AuthResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  lockedUntil?: string;
  isRealVerification?: boolean;
  needsEmailVerification?: boolean;
  email?: string;
  message?: string;
}

function mapFirebaseAuthError(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many requests. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled. Please contact administrator.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase Authentication.';
    case 'auth/invalid-api-key':
      return 'Invalid Firebase API key. Please check your configuration.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters long and contain both letters and numbers.';
    case 'auth/invalid-email':
      return 'The email address is invalid.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact campus security or administration.';
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    default:
      return error?.message || 'Authentication error occurred.';
  }
}

async function sendFirebaseVerification(user: any): Promise<void> {
  const continueUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/?emailConfirmed=1`
      : undefined;

  if (continueUrl) {
    try {
      await sendEmailVerification(user, { url: continueUrl });
      return;
    } catch (urlErr: any) {
      if (
        urlErr?.code === 'auth/unauthorized-continue-uri' ||
        urlErr?.code === 'auth/invalid-continue-uri'
      ) {
        await sendEmailVerification(user);
        return;
      }
      throw urlErr;
    }
  } else {
    await sendEmailVerification(user);
  }
}

/**
 * Pure function: derives user role ('staff' | 'student') from university email address.
 * Staff uses the EXACT domain vu.edu.au (never endsWith or includes).
 * Student uses STUDENT_EMAIL_DOMAINS (student.vu.edu.au, live.vu.edu.au).
 * Returns null if not recognised or invalid format.
 */
export function getRoleForEmail(email: string): 'staff' | 'student' | null {
  if (typeof email !== 'string') return null;
  const cleanEmail = email.trim().toLowerCase();
  const atIndex = cleanEmail.indexOf('@');
  if (atIndex === -1 || atIndex !== cleanEmail.lastIndexOf('@')) {
    return null;
  }
  const localPart = cleanEmail.substring(0, atIndex);
  const domain = cleanEmail.substring(atIndex + 1);

  if (!localPart || localPart.includes(' ')) {
    return null;
  }

  if (domain === STAFF_EMAIL_DOMAIN) {
    return 'staff';
  }

  if (STUDENT_EMAIL_DOMAINS.includes(domain)) {
    return 'student';
  }

  return null;
}

export const authService = {
  /**
   * Check if email has a valid university domain
   */
  isValidUniversityEmail(email: string): boolean {
    const cleanEmail = email.trim().toLowerCase();
    const parts = cleanEmail.split('@');
    if (parts.length !== 2) return false;
    const domain = parts[1];

    return ALLOWED_EMAIL_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith('.' + allowed)
    );
  },

  /**
   * Validate role for email address (guard against registration mistakes)
   */
  validateRoleForEmail(email: string, role: string): void {
    const cleanEmail = email.trim().toLowerCase();
    const atIndex = cleanEmail.indexOf('@');
    const domain = atIndex !== -1 ? cleanEmail.substring(atIndex + 1) : '';

    if (SIMULATED_EMAIL_DOMAINS.includes(domain)) {
      return;
    }

    const expected = getRoleForEmail(cleanEmail);
    if (expected === null) {
      throw new Error(
        'This email address is not a recognised VU staff or student address. Use your @vu.edu.au (staff) or @student.vu.edu.au / @live.vu.edu.au (student) address.'
      );
    }

    if (role === 'staff' && expected === 'student') {
      throw new Error(
        'Staff accounts need your staff email address ending in @vu.edu.au, for example e1234567@vu.edu.au or jane.smith@vu.edu.au. Student email addresses can only register as Student.'
      );
    }

    if (role === 'student' && expected === 'staff') {
      throw new Error(
        'Student accounts need your student email address ending in @student.vu.edu.au or @live.vu.edu.au. Email addresses ending in @vu.edu.au can only register as Staff.'
      );
    }
  },

  /**
   * Check if email belongs to the simulated domain (@campusfind.test)
   */
  isSimulatedEmail(email: string): boolean {
    const cleanEmail = email.trim().toLowerCase();
    const parts = cleanEmail.split('@');
    if (parts.length !== 2) return false;
    const domain = parts[1];
    return SIMULATED_EMAIL_DOMAINS.some(
      (simDomain) => domain === simDomain || domain.endsWith('.' + simDomain)
    );
  },

  /**
   * Password requirement: at least 8 chars, 1 letter, 1 number
   */
  isValidPassword(password: string): boolean {
    if (password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
  },

  /**
   * Rate limiting check for signup attempts
   */
  checkRateLimit(email: string): { locked: boolean; message?: string; lockedUntil?: string } {
    const attempts = appStorage.getSignupAttempts();
    const cleanEmail = email.trim().toLowerCase();
    const record = attempts[cleanEmail];

    if (!record) return { locked: false };

    if (record.lockedUntil) {
      const lockDate = new Date(record.lockedUntil);
      if (new Date() < lockDate) {
        return {
          locked: true,
          message: `Too many sign-up attempts for this email. Try again after ${lockDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          lockedUntil: record.lockedUntil,
        };
      }
    }

    if (record.count >= MAX_SIGNUP_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + SIGNUP_LOCKOUT_HOURS * 60 * 60 * 1000).toISOString();
      record.lockedUntil = lockUntil;
      attempts[cleanEmail] = record;
      appStorage.saveSignupAttempts(attempts);
      return {
        locked: true,
        message: `Too many sign-up attempts for this email. Try again after ${new Date(lockUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        lockedUntil: lockUntil,
      };
    }

    return { locked: false };
  },

  recordAttempt(email: string) {
    const attempts = appStorage.getSignupAttempts();
    const cleanEmail = email.trim().toLowerCase();
    const record = attempts[cleanEmail] || { email: cleanEmail, count: 0 };
    record.count += 1;
    attempts[cleanEmail] = record;
    appStorage.saveSignupAttempts(attempts);
  },

  clearAttempts(email: string) {
    const attempts = appStorage.getSignupAttempts();
    const cleanEmail = email.trim().toLowerCase();
    delete attempts[cleanEmail];
    appStorage.saveSignupAttempts(attempts);
  },

  /**
   * Submit Sign-Up Form (FR-01, Section 8)
   */
  async signUp(params: SignUpParams): Promise<AuthResult<SimulatedEmail>> {
    if (params.confirmPassword !== undefined && params.password !== params.confirmPassword) {
      throw new Error('The two passwords do not match.');
    }

    const cleanEmail = params.email.trim().toLowerCase();

    // 1. Domain Check
    if (!this.isValidUniversityEmail(cleanEmail)) {
      return {
        success: false,
        error: 'Please use your university student or staff email address (e.g. @student.vu.edu.au, @vu.edu.au, or @campusfind.test).',
      };
    }

    // Role & Domain Rule (mistake-guard check BEFORE recordAttempt, rate limiting, Firebase calls, and local storage writes)
    try {
      this.validateRoleForEmail(cleanEmail, params.role);
    } catch (roleErr: any) {
      return {
        success: false,
        error: roleErr.message,
      };
    }

    // 2. Rate Limit Check
    const rateCheck = this.checkRateLimit(cleanEmail);
    if (rateCheck.locked) {
      return {
        success: false,
        error: rateCheck.message,
        lockedUntil: rateCheck.lockedUntil,
      };
    }

    // Record this attempt
    this.recordAttempt(cleanEmail);

    // 3. Password Complexity Check
    if (!this.isValidPassword(params.password)) {
      return {
        success: false,
        error: 'Password must be at least 8 characters long and contain both letters and numbers.',
      };
    }

    // Shared mode: every account is a Firebase account (see signUpShared)
    if (isSharedMode()) {
      return this.signUpShared(cleanEmail, params);
    }

    // 4. Check if ACTIVE user already exists locally
    const existing = appStorage.getUserByEmail(cleanEmail);
    if (existing && existing.status === 'active') {
      return {
        success: false,
        error: 'An active account with this email address already exists. Please sign in.',
      };
    }

    // 5. Flow branch: Simulated (@campusfind.test) vs Real University Address
    const isSimulated = this.isSimulatedEmail(cleanEmail);

    if (isSimulated) {
      // If an unconfirmed sign-up already exists for that email, replace it
      if (existing && existing.status === 'pending') {
        appStorage.deleteUser(existing.id);
      }

      // Create PENDING user
      const newUser: User = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: params.name.trim(),
        email: cleanEmail,
        role: params.role,
        status: 'pending',
        accountStatus: 'active',
        rejectedClaimCount: 0,
        flagged: false,
        createdAt: new Date().toISOString(),
      };

      appStorage.saveUser(newUser);
      appStorage.setPasswordHash(cleanEmail, hashPassword(params.password));

      // Generate single-use verification token (expires in 24 hours for simulated emails)
      // Note: VERIFICATION_LINK_EXPIRY_HOURS applies to these test emails only; Firebase controls expiry for real emails.
      const token = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const simulatedEmail: SimulatedEmail = {
        id: `mail_${Date.now()}`,
        recipientEmail: cleanEmail,
        subject: 'Verify your CampusFind Victoria University account',
        token,
        verifyUrl: `/?action=verify&token=${token}&email=${encodeURIComponent(cleanEmail)}`,
        createdAt: new Date().toISOString(),
        used: false,
      };

      appStorage.addSimulatedEmail(simulatedEmail);

      return {
        success: true,
        data: simulatedEmail,
        isRealVerification: false,
        email: cleanEmail,
        message: `Verification email sent to ${cleanEmail}. Open the Simulated Inbox to confirm your address.`,
      };
    }

    // Real university address (vu.edu.au, student.vu.edu.au, live.vu.edu.au)
    // Uses Firebase Authentication directly. Link is sent to the student's mailbox only.
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
      const user = userCredential.user;

      if (params.name.trim()) {
        await updateProfile(user, { displayName: params.name.trim() });
      }

      await sendFirebaseVerification(user);
      await firebaseSignOut(auth);

      // Save a local pending User record (same fields as today, status 'pending') so the chosen role is remembered.
      // Never store a password or a password hash locally for these accounts.
      // Do not create a SimulatedEmail and do not return a token or link.
      if (existing && existing.status === 'pending') {
        appStorage.deleteUser(existing.id);
      }

      const pendingUser: User = {
        id: user.uid,
        name: params.name.trim(),
        email: cleanEmail,
        role: params.role,
        status: 'pending',
        accountStatus: 'active',
        rejectedClaimCount: 0,
        flagged: false,
        createdAt: new Date().toISOString(),
      };
      appStorage.saveUser(pendingUser);

      return {
        success: true,
        isRealVerification: true,
        email: cleanEmail,
        message: `We emailed a confirmation link to ${cleanEmail} (from noreply@campusfind-ba71c.firebaseapp.com). Open your university mailbox (check Junk), click the link, then come back and sign in.`,
      };
    } catch (fbError: any) {
      if (fbError?.code === 'auth/email-already-in-use') {
        // Try signInWithEmailAndPassword with the typed password
        try {
          const cred = await signInWithEmailAndPassword(auth, cleanEmail, params.password);
          const existingFbUser = cred.user;
          if (!existingFbUser.emailVerified) {
            // Unverified: resend email, show same success message, then sign out
            await sendFirebaseVerification(existingFbUser);
            await firebaseSignOut(auth);

            // Ensure local pending user record exists
            const existingLocal = appStorage.getUserByEmail(cleanEmail);
            if (!existingLocal || existingLocal.status === 'pending') {
              if (existingLocal) appStorage.deleteUser(existingLocal.id);
              appStorage.saveUser({
                id: existingFbUser.uid,
                name: params.name.trim() || existingFbUser.displayName || 'Student',
                email: cleanEmail,
                role: params.role,
                status: 'pending',
                accountStatus: 'active',
                rejectedClaimCount: 0,
                flagged: false,
                createdAt: new Date().toISOString(),
              });
            }

            return {
              success: true,
              isRealVerification: true,
              email: cleanEmail,
              message: `We emailed a confirmation link to ${cleanEmail} (from noreply@campusfind-ba71c.firebaseapp.com). Open your university mailbox (check Junk), click the link, then come back and sign in.`,
            };
          } else {
            // Verified: active account exists, please sign in
            await firebaseSignOut(auth);
            return {
              success: false,
              error: 'An active account with this email address already exists. Please sign in.',
            };
          }
        } catch {
          return {
            success: false,
            error: 'An account for this address already exists. Sign in, or use Forgot password.',
          };
        }
      }

      return {
        success: false,
        error: mapFirebaseAuthError(fbError),
      };
    }
  },

  /**
   * Shared mode sign-up. Every address is a real Firebase account:
   *  - @campusfind.test test addresses are active immediately (no email is sent), so anyone can
   *    register on any computer for the live test.
   *  - Real university addresses must confirm the email Firebase sends.
   * Administrator addresses cannot be registered here.
   */
  async signUpShared(cleanEmail: string, params: SignUpParams): Promise<AuthResult<SimulatedEmail>> {
    const isTest = this.isSimulatedEmail(cleanEmail);

    if (isAdminEmail(cleanEmail)) {
      return {
        success: false,
        error: 'An account for this address already exists. Please sign in.',
      };
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
      const fbUser = userCredential.user;

      if (params.name.trim()) {
        await updateProfile(fbUser, { displayName: params.name.trim() });
      }

      if (isTest) {
        // Test address: create the profile now, active straight away
        const newUser: User = {
          id: fbUser.uid,
          name: params.name.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          role: params.role,
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        try {
          await firestoreSync.writeUser(newUser);
        } catch (profileErr) {
          console.warn('Shared sign-up (profile):', profileErr);
        }
        await firebaseSignOut(auth);
        this.clearAttempts(cleanEmail);
        return {
          success: true,
          isRealVerification: true,
          email: cleanEmail,
          message: `Your test account for ${cleanEmail} is ready. No email confirmation is needed for test addresses: sign in now.`,
        };
      }

      // Real university address: Firebase emails a confirmation link, the profile is created at first sign-in
      await sendFirebaseVerification(fbUser);
      await firebaseSignOut(auth);
      return {
        success: true,
        isRealVerification: true,
        email: cleanEmail,
        message: `We emailed a confirmation link to ${cleanEmail} (from noreply@campusfind-ba71c.firebaseapp.com). Open your university mailbox (check Junk), click the link, then come back and sign in.`,
      };
    } catch (fbError: any) {
      if (fbError?.code === 'auth/email-already-in-use') {
        if (isTest) {
          return {
            success: false,
            error: 'An active account with this email address already exists. Please sign in.',
          };
        }
        try {
          const cred = await signInWithEmailAndPassword(auth, cleanEmail, params.password);
          if (!cred.user.emailVerified) {
            await sendFirebaseVerification(cred.user);
            await firebaseSignOut(auth);
            return {
              success: true,
              isRealVerification: true,
              email: cleanEmail,
              message: `We emailed a confirmation link to ${cleanEmail} (from noreply@campusfind-ba71c.firebaseapp.com). Open your university mailbox (check Junk), click the link, then come back and sign in.`,
            };
          }
          await firebaseSignOut(auth);
          return {
            success: false,
            error: 'An active account with this email address already exists. Please sign in.',
          };
        } catch {
          return {
            success: false,
            error: 'An account for this address already exists. Sign in, or use Forgot password.',
          };
        }
      }
      return { success: false, error: mapFirebaseAuthError(fbError) };
    }
  },

  /**
   * Shared mode sign-in: Firebase Authentication for every address, then the profile in
   * Cloud Firestore decides role and suspension. Data listeners start before this returns.
   */
  async signInShared(cleanEmail: string, password: string): Promise<AuthResult<User>> {
    const isTest = this.isSimulatedEmail(cleanEmail);
    const isAdmin = isAdminEmail(cleanEmail);

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = cred.user;

      // Real university addresses must have confirmed their email. Test addresses and the
      // administrator account have no mailbox, so they are not asked to.
      if (!isTest && !isAdmin && !fbUser.emailVerified) {
        await firebaseSignOut(auth);
        return {
          success: false,
          needsEmailVerification: true,
          email: cleanEmail,
          error: `Please confirm your email address first. We emailed a link to ${cleanEmail}.`,
        };
      }

      let existing: User | null = null;
      try {
        const snap = await getDoc(doc(db, 'users', fbUser.uid));
        existing = snap.exists() ? (snap.data() as User) : null;
      } catch (readErr) {
        console.warn('Shared sign-in (profile read):', readErr);
      }

      if (existing && existing.accountStatus === 'suspended') {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: 'This account has been suspended. Please contact campus security or administration.',
        };
      }

      let role: UserRole;
      if (isAdmin) {
        role = 'admin';
      } else if (isTest) {
        // Test addresses keep the role they registered with; they can never become admin
        role = existing?.role === 'staff' ? 'staff' : 'student';
      } else {
        const derived = getRoleForEmail(cleanEmail);
        if (!derived) {
          await firebaseSignOut(auth);
          return {
            success: false,
            error: 'This email address is not a recognised VU staff or student address.',
          };
        }
        role = derived;
      }

      const activeUser: User = {
        id: fbUser.uid,
        name: isAdmin
          ? 'Admin'
          : existing?.name || fbUser.displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role,
        status: 'active',
        accountStatus: 'active',
        rejectedClaimCount: existing?.rejectedClaimCount || 0,
        flagged: existing?.flagged || false,
        flagReason: existing?.flagReason,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      if (!existing) {
        try {
          await firestoreSync.writeUser(activeUser);
        } catch (createErr) {
          console.warn('Shared sign-in (profile create):', createErr);
          await firebaseSignOut(auth);
          return {
            success: false,
            error: 'We could not create your CampusFind profile. Please try again.',
          };
        }
      }

      this.clearAttempts(cleanEmail);
      appStorage.setCurrentUser(activeUser);
      await cloudSync.start(activeUser);
      return { success: true, data: activeUser };
    } catch (fbError: any) {
      const code = fbError?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-email'
      ) {
        return { success: false, error: 'Incorrect email or password.' };
      }
      return { success: false, error: mapFirebaseAuthError(fbError) };
    }
  },

  /**
   * Process Email Verification Link Decision (Section 8)
   * User clicks "Yes, it's me" OR "No, that's not me" (Applies to simulated test emails only)
   */
  async handleVerificationDecision(
    token: string,
    email: string,
    confirmed: boolean
  ): Promise<{ success: boolean; message: string; cancelled?: boolean }> {
    const emails = appStorage.getSimulatedEmails();
    const mail = emails.find(
      (m) => m.token === token && m.recipientEmail.toLowerCase() === email.toLowerCase()
    );

    if (!mail) {
      return { success: false, message: 'Invalid or expired confirmation link.' };
    }

    if (mail.used) {
      return { success: false, message: 'This confirmation link has already been used.' };
    }

    // Verification links expire after 24 hours (Applies to test emails only; Firebase controls expiry for real emails)
    const mailCreatedAt = new Date(mail.createdAt).getTime();
    const hoursElapsed = (Date.now() - mailCreatedAt) / (1000 * 60 * 60);
    if (hoursElapsed > VERIFICATION_LINK_EXPIRY_HOURS) {
      mail.used = true;
      appStorage.saveSimulatedEmails(emails);
      return {
        success: false,
        message: 'This confirmation link has expired. Please register again.',
      };
    }

    const user = appStorage.getUserByEmail(email);

    if (confirmed) {
      // Step 4: "Yes, it's me" -> Account becomes active, sign-up counter cleared
      if (user) {
        user.status = 'active';
        appStorage.saveUser(user);
      }
      mail.used = true;
      appStorage.saveSimulatedEmails(emails);
      this.clearAttempts(email);

      return {
        success: true,
        message: 'Account confirmed successfully! You can now sign in.',
      };
    } else {
      // Step 5: "No, that's not me" -> Pending account deleted, counter reset, notify admin & audit
      if (user && user.status === 'pending') {
        appStorage.deleteUser(user.id);
      }
      mail.used = true;
      appStorage.saveSimulatedEmails(emails);
      this.clearAttempts(email);

      // Admin notification & audit log (Section 8.5)
      await notificationService.createNotification({
        audience: 'admin',
        type: 'abuse_alert',
        message: `Someone tried to register ${email}; the owner said it was not them.`,
      });

      await auditService.logAction({
        adminId: 'system',
        adminName: 'Security System',
        action: 'Account Flagged',
        details: `Abuse prevention: Owner rejected registration attempt for ${email}. Pending signup deleted.`,
        outcome: 'Registration cancelled by email owner',
      });

      return {
        success: true,
        message: 'Sign-up has been cancelled. No account was created.',
        cancelled: true,
      };
    }
  },

  /**
   * Sign In (FR-01)
   * The seven seeded demo accounts keep the existing local sign-in unchanged.
   * Every other address uses signInWithEmailAndPassword.
   */
  async signIn(email: string, password: string): Promise<AuthResult<User>> {
    const cleanEmail = email.trim().toLowerCase();

    // Shared mode: Firebase Authentication for every address
    if (isSharedMode()) {
      return this.signInShared(cleanEmail, password);
    }

    // Check if this is a simulated demo/test account
    const isSimulated = this.isSimulatedEmail(cleanEmail);

    if (isSimulated) {
      const user = appStorage.getUserByEmail(cleanEmail);

      if (!user) {
        return { success: false, error: 'Incorrect email or password.' };
      }

      // Verify Password
      const storedHash = appStorage.getPasswordHash(cleanEmail);
      const inputHash = hashPassword(password);

      if (storedHash !== inputHash) {
        return { success: false, error: 'Incorrect email or password.' };
      }

      // Step 4 constraint: Sign-in is blocked until confirmed
      if (user.status !== 'active') {
        return {
          success: false,
          error: 'Please confirm your email address before signing in. Check the Simulated Inbox.',
        };
      }

      // Account-level restriction: Suspended accounts cannot sign in
      if (user.accountStatus === 'suspended') {
        return {
          success: false,
          error: 'This account has been suspended. Please contact campus security or administration.',
        };
      }

      // Set active session
      appStorage.setCurrentUser(user);
      return { success: true, data: user };
    }

    // Every other address uses signInWithEmailAndPassword (Firebase Authentication)
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = cred.user;

      if (!fbUser.emailVerified) {
        await firebaseSignOut(auth);
        return {
          success: false,
          needsEmailVerification: true,
          email: cleanEmail,
          error: `Please confirm your email address first. We emailed a link to ${cleanEmail}.`,
        };
      }

      // Account-level restriction: Suspended accounts cannot sign in
      const existingUser = appStorage.getUserByEmail(cleanEmail);
      if (existingUser && existingUser.accountStatus === 'suspended') {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: 'This account has been suspended. Please contact campus security or administration.',
        };
      }

      // Role determination for real addresses: derive role from verified email address with getRoleForEmail
      const derivedRole = getRoleForEmail(cleanEmail);
      if (!derivedRole) {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: 'This email address is not a recognised VU staff or student address.',
        };
      }

      let role: 'student' | 'staff' = derivedRole;
      // CRITICAL: A real address must never become 'admin'
      if ((role as string) === 'admin') {
        role = 'student';
      }

      // If the stored local user's role differs, update the stored role to match
      if (existingUser && existingUser.role !== role) {
        existingUser.role = role;
        appStorage.saveUser(existingUser);
      }

      const activeUser: User = {
        id: fbUser.uid,
        name: fbUser.displayName || existingUser?.name || cleanEmail.split('@')[0],
        email: cleanEmail,
        role,
        status: 'active',
        accountStatus: 'active',
        rejectedClaimCount: existingUser?.rejectedClaimCount || 0,
        flagged: existingUser?.flagged || false,
        createdAt: existingUser?.createdAt || new Date().toISOString(),
      };

      // Create or update local User
      appStorage.saveUser(activeUser);
      // Never store a local password hash for these accounts

      // Clear signup/signin attempts on successful real login
      this.clearAttempts(cleanEmail);

      // Set active session
      appStorage.setCurrentUser(activeUser);
      return { success: true, data: activeUser };
    } catch (fbError: any) {
      const code = fbError?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-email'
      ) {
        return { success: false, error: 'Incorrect email or password.' };
      }
      return { success: false, error: mapFirebaseAuthError(fbError) };
    }
  },

  /**
   * Resend confirmation email for unverified Firebase accounts
   */
  async resendVerificationEmail(
    email: string,
    password?: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!password) {
      return {
        success: false,
        message: 'Password is required to resend confirmation link.',
      };
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = cred.user;
      await sendFirebaseVerification(user);
      await firebaseSignOut(auth);
      return {
        success: true,
        message: `A new confirmation link was sent to ${cleanEmail}. Check your university mailbox (and Junk).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: mapFirebaseAuthError(err),
      };
    }
  },

  /**
   * Request Password Reset (Firebase Authentication)
   * Real university addresses receive a reset email via Firebase.
   * Demo accounts and @campusfind.test addresses are never sent real emails.
   */
  async requestPasswordReset(
    email: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    // Domain validation
    if (!this.isValidUniversityEmail(cleanEmail)) {
      return {
        success: false,
        error:
          'Please enter a valid Victoria University email address (vu.edu.au, student.vu.edu.au, live.vu.edu.au, campusfind.test).',
      };
    }

    // Never call for seeded demo accounts or @campusfind.test addresses
    if (this.isSimulatedEmail(cleanEmail) || cleanEmail.endsWith('@campusfind.test')) {
      return {
        success: true,
        message: 'If an account exists for that address, we emailed a reset link.',
      };
    }

    try {
      const continueUrl =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : undefined;

      if (continueUrl) {
        try {
          await sendPasswordResetEmail(auth, cleanEmail, { url: continueUrl });
        } catch (urlErr: any) {
          if (
            urlErr?.code === 'auth/unauthorized-continue-uri' ||
            urlErr?.code === 'auth/invalid-continue-uri'
          ) {
            await sendPasswordResetEmail(auth, cleanEmail);
          } else {
            // Suppress non-continue-uri errors to avoid user enumeration
          }
        }
      } else {
        await sendPasswordResetEmail(auth, cleanEmail);
      }
    } catch {
      // Regardless of user existence, return neutral message
    }

    return {
      success: true,
      message: 'If an account exists for that address, we emailed a reset link.',
    };
  },

  /**
   * Get Current Session
   */
  getCurrentUser(): User | null {
    return appStorage.getCurrentUser();
  },

  /**
   * Sign Out
   */
  signOut() {
    cloudSync.stop();
    appStorage.setCurrentUser(null);
    firebaseSignOut(auth).catch(() => {});
  },

  /**
   * Delete User Account
   * Refuses admin accounts, seeded demo accounts, and accounts with pending verification reports.
   * Real accounts re-authenticate with Firebase, call deleteUser, and sign out.
   * Simulated @campusfind.test accounts verify against stored password hash.
   * Cleans up local user, password hash, simulated emails, login attempts, and notifications.
   */
  async deleteAccount(
    currentUser: User,
    password: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!currentUser) {
      return { success: false, error: 'User is not signed in.' };
    }

    // 1. Refuse admin accounts
    if (currentUser.role === 'admin') {
      return { success: false, error: 'Administrator accounts cannot be deleted.' };
    }

    // 2. Refuse seeded demo accounts
    if (SEEDED_USER_IDS.includes(currentUser.id)) {
      return { success: false, error: 'Seeded demo accounts cannot be deleted.' };
    }

    // 3. Refuse accounts that have any report with status Pending Verification
    const userReports = appStorage.getReports().filter(
      (r) =>
        r.userId === currentUser.id ||
        (r.userEmail && r.userEmail.toLowerCase() === currentUser.email.toLowerCase())
    );
    const hasPendingVerification = userReports.some(
      (r) => r.status === 'Pending Verification'
    );
    if (hasPendingVerification) {
      return { success: false, error: 'Finish or withdraw your pending reports first.' };
    }

    const cleanEmail = currentUser.email.trim().toLowerCase();

    if (isSharedMode()) {
      return this.deleteAccountShared(currentUser, cleanEmail, password);
    }

    const isSimulated = this.isSimulatedEmail(cleanEmail);

    if (isSimulated) {
      // 4. Simulated @campusfind.test account: check password against local stored hash
      const storedHash = appStorage.getPasswordHash(cleanEmail);
      const inputHash = hashPassword(password);
      if (!storedHash || storedHash !== inputHash) {
        return { success: false, error: 'Incorrect password.' };
      }
    } else {
      // 5. Real account: re-authenticate with Firebase, deleteUser(auth.currentUser), then signOut
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const fbUser = cred.user || auth.currentUser;
        if (fbUser) {
          await deleteUser(fbUser);
        }
        await firebaseSignOut(auth).catch(() => {});
      } catch (fbErr: any) {
        const code = fbErr?.code;
        if (
          code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found'
        ) {
          return { success: false, error: 'Incorrect password.' };
        }
        return { success: false, error: 'Incorrect password.' };
      }
    }

    // 6. Local clean-up
    appStorage.deleteUser(currentUser.id);
    const userByEmail = appStorage.getUserByEmail(cleanEmail);
    if (userByEmail) {
      appStorage.deleteUser(userByEmail.id);
    }

    appStorage.deletePasswordHash(cleanEmail);

    const remainingEmails = appStorage
      .getSimulatedEmails()
      .filter((m) => m.recipientEmail.toLowerCase() !== cleanEmail);
    appStorage.saveSimulatedEmails(remainingEmails);

    this.clearAttempts(cleanEmail);

    const remainingNotifs = appStorage
      .getNotifications()
      .filter(
        (n) =>
          n.relatedId !== currentUser.id &&
          !n.message.toLowerCase().includes(cleanEmail)
      );
    appStorage.saveNotifications(remainingNotifs);

    // Anonymise user reports (Business Rule 4):
    reportService.anonymiseReportsForDeletedUser(currentUser.id);

    // Exactly ONE System audit-log entry "Account Deleted" containing only the user id (no name, no email)
    await auditService.logAction({
      adminId: 'system',
      adminName: 'System',
      action: 'Account Deleted',
      targetUserId: currentUser.id,
      details: `Account ${currentUser.id} deleted.`,
      outcome: 'Account Deleted',
    });

    // Sign out session
    this.signOut();

    return {
      success: true,
      message: 'Account deleted successfully.',
    };
  },

  /**
   * Shared mode account deletion: re-authenticate, clean up Cloud Firestore while still
   * signed in (anonymise reports, remove the profile, one audit entry), then delete the
   * Firebase account and sign out.
   */
  async deleteAccountShared(
    currentUser: User,
    cleanEmail: string,
    password: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    let fbUser: any;
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      fbUser = cred.user;
    } catch {
      return { success: false, error: 'Incorrect password.' };
    }

    try {
      // Business Rule 4: anonymise the reports, keep closed reports read-only
      reportService.anonymiseReportsForDeletedUser(currentUser.id);

      // Exactly ONE system audit entry containing only the user id
      await auditService.logAction({
        adminId: 'system',
        adminName: 'System',
        action: 'Account Deleted',
        targetUserId: currentUser.id,
        details: `Account ${currentUser.id} deleted.`,
        outcome: 'Account Deleted',
      });

      await firestoreSync.deleteUserDoc(currentUser.id).catch((err) => {
        console.warn('Shared delete (profile):', err);
      });

      // Make sure every queued write reached the server before the account disappears
      await waitForPendingWrites(db).catch(() => {});

      await deleteUser(fbUser);
    } catch (err) {
      console.warn('Shared delete account:', err);
      return {
        success: false,
        error: 'We could not delete the account. Please sign out, sign in again and retry.',
      };
    }

    this.clearAttempts(cleanEmail);
    this.signOut();
    return { success: true, message: 'Account deleted successfully.' };
  },

  /**
   * Role Guard: throws or returns false if caller lacks required role
   */
  requireRole(requiredRole: UserRole): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;
    if (currentUser.accountStatus === 'suspended') return false;
    return currentUser.role === requiredRole;
  },

  /**
   * Admin Role Guard
   */
  requireAdmin(): boolean {
    return this.requireRole('admin');
  },
};
