import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as firebaseAuth from 'firebase/auth';
import { authService, getRoleForEmail } from '../services/authService';
import { appStorage, hashPassword } from '../services/storage';
import { reportService } from '../services/reportService';
import { auditService } from '../services/auditService';
import { firestoreSync } from '../services/firestoreSync';
import { User, ItemReport } from '../types';

vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual<any>('firebase/auth');
  return {
    ...actual,
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    sendEmailVerification: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    deleteUser: vi.fn(),
  };
});

describe('Firebase Authentication Integration (Mocked Unit Tests)', () => {
  beforeEach(() => {
    firestoreSync.setSyncPaused(true);
    appStorage.resetToTestFixtures();
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(firebaseAuth.signOut).mockResolvedValue(undefined as any);
    vi.mocked(firebaseAuth.updateProfile).mockResolvedValue(undefined as any);
    vi.mocked(firebaseAuth.sendEmailVerification).mockResolvedValue(undefined as any);
    vi.mocked(firebaseAuth.sendPasswordResetEmail).mockResolvedValue(undefined as any);
    vi.mocked(firebaseAuth.deleteUser).mockResolvedValue(undefined as any);
  });

  describe('Real-domain Sign-Up Flow', () => {
    it('calls createUserWithEmailAndPassword, updateProfile, sendEmailVerification, and signOut; writes no simulated email and returns no token', async () => {
      const mockFbUser = {
        uid: 'fb_uid_test_student',
        email: 's1234567@student.vu.edu.au',
        displayName: 'Test Student',
        emailVerified: false,
      };

      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
        user: mockFbUser,
      } as any);

      const initialEmailsCount = appStorage.getSimulatedEmails().length;

      const res = await authService.signUp({
        name: 'Test Student',
        email: 's1234567@student.vu.edu.au',
        password: 'Password123!',
        role: 'student',
      });

      expect(res.success).toBe(true);
      expect(res.isRealVerification).toBe(true);
      // Returns no token
      expect(res.data?.token).toBeUndefined();

      // Firebase auth calls
      expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        's1234567@student.vu.edu.au',
        'Password123!'
      );
      expect(firebaseAuth.updateProfile).toHaveBeenCalledWith(mockFbUser, {
        displayName: 'Test Student',
      });
      expect(firebaseAuth.sendEmailVerification).toHaveBeenCalledWith(
        mockFbUser,
        expect.objectContaining({ url: expect.stringContaining('emailConfirmed=1') })
      );
      expect(firebaseAuth.signOut).toHaveBeenCalled();

      // Writes no simulated email
      const finalEmails = appStorage.getSimulatedEmails();
      expect(finalEmails.length).toBe(initialEmailsCount);
      expect(finalEmails.find((m) => m.recipientEmail === 's1234567@student.vu.edu.au')).toBeUndefined();

      // Local pending record is stored with role
      const localUser = appStorage.getUserByEmail('s1234567@student.vu.edu.au');
      expect(localUser).toBeDefined();
      expect(localUser?.status).toBe('pending');
      expect(localUser?.role).toBe('student');

      // Never stores password hash for real university accounts
      expect(appStorage.getPasswordHash('s1234567@student.vu.edu.au')).toBeFalsy();
    });

    it('falls back to sendEmailVerification without continue URL when unauthorized-continue-uri error occurs', async () => {
      const mockFbUser = {
        uid: 'fb_uid_staff_fallback',
        email: 'staff.member@vu.edu.au',
        displayName: 'Staff Member',
        emailVerified: false,
      };

      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
        user: mockFbUser,
      } as any);

      // First call with URL fails with auth/unauthorized-continue-uri, second call succeeds
      vi.mocked(firebaseAuth.sendEmailVerification)
        .mockRejectedValueOnce({ code: 'auth/unauthorized-continue-uri', message: 'Unauthorized URI' })
        .mockResolvedValueOnce(undefined as any);

      const res = await authService.signUp({
        name: 'Staff Member',
        email: 'staff.member@vu.edu.au',
        password: 'Password123!',
        role: 'staff',
      });

      expect(res.success).toBe(true);
      expect(firebaseAuth.sendEmailVerification).toHaveBeenCalledTimes(2);
      expect(firebaseAuth.sendEmailVerification).toHaveBeenNthCalledWith(
        1,
        mockFbUser,
        expect.objectContaining({ url: expect.any(String) })
      );
      expect(firebaseAuth.sendEmailVerification).toHaveBeenNthCalledWith(2, mockFbUser);
    });

    it('still creates a simulated email and returns token for @campusfind.test addresses without calling Firebase', async () => {
      const res = await authService.signUp({
        name: 'Simulated User',
        email: 'mock_user@campusfind.test',
        password: 'Password123!',
        role: 'student',
      });

      expect(res.success).toBe(true);
      expect(res.isRealVerification).toBe(false);
      expect(res.data?.token).toBeDefined();

      // Firebase createUserWithEmailAndPassword was NOT called
      expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();

      // Simulated email was saved
      const simulated = appStorage.getSimulatedEmails().find((e) => e.recipientEmail === 'mock_user@campusfind.test');
      expect(simulated).toBeDefined();
      expect(simulated?.token).toBe(res.data?.token);
    });

    it('enforces the university domain rule on signup', async () => {
      const res = await authService.signUp({
        name: 'Outsider',
        email: 'outsider@gmail.com',
        password: 'Password123!',
        role: 'student',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('university student or staff email address');
      expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });
  });

  describe('Real-domain Sign-In Flow', () => {
    it('blocks sign-in and calls signOut when Firebase email is not verified', async () => {
      const unverifiedUser = {
        uid: 'fb_unverified',
        email: 'unverified@student.vu.edu.au',
        emailVerified: false,
      };

      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
        user: unverifiedUser,
      } as any);

      const res = await authService.signIn('unverified@student.vu.edu.au', 'Password123!');

      expect(res.success).toBe(false);
      expect(res.needsEmailVerification).toBe(true);
      expect(res.error).toContain('Please confirm your email address first');
      expect(firebaseAuth.signOut).toHaveBeenCalled();
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('creates active local user with right role, sets session, and stores no password hash when email is verified', async () => {
      const verifiedUser = {
        uid: 'fb_verified_uid',
        email: 'staff.jane@vu.edu.au',
        displayName: 'Jane Staff',
        emailVerified: true,
      };

      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
        user: verifiedUser,
      } as any);

      const res = await authService.signIn('staff.jane@vu.edu.au', 'Password123!');

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('fb_verified_uid');
      expect(res.data?.name).toBe('Jane Staff');
      expect(res.data?.role).toBe('staff'); // vu.edu.au gets staff role
      expect(res.data?.status).toBe('active');
      expect(res.data?.accountStatus).toBe('active');

      // Local storage has no password hash
      expect(appStorage.getPasswordHash('staff.jane@vu.edu.au')).toBeFalsy();

      // Current user is set
      expect(authService.getCurrentUser()?.id).toBe('fb_verified_uid');
    });

    it('returns "Incorrect email or password." on wrong password or user-not-found', async () => {
      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue({
        code: 'auth/wrong-password',
        message: 'Wrong password',
      });

      const res = await authService.signIn('student@student.vu.edu.au', 'BadPassword999!');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Incorrect email or password.');

      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue({
        code: 'auth/user-not-found',
        message: 'No user',
      });

      const resNotFound = await authService.signIn('student@student.vu.edu.au', 'BadPassword999!');
      expect(resNotFound.success).toBe(false);
      expect(resNotFound.error).toBe('Incorrect email or password.');
    });
  });

  describe('Forgot Password (requestPasswordReset)', () => {
    it('calls sendPasswordResetEmail for real-domain address and returns neutral message', async () => {
      const res = await authService.requestPasswordReset('student@student.vu.edu.au');

      expect(res.success).toBe(true);
      expect(res.message).toBe('If an account exists for that address, we emailed a reset link.');
      expect(firebaseAuth.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'student@student.vu.edu.au',
        expect.objectContaining({ url: expect.any(String) })
      );
    });

    it('falls back to sendPasswordResetEmail without url on unauthorized-continue-uri', async () => {
      vi.mocked(firebaseAuth.sendPasswordResetEmail)
        .mockRejectedValueOnce({ code: 'auth/unauthorized-continue-uri' })
        .mockResolvedValueOnce(undefined as any);

      const res = await authService.requestPasswordReset('student@live.vu.edu.au');

      expect(res.success).toBe(true);
      expect(res.message).toBe('If an account exists for that address, we emailed a reset link.');
      expect(firebaseAuth.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
      expect(firebaseAuth.sendPasswordResetEmail).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'student@live.vu.edu.au'
      );
    });

    it('does NOT call sendPasswordResetEmail for seeded demo accounts or @campusfind.test addresses', async () => {
      const demoAccounts = [
        'admin@campusfind.test',
        'priya@campusfind.test',
        'user@campusfind.test',
      ];

      for (const email of demoAccounts) {
        const res = await authService.requestPasswordReset(email);
        expect(res.success).toBe(true);
        expect(res.message).toBe('If an account exists for that address, we emailed a reset link.');
      }

      expect(firebaseAuth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('enforces university domain rule on requestPasswordReset', async () => {
      const res = await authService.requestPasswordReset('attacker@yahoo.com');
      expect(res.success).toBe(false);
      expect(res.error).toContain('valid Victoria University email address');
      expect(firebaseAuth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('Sign Out', () => {
    it('authService.signOut calls Firebase signOut and clears current user in storage', async () => {
      // Set dummy user
      appStorage.setCurrentUser({
        id: 'u_dummy',
        name: 'Dummy',
        email: 'dummy@vu.edu.au',
        role: 'student',
        status: 'active',
        accountStatus: 'active',
        rejectedClaimCount: 0,
        flagged: false,
        createdAt: new Date().toISOString(),
      });
      expect(authService.getCurrentUser()).not.toBeNull();

      authService.signOut();

      expect(authService.getCurrentUser()).toBeNull();
      expect(firebaseAuth.signOut).toHaveBeenCalled();
    });
  });

  describe('Role and Email-Domain Rules', () => {
    describe('getRoleForEmail', () => {
      it('correctly maps valid staff and student addresses, and returns null for invalid/unrecognized domains', () => {
        expect(getRoleForEmail('e1234567@vu.edu.au')).toBe('staff');
        expect(getRoleForEmail('jane.smith@vu.edu.au')).toBe('staff');
        expect(getRoleForEmail('s1234567@student.vu.edu.au')).toBe('student');
        expect(getRoleForEmail('s1234567@live.vu.edu.au')).toBe('student');

        // student.vu.edu.au with no user -> null
        expect(getRoleForEmail('student.vu.edu.au')).toBeNull();
        expect(getRoleForEmail('@student.vu.edu.au')).toBeNull();

        // campusfind.test -> null
        expect(getRoleForEmail('user@campusfind.test')).toBeNull();

        // user@gmail.com -> null
        expect(getRoleForEmail('user@gmail.com')).toBeNull();

        // user@notvu.edu.au -> null
        expect(getRoleForEmail('user@notvu.edu.au')).toBeNull();

        // user@sub.student.vu.edu.au -> null
        expect(getRoleForEmail('user@sub.student.vu.edu.au')).toBeNull();
      });
    });

    describe('validateRoleForEmail', () => {
      it('allows correct roles for student and staff addresses', () => {
        expect(() => {
          authService.validateRoleForEmail('s1234567@student.vu.edu.au', 'student');
        }).not.toThrow();

        expect(() => {
          authService.validateRoleForEmail('jane.smith@vu.edu.au', 'staff');
        }).not.toThrow();
      });

      it('throws exact error when student email tries to register with staff role', () => {
        expect(() => {
          authService.validateRoleForEmail('s1234567@student.vu.edu.au', 'staff');
        }).toThrowError(
          'Staff accounts need your staff email address ending in @vu.edu.au, for example e1234567@vu.edu.au or jane.smith@vu.edu.au. Student email addresses can only register as Student.'
        );
      });

      it('throws exact error when staff email tries to register with student role', () => {
        expect(() => {
          authService.validateRoleForEmail('jane.smith@vu.edu.au', 'student');
        }).toThrowError(
          'Student accounts need your student email address ending in @student.vu.edu.au or @live.vu.edu.au. Email addresses ending in @vu.edu.au can only register as Staff.'
        );
      });

      it('passes with student and with staff for campusfind.test', () => {
        expect(() => {
          authService.validateRoleForEmail('test@campusfind.test', 'student');
        }).not.toThrow();

        expect(() => {
          authService.validateRoleForEmail('test@campusfind.test', 'staff');
        }).not.toThrow();
      });

      it('throws exact error for non-VU domain', () => {
        expect(() => {
          authService.validateRoleForEmail('user@gmail.com', 'student');
        }).toThrowError(
          'This email address is not a recognised VU staff or student address. Use your @vu.edu.au (staff) or @student.vu.edu.au / @live.vu.edu.au (student) address.'
        );
      });
    });

    describe('signUp role guard', () => {
      it('student email with staff role does not record an attempt, does not call createUserWithEmailAndPassword, does not write storage, and returns exact error', async () => {
        const initialUsersCount = appStorage.getUsers().length;

        const res = await authService.signUp({
          name: 'Mistaken Student',
          email: 's1234567@student.vu.edu.au',
          password: 'Password123!',
          role: 'staff',
        });

        expect(res.success).toBe(false);
        expect(res.error).toBe(
          'Staff accounts need your staff email address ending in @vu.edu.au, for example e1234567@vu.edu.au or jane.smith@vu.edu.au. Student email addresses can only register as Student.'
        );
        expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
        expect(appStorage.getSignupAttempts()['s1234567@student.vu.edu.au']).toBeUndefined();
        expect(appStorage.getUsers().length).toBe(initialUsersCount);
        expect(appStorage.getUserByEmail('s1234567@student.vu.edu.au')).toBeUndefined();
      });
    });

    describe('signIn role derivation & admin restriction', () => {
      it('verified user with @vu.edu.au signs in as staff even if local storage says student', async () => {
        appStorage.saveUser({
          id: 'fb_staff_mismatch',
          name: 'Jane Staff',
          email: 'jane.smith@vu.edu.au',
          role: 'student', // wrongly stored in local record
          status: 'pending',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        });

        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
          user: {
            uid: 'fb_staff_mismatch',
            email: 'jane.smith@vu.edu.au',
            displayName: 'Jane Staff',
            emailVerified: true,
          },
        } as any);

        const res = await authService.signIn('jane.smith@vu.edu.au', 'Password123!');
        expect(res.success).toBe(true);
        expect(res.data?.role).toBe('staff');
        // Local storage record was updated to match
        expect(appStorage.getUserByEmail('jane.smith@vu.edu.au')?.role).toBe('staff');
      });

      it('verified user with @student.vu.edu.au signs in as student even if local storage says staff', async () => {
        appStorage.saveUser({
          id: 'fb_student_mismatch',
          name: 'Sam Student',
          email: 's1234567@student.vu.edu.au',
          role: 'staff', // wrongly stored in local record
          status: 'pending',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        });

        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
          user: {
            uid: 'fb_student_mismatch',
            email: 's1234567@student.vu.edu.au',
            displayName: 'Sam Student',
            emailVerified: true,
          },
        } as any);

        const res = await authService.signIn('s1234567@student.vu.edu.au', 'Password123!');
        expect(res.success).toBe(true);
        expect(res.data?.role).toBe('student');
        // Local storage record was updated to match
        expect(appStorage.getUserByEmail('s1234567@student.vu.edu.au')?.role).toBe('student');
      });

      it('neither @vu.edu.au nor @student.vu.edu.au can become admin', async () => {
        appStorage.saveUser({
          id: 'fb_admin_attempt',
          name: 'Admin Attempt',
          email: 'exploit@vu.edu.au',
          role: 'admin',
          status: 'pending',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        });

        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
          user: {
            uid: 'fb_admin_attempt',
            email: 'exploit@vu.edu.au',
            displayName: 'Admin Attempt',
            emailVerified: true,
          },
        } as any);

        const res = await authService.signIn('exploit@vu.edu.au', 'Password123!');
        expect(res.success).toBe(true);
        expect(res.data?.role).not.toBe('admin');
        expect(res.data?.role).toBe('staff');
        expect(appStorage.getUserByEmail('exploit@vu.edu.au')?.role).not.toBe('admin');
      });
    });

    describe('Confirm Password and Account Deletion', () => {
      it('signUp throws if passwords do not match and does NOT record an attempt or call Firebase', async () => {
        const attemptsBefore =
          appStorage.getSignupAttempts()['s1234567@student.vu.edu.au']?.count || 0;

        await expect(
          authService.signUp({
            name: 'Test Student',
            email: 's1234567@student.vu.edu.au',
            password: 'Password123!',
            confirmPassword: 'MismatchPassword999!',
            role: 'student',
          })
        ).rejects.toThrow('The two passwords do not match.');

        // Verify attempt was NOT recorded
        const attemptsAfter =
          appStorage.getSignupAttempts()['s1234567@student.vu.edu.au']?.count || 0;
        expect(attemptsAfter).toBe(attemptsBefore);

        // Verify Firebase was NOT called
        expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
      });

      it('confirmPassword added to SignUpParams and succeeds when passwords match', async () => {
        vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
          user: {
            uid: 'match_pw_user',
            email: 'match.student@student.vu.edu.au',
            displayName: 'Match Student',
            emailVerified: false,
          },
        } as any);

        const res = await authService.signUp({
          name: 'Match Student',
          email: 'match.student@student.vu.edu.au',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          role: 'student',
        });

        expect(res.success).toBe(true);
        expect(res.isRealVerification).toBe(true);
      });

      it('deleteAccount refuses admin accounts, seeded demo accounts, and accounts with a pending-verification report', async () => {
        // Refuses admin account
        const adminUser = appStorage.getUserById('user_admin_1')!;
        const adminRes = await authService.deleteAccount(adminUser, 'Campus#2026');
        expect(adminRes.success).toBe(false);
        expect(adminRes.error).toBe('Administrator accounts cannot be deleted.');

        // Refuses seeded demo accounts
        const seededUser = appStorage.getUserById('user_student_1')!;
        const seededRes = await authService.deleteAccount(seededUser, 'Campus#2026');
        expect(seededRes.success).toBe(false);
        expect(seededRes.error).toBe('Seeded demo accounts cannot be deleted.');

        // Refuses account with report with status "Pending Verification"
        const customUser: User = {
          id: 'usr_with_pending_rep',
          name: 'Pending Case Student',
          email: 'pending_case@campusfind.test',
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(customUser);
        appStorage.setPasswordHash(customUser.email, hashPassword('Campus#2026'));
        appStorage.saveReport({
          id: 'rep_pending_test',
          userId: customUser.id,
          userEmail: customUser.email,
          type: 'lost',
          itemName: 'Pending Verification Wallet',
          category: 'Wallet',
          colour: 'black',
          location: 'Library (Level 2)',
          date: '2026-10-10',
          description: 'Wallet in pending verification',
          status: 'Pending Verification',
          flaggedDuplicate: false,
          locked: true,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        });

        const pendingRes = await authService.deleteAccount(customUser, 'Campus#2026');
        expect(pendingRes.success).toBe(false);
        expect(pendingRes.error).toBe('Finish or withdraw your pending reports first.');
      });

      it('deleteAccount deletes the Firebase user and cleans up local storage for a real account', async () => {
        const realUser: User = {
          id: 'fb_real_delete_uid',
          name: 'Real Deletable Student',
          email: 'delete.real@student.vu.edu.au',
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(realUser);
        appStorage.setCurrentUser(realUser);
        appStorage.saveSignupAttempts({
          'delete.real@student.vu.edu.au': {
            email: 'delete.real@student.vu.edu.au',
            count: 3,
          },
        });

        const mockFbUser = {
          uid: 'fb_real_delete_uid',
          email: 'delete.real@student.vu.edu.au',
        };
        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
          user: mockFbUser,
        } as any);

        const res = await authService.deleteAccount(realUser, 'ValidPass123!');
        expect(res.success).toBe(true);

        // Firebase deleteUser called
        expect(firebaseAuth.deleteUser).toHaveBeenCalledWith(mockFbUser);

        // Local storage cleaned up
        expect(appStorage.getUserById(realUser.id)).toBeUndefined();
        expect(appStorage.getUserByEmail(realUser.email)).toBeUndefined();
        expect(
          appStorage.getSignupAttempts()['delete.real@student.vu.edu.au']
        ).toBeUndefined();
        expect(appStorage.getCurrentUser()).toBeNull();
      });

      it('deleteAccount checks the password hash and cleans up local storage for a @campusfind.test account', async () => {
        const testEmail = 'deletable.test@campusfind.test';
        const testPassword = 'Password123!';
        const testUser: User = {
          id: 'usr_deletable_sim',
          name: 'Sim Deletable',
          email: testEmail,
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(testUser);
        appStorage.setCurrentUser(testUser);
        appStorage.setPasswordHash(testEmail, hashPassword(testPassword));
        appStorage.addSimulatedEmail({
          id: 'sim_mail_del',
          recipientEmail: testEmail,
          subject: 'Confirm',
          token: 'token_del',
          verifyUrl: '/?tok=del',
          createdAt: new Date().toISOString(),
          used: true,
        });

        const res = await authService.deleteAccount(testUser, testPassword);
        expect(res.success).toBe(true);

        // Clean-up verified
        expect(appStorage.getUserById(testUser.id)).toBeUndefined();
        expect(appStorage.getUserByEmail(testEmail)).toBeUndefined();
        expect(appStorage.getPasswordHash(testEmail)).toBeUndefined();
        expect(
          appStorage
            .getSimulatedEmails()
            .find((m) => m.recipientEmail === testEmail)
        ).toBeUndefined();
        expect(appStorage.getCurrentUser()).toBeNull();
      });

      it('deleteAccount refuses an incorrect password', async () => {
        // Simulated account incorrect password
        const simUser: User = {
          id: 'usr_wrong_pw_check',
          name: 'Wrong Pw User',
          email: 'wrong_pw@campusfind.test',
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(simUser);
        appStorage.setPasswordHash(simUser.email, hashPassword('Correct123!'));

        const simRes = await authService.deleteAccount(simUser, 'WrongPassword999!');
        expect(simRes.success).toBe(false);
        expect(simRes.error).toBe('Incorrect password.');

        // Real account incorrect password
        const realUser: User = {
          id: 'usr_real_wrong_pw',
          name: 'Real Wrong Pw User',
          email: 'wrong.pw.real@student.vu.edu.au',
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(realUser);

        const authError: any = new Error('Wrong password');
        authError.code = 'auth/wrong-password';
        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValueOnce(authError);

        const realRes = await authService.deleteAccount(realUser, 'WrongPassword999!');
        expect(realRes.success).toBe(false);
        expect(realRes.error).toBe('Incorrect password.');
      });

      it('signIn clears attempts on successful real login', async () => {
        const email = 'clear.attempts.login@student.vu.edu.au';
        appStorage.saveSignupAttempts({
          [email]: { email, count: 4 },
        });
        expect(appStorage.getSignupAttempts()[email]?.count).toBe(4);

        vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
          user: {
            uid: 'fb_login_cleared_uid',
            email,
            displayName: 'Cleared User',
            emailVerified: true,
          },
        } as any);

        const res = await authService.signIn(email, 'Password123!');
        expect(res.success).toBe(true);
        expect(appStorage.getSignupAttempts()[email]).toBeUndefined();
      });

      it('reportService.anonymiseReportsForDeletedUser anonymises user reports, archives open reports, and keeps closed reports read-only', () => {
        const userId = 'usr_to_anonymise';
        const otherUserId = 'usr_other_person';

        const openReport: ItemReport = {
          id: 'rep_open_1',
          userId,
          userName: 'Alice Smith',
          userEmail: 'alice@student.vu.edu.au',
          type: 'lost',
          itemName: 'Blue Umbrella',
          category: 'Other',
          colour: 'Blue',
          location: 'Library (Level 2)',
          date: '2026-10-10',
          description: 'Left near entrance',
          status: 'Submitted',
          flaggedDuplicate: false,
          locked: false,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };

        const returnedReport: ItemReport = {
          id: 'rep_returned_1',
          userId,
          userName: 'Alice Smith',
          userEmail: 'alice@student.vu.edu.au',
          type: 'found',
          itemName: 'Sony Earbuds',
          category: 'Headphones / earbuds',
          colour: 'Black',
          location: 'Cafeteria (Level 4)',
          date: '2026-10-09',
          description: 'Found on table',
          status: 'Returned',
          flaggedDuplicate: false,
          locked: true,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };

        const otherUserReport: ItemReport = {
          id: 'rep_other_1',
          userId: otherUserId,
          userName: 'Bob Jones',
          userEmail: 'bob@student.vu.edu.au',
          type: 'lost',
          itemName: 'Wallet',
          category: 'Wallet',
          colour: 'Brown',
          location: 'Study Pods (Level 5)',
          date: '2026-10-08',
          description: 'Lost wallet',
          status: 'Submitted',
          flaggedDuplicate: false,
          locked: false,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };

        appStorage.saveReports([openReport, returnedReport, otherUserReport]);

        reportService.anonymiseReportsForDeletedUser(userId);

        const rep1 = appStorage.getReportById('rep_open_1');
        expect(rep1?.userName).toBe('Deleted account');
        expect(rep1?.userEmail).toBeUndefined();
        expect(rep1?.status).toBe('Archived');
        expect(rep1?.locked).toBe(true);

        const rep2 = appStorage.getReportById('rep_returned_1');
        expect(rep2?.userName).toBe('Deleted account');
        expect(rep2?.userEmail).toBeUndefined();
        expect(rep2?.status).toBe('Returned'); // Closed report left as returned
        expect(rep2?.locked).toBe(true);

        const repOther = appStorage.getReportById('rep_other_1');
        expect(repOther?.userName).toBe('Bob Jones');
        expect(repOther?.userEmail).toBe('bob@student.vu.edu.au');
        expect(repOther?.status).toBe('Submitted');
      });

      it('deleteAccount writes exactly ONE System audit-log entry Account Deleted containing only the user id and anonymises reports', async () => {
        const testEmail = 'audit.delete@campusfind.test';
        const testPassword = 'Password123!';
        const testUser: User = {
          id: 'usr_audit_del_id',
          name: 'Audit Person',
          email: testEmail,
          role: 'student',
          status: 'active',
          accountStatus: 'active',
          rejectedClaimCount: 0,
          flagged: false,
          createdAt: new Date().toISOString(),
        };
        appStorage.saveUser(testUser);
        appStorage.setCurrentUser(testUser);
        appStorage.setPasswordHash(testEmail, hashPassword(testPassword));

        const userReport: ItemReport = {
          id: 'rep_user_del_audit',
          userId: testUser.id,
          userName: testUser.name,
          userEmail: testUser.email,
          type: 'lost',
          itemName: 'Water Bottle',
          category: 'Other',
          colour: 'Red',
          location: 'Library (Level 2)',
          date: '2026-10-10',
          description: 'Metal bottle',
          status: 'Submitted',
          flaggedDuplicate: false,
          locked: false,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };
        appStorage.saveReport(userReport);

        const initialActions = appStorage.getAdminActions();

        const res = await authService.deleteAccount(testUser, testPassword);
        expect(res.success).toBe(true);

        // Verify report was anonymised
        const updatedReport = appStorage.getReportById('rep_user_del_audit');
        expect(updatedReport?.userName).toBe('Deleted account');
        expect(updatedReport?.userEmail).toBeUndefined();
        expect(updatedReport?.status).toBe('Archived');
        expect(updatedReport?.locked).toBe(true);

        // Verify audit log has exactly one new entry
        const afterActions = appStorage.getAdminActions();
        expect(afterActions.length).toBe(initialActions.length + 1);

        const deleteAction = afterActions.find((a) => a.action === 'Account Deleted');
        expect(deleteAction).toBeDefined();
        expect(deleteAction?.targetUserId).toBe(testUser.id);
        expect(deleteAction?.adminName).toBe('System');
        // Contains only the user id (no name, no email)
        expect(deleteAction?.details).toContain(testUser.id);
        expect(deleteAction?.details).not.toContain(testUser.name);
        expect(deleteAction?.details).not.toContain(testUser.email);
      });
    });
  });
});
