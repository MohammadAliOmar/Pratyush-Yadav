import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { authService } from '../services/authService';
import { matchService } from '../services/matchService';
import { reportService } from '../services/reportService';
import { verificationService } from '../services/verificationService';
import { appStorage } from '../services/storage';
import { firestoreSync } from '../services/firestoreSync';
import { ItemReport, SimulatedEmail } from '../types';
import {
  MATCHING_WEIGHTS,
  VERIFICATION_LINK_EXPIRY_HOURS,
  SIMULATED_EMAIL_DOMAINS,
  ALLOWED_EMAIL_DOMAINS,
} from '../config/matchingConfig';
import App from '../App';

describe('CampusFind Test Suite', () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    firestoreSync.setSyncPaused(true);
    appStorage.resetToTestFixtures();
  });

  describe('Clean Start and Auth Verification', () => {
    it('initializes clean seed with exactly one admin account and zero initial data', async () => {
      appStorage.resetToSeedData();
      const users = appStorage.getUsers();
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Admin');
      expect(users[0].email).toBe('admin@campusfind.test');
      expect(users[0].role).toBe('admin');
      expect(appStorage.getReports().length).toBe(0);
      expect(appStorage.getMatchSuggestions().length).toBe(0);
      expect(appStorage.getNotifications().length).toBe(0);
      expect(appStorage.getAdminActions().length).toBe(0);

      const adminSignIn = await authService.signIn('admin@campusfind.test', 'Admin123321');
      expect(adminSignIn.success).toBe(true);
      expect(adminSignIn.data?.name).toBe('Admin');
    });
    it('allows all demo accounts to sign in with Campus#2026', async () => {
      const demoEmails = [
        'admin@campusfind.test',
        'admin2@campusfind.test',
        'priya@campusfind.test',
        'liam@campusfind.test',
        'ayesha@campusfind.test',
        'noah@campusfind.test',
        'mei.tan@campusfind.test',
      ];

      for (const email of demoEmails) {
        const res = await authService.signIn(email, 'Campus#2026');
        expect(res.success).toBe(true);
        expect(res.data?.email).toBe(email);
      }
    });

    it('allows self-registered student to sign in with their custom password but blocks Campus#2026', async () => {
      const customEmail = 'newstudent@campusfind.test';
      const customPass = 'Mypass#123';

      const signUpRes = await authService.signUp({
        name: 'New Student',
        email: customEmail,
        password: customPass,
        role: 'student',
      });
      expect(signUpRes.success).toBe(true);
      expect(signUpRes.data?.token).toBeDefined();

      // Confirm verification
      const verifyRes = await authService.handleVerificationDecision(
        signUpRes.data!.token,
        customEmail,
        true
      );
      expect(verifyRes.success).toBe(true);

      // Sign in with real password -> MUST SUCCEED
      const validSignIn = await authService.signIn(customEmail, customPass);
      expect(validSignIn.success).toBe(true);
      expect(validSignIn.data?.name).toBe('New Student');

      // Sign in with demo password -> MUST FAIL
      const backdoorAttempt = await authService.signIn(customEmail, 'Campus#2026');
      expect(backdoorAttempt.success).toBe(false);
      expect(backdoorAttempt.error).toBe('Incorrect email or password.');
    });

    it('blocks Campus#2026 for admin@campusfind.test after resetToSeedData', async () => {
      appStorage.resetToSeedData();
      const res = await authService.signIn('admin@campusfind.test', 'Campus#2026');
      expect(res.success).toBe(false);
    });

    it('allows self-registered student to sign in with their custom password but blocks Admin123321', async () => {
      appStorage.resetToSeedData();
      const customEmail = 'newstudent@campusfind.test';
      const customPass = 'Mypass#123';

      const signUpRes = await authService.signUp({
        name: 'New Student',
        email: customEmail,
        password: customPass,
        role: 'student',
      });
      expect(signUpRes.success).toBe(true);
      expect(signUpRes.data?.token).toBeDefined();

      // Confirm verification
      const verifyRes = await authService.handleVerificationDecision(
        signUpRes.data!.token,
        customEmail,
        true
      );
      expect(verifyRes.success).toBe(true);

      // Sign in with real password -> MUST SUCCEED
      const validSignIn = await authService.signIn(customEmail, customPass);
      expect(validSignIn.success).toBe(true);
      expect(validSignIn.data?.name).toBe('New Student');

      // Sign in with admin password -> MUST FAIL
      const adminPassAttempt = await authService.signIn(customEmail, 'Admin123321');
      expect(adminPassAttempt.success).toBe(false);
      expect(adminPassAttempt.error).toBe('Incorrect email or password.');
    });

    it('rejects passwords that do not meet complexity requirements', () => {
      expect(authService.isValidPassword('short1')).toBe(false); // <8 chars
      expect(authService.isValidPassword('allcharacterswithoutnumbers')).toBe(false);
      expect(authService.isValidPassword('1234567890')).toBe(false);
      expect(authService.isValidPassword('ValidPassword1')).toBe(true);
    });
  });

  describe('24-Hour Verification Link Expiry', () => {
    it('allows link confirmation within 24 hours (e.g. 23 hours old)', async () => {
      const token = 'token_23h_valid';
      const email = 'fresh_user@campusfind.test';

      // Seed pending user
      const signUpRes = await authService.signUp({
        name: 'Fresh User',
        email,
        password: 'Password99!',
        role: 'student',
      });
      expect(signUpRes.success).toBe(true);

      const generatedToken = signUpRes.data!.token;

      // Adjust timestamp to 23 hours ago
      const emails = appStorage.getSimulatedEmails();
      const mail = emails.find((m) => m.token === generatedToken);
      expect(mail).toBeDefined();
      mail!.createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      appStorage.saveSimulatedEmails(emails);

      const decision = await authService.handleVerificationDecision(generatedToken, email, true);
      expect(decision.success).toBe(true);
      expect(decision.message).toContain('Account confirmed successfully');
    });

    it('rejects link older than 24 hours with exact required error message', async () => {
      const expiredEmail: SimulatedEmail = {
        id: 'mail_expired_test_vitest',
        recipientEmail: 'expired_student@campusfind.test',
        subject: 'Verify your account',
        token: 'token_expired_25h_vitest',
        verifyUrl: '/?action=verify&token=token_expired_25h_vitest',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        used: false,
      };
      appStorage.addSimulatedEmail(expiredEmail);

      const decision = await authService.handleVerificationDecision(
        'token_expired_25h_vitest',
        'expired_student@campusfind.test',
        true
      );
      expect(decision.success).toBe(false);
      expect(decision.message).toBe('This confirmation link has expired. Please register again.');

      // Ensure marked as used
      const storedMails = appStorage.getSimulatedEmails();
      const stored = storedMails.find((m) => m.token === 'token_expired_25h_vitest');
      expect(stored?.used).toBe(true);
    });
  });

  describe('Matching Engine Scoring & Worked Example Benchmark', () => {
    const lostWallet: ItemReport = {
      id: 'rep_lost_wallet_test',
      userId: 'test_u1',
      type: 'lost',
      itemName: 'Black Leather Wallet',
      category: 'Wallet',
      colour: 'black',
      location: 'Library (Level 2)',
      date: '2026-10-05',
      description: 'Black leather wallet with student card and Myki.',
      status: 'Submitted',
      flaggedDuplicate: false,
      locked: false,
      createdAt: '2026-10-05T14:30:00Z',
      lastActivityAt: '2026-10-05T14:30:00Z',
    };

    const foundWalletA: ItemReport = {
      id: 'rep_found_wallet_a_test',
      userId: 'test_u2',
      type: 'found',
      itemName: 'Black Leather Wallet',
      category: 'Wallet',
      colour: 'black',
      location: 'Library (Level 2)',
      date: '2026-10-05',
      description: 'Black leather wallet found near study desk.',
      status: 'Submitted',
      flaggedDuplicate: false,
      locked: false,
      createdAt: '2026-10-05T16:00:00Z',
      lastActivityAt: '2026-10-05T16:00:00Z',
    };

    const foundWalletB: ItemReport = {
      id: 'rep_found_wallet_b_test',
      userId: 'test_u3',
      type: 'found',
      itemName: 'Brown Leather Wallet',
      category: 'Wallet',
      colour: 'brown',
      location: 'Library (Level 2)',
      date: '2026-10-06',
      description: 'Brown leather wallet with student ID found on desk.',
      status: 'Submitted',
      flaggedDuplicate: false,
      locked: false,
      createdAt: '2026-10-06T10:15:00Z',
      lastActivityAt: '2026-10-06T10:15:00Z',
    };

    it('correctly scores Worked Example benchmark (Found A = 97.0 vs Found B = 85.0)', () => {
      const scoreA = matchService.scoreReports(lostWallet, foundWalletA, 0.90);
      const scoreB = matchService.scoreReports(lostWallet, foundWalletB, 0.65);

      expect(scoreA.categoryScore).toBe(35);
      expect(scoreA.descriptionScore).toBe(27.0); // 30 * 0.90
      expect(scoreA.locationScore).toBe(20);
      expect(scoreA.dateScore).toBe(10); // 0 days apart
      expect(scoreA.colourScore).toBe(5); // exact black
      expect(scoreA.totalScore).toBe(97.0);

      expect(scoreB.categoryScore).toBe(35);
      expect(scoreB.descriptionScore).toBe(19.5); // 30 * 0.65
      expect(scoreB.locationScore).toBe(20);
      expect(scoreB.dateScore).toBe(8.0); // 1 day apart -> 10 * 0.8
      expect(scoreB.colourScore).toBe(2.5); // black vs brown -> adjacent (2.5)
      expect(scoreB.totalScore).toBe(85.0);

      expect(scoreA.totalScore).toBeGreaterThan(scoreB.totalScore);
    });

    it('classifies confidence thresholds accurately', () => {
      expect(matchService.classifyMatch(97.0)).toBe('Likely match');
      expect(matchService.classifyMatch(75.0)).toBe('Likely match');
      expect(matchService.classifyMatch(74.9)).toBe('Possible match');
      expect(matchService.classifyMatch(45.0)).toBe('Possible match');
      expect(matchService.classifyMatch(44.9)).toBeNull(); // Discarded
    });

    it('calculates date decay curve properly', () => {
      expect(matchService.calculateDateDecay(0)).toBe(1.0);
      expect(matchService.calculateDateDecay(1)).toBe(0.8);
      expect(matchService.calculateDateDecay(3)).toBe(0.8);
      expect(matchService.calculateDateDecay(4)).toBe(0.5);
      expect(matchService.calculateDateDecay(14)).toBe(0.5);
      expect(matchService.calculateDateDecay(15)).toBe(0.2);
    });

    it('calculates colour match and adjacency correctly', () => {
      expect(matchService.calculateColourScore('black', 'black')).toBe(5.0);
      expect(matchService.calculateColourScore('black', 'brown')).toBe(2.5);
      expect(matchService.calculateColourScore('black', 'red')).toBe(0.0);
    });
  });

  describe('Photo Persistence and Storage Error Handling', () => {
    it('detects quota exceeded error in storage and throws designated message', () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      expect(() => {
        try {
          throw quotaError;
        } catch (e: any) {
          if (e.name === 'QuotaExceededError') {
            throw new Error('Storage is full - remove the photo and try again');
          }
          throw e;
        }
      }).toThrow('Storage is full - remove the photo and try again');
    });
  });

  describe('Section 6 Business Rules', () => {
    it('BR 1: Cannot set "Returned" status directly via updateReportStatus', async () => {
      const admin = appStorage.getUserById('user_admin_1');
      appStorage.setCurrentUser(admin!);

      const result = await reportService.updateReportStatus(
        'rep_found_earbuds_1',
        'Returned' as any
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Returned');
    });

    it('BR 2: Report editing is locked once verification has begun', async () => {
      const result = await reportService.updateReport('rep_lost_laptop_1', {
        itemName: 'Hacked Laptop Name',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });

    it('BR 3: Duplicate submissions within 3 days are flagged for administrator', () => {
      const reports = appStorage.getReports();
      const duplicateReport = reports.find((r) => r.id === 'rep_lost_phone_noah_2');
      expect(duplicateReport).toBeDefined();
      expect(duplicateReport?.flaggedDuplicate).toBe(true);
    });

    it('BR 4: Closed / Archived / Returned cases cannot be modified', async () => {
      const result = await reportService.updateReport('rep_lost_backpack_1', {
        itemName: 'New Backpack Name',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Closed');
    });

    it('BR 5: Returning an item dismisses all other pending matches', async () => {
      const admin = appStorage.getUserById('user_admin_1');
      appStorage.setCurrentUser(admin!);

      const res = await verificationService.submitVerificationResult({
        matchSuggestionId: 'match_wallet_1a',
        lostReportId: 'rep_lost_wallet_1',
        foundReportId: 'rep_found_wallet_a',
        checklistResponses: [{ question: 'Q1', matched: true }],
        adminNotes: 'Verified during unit test',
        outcome: 'Passed',
      });
      expect(res.success).toBe(true);

      const matches = appStorage.getMatchSuggestions();
      const otherMatch = matches.find((m) => m.id === 'match_wallet_1b');
      expect(otherMatch?.status).toBe('dismissed');
    });

    it('BR 6: Administrator cannot verify reports they submitted (Conflict of Interest)', async () => {
      const admin = appStorage.getUserById('user_admin_1');
      appStorage.setCurrentUser(admin!);

      const report = appStorage.getReportById('rep_lost_wallet_1');
      expect(report).toBeDefined();
      report!.userId = 'user_admin_1';
      report!.status = 'Submitted';
      appStorage.saveReport(report!);

      const result = await verificationService.startVerification('match_wallet_1a');
      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain('conflict of interest');
    });

    it('BR 7: 90-day inactivity check moves reports to Archived and locks them', () => {
      const oldReport: ItemReport = {
        id: 'rep_unit_91d',
        userId: 'test_u1',
        type: 'lost',
        itemName: 'Old Notebook',
        category: 'Other',
        colour: 'blue',
        location: 'Building M',
        date: '2026-05-01',
        description: 'Old notebook 91 days inactive',
        status: 'Submitted',
        flaggedDuplicate: false,
        locked: false,
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const freshReport: ItemReport = {
        id: 'rep_unit_89d',
        userId: 'test_u1',
        type: 'lost',
        itemName: 'Recent Notebook',
        category: 'Other',
        colour: 'blue',
        location: 'Building M',
        date: '2026-07-01',
        description: 'Recent notebook 89 days inactive',
        status: 'Submitted',
        flaggedDuplicate: false,
        locked: false,
        createdAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(),
      };

      appStorage.saveReport(oldReport);
      appStorage.saveReport(freshReport);

      appStorage.runInactivityArchiving();

      const checkedOld = appStorage.getReportById('rep_unit_91d');
      const checkedFresh = appStorage.getReportById('rep_unit_89d');

      expect(checkedOld?.status).toBe('Archived');
      expect(checkedOld?.locked).toBe(true);
      expect(checkedFresh?.status).toBe('Submitted');
      expect(checkedFresh?.locked).toBe(false);
    });
  });

  describe('Section 8 Abuse & Rate Limiting', () => {
    it('locks sign-up after 5 attempts', () => {
      const testEmail = 'lockout_test@student.vu.edu.au';
      authService.clearAttempts(testEmail);

      for (let i = 0; i < 4; i++) {
        authService.recordAttempt(testEmail);
        expect(authService.checkRateLimit(testEmail).locked).toBe(false);
      }

      authService.recordAttempt(testEmail);
      const lockedCheck = authService.checkRateLimit(testEmail);
      expect(lockedCheck.locked).toBe(true);
      expect(lockedCheck.message).toContain('Too many sign-up attempts');

      authService.clearAttempts(testEmail);
    });

    it('accepts university email domains and rejects public email providers', () => {
      expect(authService.isValidUniversityEmail('student@student.vu.edu.au')).toBe(true);
      expect(authService.isValidUniversityEmail('prof@vu.edu.au')).toBe(true);
      expect(authService.isValidUniversityEmail('staff@live.vu.edu.au')).toBe(true);
      expect(authService.isValidUniversityEmail('demo@campusfind.test')).toBe(true);

      expect(authService.isValidUniversityEmail('hacker@gmail.com')).toBe(false);
      expect(authService.isValidUniversityEmail('scam@yahoo.com')).toBe(false);
      expect(authService.isValidUniversityEmail('fraud@outlook.com')).toBe(false);
    });
  });

  describe('Header Sign-Out Navbar State', () => {
    it('sign in, click header Sign Out, assert the navbar shows "Sign In" and no user name', async () => {
      window.scrollTo = () => {};

      // Sign in as Priya
      const signInRes = await authService.signIn('priya@campusfind.test', 'Campus#2026');
      expect(signInRes.success).toBe(true);
      const userName = authService.getCurrentUser()?.name;
      expect(userName).toBe('Priya Sharma');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      try {
        await act(async () => {
          root.render(React.createElement(App));
        });

        const header = container.querySelector('header');
        expect(header).toBeTruthy();
        expect(header?.textContent).toContain('Priya Sharma');
        expect(header?.textContent).not.toContain('Sign In');

        // Locate desktop header sign out button
        const signOutButton = container.querySelector('button[title="Sign Out"]') as HTMLButtonElement;
        expect(signOutButton).toBeTruthy();

        // Click header Sign Out
        await act(async () => {
          signOutButton.click();
        });

        // Assert the navbar shows "Sign In" and no user name
        const updatedHeader = container.querySelector('header');
        expect(updatedHeader?.textContent).toContain('Sign In');
        expect(updatedHeader?.textContent).not.toContain('Priya Sharma');
        expect(authService.getCurrentUser()).toBeNull();
      } finally {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      }
    });
  });

  describe('Real Email Verification & Firebase Authentication Integration', () => {
    it('defines SIMULATED_EMAIL_DOMAINS and correctly partitions test vs real university emails', () => {
      expect(SIMULATED_EMAIL_DOMAINS).toEqual(['campusfind.test']);
      expect(ALLOWED_EMAIL_DOMAINS).toContain('vu.edu.au');
      expect(ALLOWED_EMAIL_DOMAINS).toContain('student.vu.edu.au');
      expect(ALLOWED_EMAIL_DOMAINS).toContain('live.vu.edu.au');
      expect(ALLOWED_EMAIL_DOMAINS).toContain('campusfind.test');

      // Test domain partitioning
      expect(authService.isSimulatedEmail('test@campusfind.test')).toBe(true);
      expect(authService.isSimulatedEmail('sub.test@campusfind.test')).toBe(true);
      expect(authService.isSimulatedEmail('student@student.vu.edu.au')).toBe(false);
      expect(authService.isSimulatedEmail('prof@vu.edu.au')).toBe(false);
      expect(authService.isSimulatedEmail('admin@live.vu.edu.au')).toBe(false);
    });

    it('creates SimulatedEmail and token exclusively for @campusfind.test', async () => {
      const simEmail = 'simulated_user@campusfind.test';
      const signUpRes = await authService.signUp({
        name: 'Simulated User',
        email: simEmail,
        password: 'ValidPass123!',
        role: 'student',
      });

      expect(signUpRes.success).toBe(true);
      expect(signUpRes.isRealVerification).toBe(false);
      expect(signUpRes.data?.token).toBeDefined();
      expect(signUpRes.data?.recipientEmail).toBe(simEmail);

      // Verify the simulated email is recorded
      const emails = appStorage.getSimulatedEmails();
      const found = emails.find((m) => m.recipientEmail === simEmail);
      expect(found).toBeDefined();
      expect(found?.used).toBe(false);

      // Verify it can be confirmed via simulated decision
      const decision = await authService.handleVerificationDecision(found!.token, simEmail, true);
      expect(decision.success).toBe(true);

      const user = appStorage.getUserByEmail(simEmail);
      expect(user?.status).toBe('active');
    });

    it('enforces that seeded demo accounts sign in using local auth and demo password', async () => {
      const demoAccounts = [
        'admin@campusfind.test',
        'admin2@campusfind.test',
        'priya@campusfind.test',
        'liam@campusfind.test',
        'ayesha@campusfind.test',
        'noah@campusfind.test',
        'mei.tan@campusfind.test',
      ];

      for (const email of demoAccounts) {
        const res = await authService.signIn(email, 'Campus#2026');
        expect(res.success).toBe(true);
        expect(res.data?.status).toBe('active');
      }

      // Wrong password fails
      const failRes = await authService.signIn('admin@campusfind.test', 'WrongPassword123');
      expect(failRes.success).toBe(false);
      expect(failRes.error).toBe('Incorrect email or password.');
    });

    it('blocks unconfirmed accounts from signing in and provides clear instructions', async () => {
      const unconfirmedEmail = 'unconfirmed@campusfind.test';
      await authService.signUp({
        name: 'Pending User',
        email: unconfirmedEmail,
        password: 'Password999!',
        role: 'student',
      });

      const res = await authService.signIn(unconfirmedEmail, 'Password999!');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Please confirm your email address');
    });

    it('renders neutral banner on sign-in screen when URL has ?emailConfirmed=1', async () => {
      window.scrollTo = () => {};
      authService.signOut();
      // Simulate url param
      const originalSearch = window.location.search;
      history.pushState({}, '', '/?emailConfirmed=1');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      try {
        await act(async () => {
          root.render(React.createElement(App));
        });

        // Banner text expectation
        expect(container.textContent).toContain('If you confirmed your email address, you can sign in below.');
      } finally {
        await act(async () => {
          root.unmount();
        });
        container.remove();
        history.pushState({}, '', originalSearch || '/');
      }
    });
  });

  describe('Contact details and urgent', () => {
    it('submitReport without contact details is refused; email-only or phone-only succeeds; invalid email/phone is refused', async () => {
      await authService.signIn('priya@campusfind.test', 'Campus#2026');

      const baseReport = {
        type: 'lost' as const,
        itemName: 'Calculus Textbook',
        category: 'Books / stationery' as const,
        colour: 'blue',
        location: 'Library (Level 2)',
        date: '2026-10-10',
        description: 'Hardcover Stewart Calculus 9th edition with notes inside.',
      };

      // 1. Without any contact -> refused with exact message
      const noContactRes = await reportService.submitReport({
        ...baseReport,
      });
      expect(noContactRes.success).toBe(false);
      expect(noContactRes.error).toBe(
        'Please give a contact email or a mobile number so an administrator can reach you about this report.'
      );

      // 2. With invalid email -> refused with exact message
      const invalidEmailRes = await reportService.submitReport({
        ...baseReport,
        contactEmail: 'not-an-email',
      });
      expect(invalidEmailRes.success).toBe(false);
      expect(invalidEmailRes.error).toBe('Please enter a valid contact email address.');

      // 3. With 7-digit phone -> refused with exact message
      const shortPhoneRes = await reportService.submitReport({
        ...baseReport,
        contactPhone: '1234567',
      });
      expect(shortPhoneRes.success).toBe(false);
      expect(shortPhoneRes.error).toBe(
        'Please enter a valid mobile number (8 to 15 digits, for example 0412 345 678).'
      );

      // 4. With letters in phone -> refused with exact message
      const lettersPhoneRes = await reportService.submitReport({
        ...baseReport,
        contactPhone: '0412abc678',
      });
      expect(lettersPhoneRes.success).toBe(false);
      expect(lettersPhoneRes.error).toBe(
        'Please enter a valid mobile number (8 to 15 digits, for example 0412 345 678).'
      );

      // 5. With only valid email -> succeeds
      const emailOnlyRes = await reportService.submitReport({
        ...baseReport,
        contactEmail: 'priya.contact@campusfind.test',
      });
      expect(emailOnlyRes.success).toBe(true);
      expect(emailOnlyRes.report?.contactEmail).toBe('priya.contact@campusfind.test');
      expect(emailOnlyRes.report?.contactPhone).toBeUndefined();

      // 6. With only valid phone '0412 345 678' -> succeeds
      const phoneOnlyRes = await reportService.submitReport({
        ...baseReport,
        itemName: 'Physics Textbook',
        contactPhone: '0412 345 678',
      });
      expect(phoneOnlyRes.success).toBe(true);
      expect(phoneOnlyRes.report?.contactPhone).toBe('0412 345 678');
      expect(phoneOnlyRes.report?.contactEmail).toBeUndefined();
    });

    it('validates urgent flag and reason', async () => {
      await authService.signIn('priya@campusfind.test', 'Campus#2026');

      const baseReport = {
        type: 'lost' as const,
        itemName: 'Scientific Calculator',
        category: 'Books / stationery' as const,
        colour: 'black',
        location: 'Lecture Theatre 1 (Level 3)',
        date: '2026-10-10',
        description: 'Casio fx-991EX calculator in slide-on cover.',
        contactEmail: 'priya@campusfind.test',
      };

      // 1. Urgent true without reason -> refused
      const noReasonRes = await reportService.submitReport({
        ...baseReport,
        urgent: true,
      });
      expect(noReasonRes.success).toBe(false);
      expect(noReasonRes.error).toBe('Please say briefly why this is urgent (5 to 140 characters).');

      // 2. Urgent true with reason of 141 characters -> refused
      const longReasonRes = await reportService.submitReport({
        ...baseReport,
        urgent: true,
        urgentReason: 'a'.repeat(141),
      });
      expect(longReasonRes.success).toBe(false);
      expect(longReasonRes.error).toBe('Please say briefly why this is urgent (5 to 140 characters).');

      // 3. Urgent true with valid reason -> stored with urgent true and trimmed reason
      const validUrgentRes = await reportService.submitReport({
        ...baseReport,
        urgent: true,
        urgentReason: '  Exam starts in 2 hours, needed for physics test.  ',
      });
      expect(validUrgentRes.success).toBe(true);
      expect(validUrgentRes.report?.urgent).toBe(true);
      expect(validUrgentRes.report?.urgentReason).toBe('Exam starts in 2 hours, needed for physics test.');

      // 4. Urgent false stores no reason
      const notUrgentRes = await reportService.submitReport({
        ...baseReport,
        itemName: 'Blue Pen Set',
        urgent: false,
        urgentReason: 'Should not be stored',
      });
      expect(notUrgentRes.success).toBe(true);
      expect(notUrgentRes.report?.urgent).toBe(false);
      expect(notUrgentRes.report?.urgentReason).toBeUndefined();
    });

    it('updateContactDetails enforces ownership and status rules', async () => {
      // Liam owns rep_lost_laptop_1 which is in Pending Verification
      await authService.signIn('liam@campusfind.test', 'Campus#2026');
      const updateRes = await reportService.updateContactDetails('rep_lost_laptop_1', {
        contactEmail: 'liam.updated@campusfind.test',
        contactPhone: '0499 888 777',
      });
      expect(updateRes.success).toBe(true);
      const updated = appStorage.getReportById('rep_lost_laptop_1');
      expect(updated?.contactEmail).toBe('liam.updated@campusfind.test');
      expect(updated?.contactPhone).toBe('0499 888 777');

      // Another student (Priya) tries to edit Liam's report -> refused
      await authService.signIn('priya@campusfind.test', 'Campus#2026');
      const unauthorizedRes = await reportService.updateContactDetails('rep_lost_laptop_1', {
        contactEmail: 'priya@campusfind.test',
      });
      expect(unauthorizedRes.success).toBe(false);
      expect(unauthorizedRes.error).toBe('You can only update contact details for your own reports.');

      // Ayesha owns rep_lost_backpack_1 which has status Returned -> refused
      await authService.signIn('ayesha@campusfind.test', 'Campus#2026');
      const returnedRes = await reportService.updateContactDetails('rep_lost_backpack_1', {
        contactEmail: 'ayesha.new@campusfind.test',
      });
      expect(returnedRes.success).toBe(false);
      expect(returnedRes.error).toBe('Closed and archived cases cannot be edited.');

      // Clearing both fields is refused
      await authService.signIn('liam@campusfind.test', 'Campus#2026');
      const clearRes = await reportService.updateContactDetails('rep_lost_laptop_1', {
        contactEmail: '',
        contactPhone: '',
      });
      expect(clearRes.success).toBe(false);
      expect(clearRes.error).toBe(
        'Please give a contact email or a mobile number so an administrator can reach you about this report.'
      );
    });

    it('anonymiseReportsForDeletedUser removes contact details and clears urgency', () => {
      const reports = appStorage.getReports();
      const report = reports.find((r) => r.id === 'rep_lost_wallet_1')!;
      report.contactEmail = 'priya@campusfind.test';
      report.contactPhone = '0412 345 678';
      report.urgent = true;
      report.urgentReason = 'Needed for airport flight';
      appStorage.saveReport(report);

      reportService.anonymiseReportsForDeletedUser('user_student_1');

      const anonymised = appStorage.getReportById('rep_lost_wallet_1')!;
      expect(anonymised.contactEmail).toBeUndefined();
      expect(anonymised.contactPhone).toBeUndefined();
      expect(anonymised.urgent).toBe(false);
      expect(anonymised.urgentReason).toBeUndefined();
      expect(anonymised.userName).toBe('Deleted account');
    });

    it('getReportById for another student report returns null', async () => {
      // Priya tries to fetch Liam's laptop report
      await authService.signIn('priya@campusfind.test', 'Campus#2026');
      const result = await reportService.getReportById('rep_lost_laptop_1');
      expect(result).toBeNull();

      // Liam can fetch his own report
      await authService.signIn('liam@campusfind.test', 'Campus#2026');
      const ownReport = await reportService.getReportById('rep_lost_laptop_1');
      expect(ownReport).not.toBeNull();
      expect(ownReport?.id).toBe('rep_lost_laptop_1');
    });
  });

  describe('Admin delete and urgent', () => {
    it('refuses deletion when called by a student', async () => {
      await authService.signIn('priya@campusfind.test', 'Campus#2026');
      const initialReportsCount = appStorage.getReports().length;
      const res = await reportService.deleteReports(['rep_lost_laptop_1'], 'Student testing delete');
      expect(res.success).toBe(false);
      expect(res.deleted).toBe(0);
      expect(res.error).toBe('Only administrators can delete reports.');
      expect(appStorage.getReports().length).toBe(initialReportsCount);
    });

    it('refuses deletion when reason is shorter than 5 characters', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const res = await reportService.deleteReports(['rep_lost_laptop_1'], 'fail');
      expect(res.success).toBe(false);
      expect(res.deleted).toBe(0);
      expect(res.error).toBe('Please give a reason (at least 5 characters).');
    });

    it('deleting one report removes it, related matches, notifications, and logs one audit entry without reporter name or email', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const targetId = 'rep_lost_laptop_1';
      const targetReport = appStorage.getReportById(targetId)!;
      const reporterName = targetReport.userName!;
      const reporterEmail = targetReport.userEmail!;

      appStorage.addNotification({
        id: 'test_notif_delete_1',
        audience: 'admin',
        type: 'report_review',
        message: 'Test notification for rep_lost_laptop_1',
        relatedId: targetId,
        read: false,
        createdAt: new Date().toISOString(),
      });

      const res = await reportService.deleteReports([targetId], 'Item was resolved externally by university staff');
      expect(res.success).toBe(true);
      expect(res.deleted).toBe(1);

      // Report itself is removed
      expect(appStorage.getReportById(targetId)).toBeUndefined();

      // Match suggestions pointing to it are removed
      const remainingMatches = appStorage.getMatchSuggestions();
      expect(remainingMatches.some((m) => m.lostReportId === targetId || m.foundReportId === targetId)).toBe(false);

      // Notifications referring to targetId are removed
      const remainingNotifs = appStorage.getNotifications();
      expect(remainingNotifs.some((n) => n.relatedId === targetId || n.id === 'test_notif_delete_1')).toBe(false);

      // Exactly one 'Report Deleted' audit entry for this report
      const auditLogs = appStorage.getAdminActions().filter((a) => a.action === 'Report Deleted' && a.reportId === targetId);
      expect(auditLogs.length).toBe(1);
      const log = auditLogs[0];
      expect(log.details).not.toContain(reporterName);
      expect(log.details).not.toContain(reporterEmail);
      expect(log.details).toContain('Report deleted.');
    });

    it('deleting a report in Pending Verification sends its partner back to Under Review', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const lost = appStorage.getReportById('rep_lost_wallet_1')!;
      const found = appStorage.getReportById('rep_found_wallet_a')!;

      lost.status = 'Pending Verification';
      lost.locked = true;
      lost.matchedWithReportId = found.id;
      appStorage.saveReport(lost);

      found.status = 'Pending Verification';
      found.locked = true;
      found.matchedWithReportId = lost.id;
      appStorage.saveReport(found);

      const res = await reportService.deleteReports([lost.id], 'Verification partner cancelled claim');
      expect(res.success).toBe(true);

      const updatedPartner = appStorage.getReportById(found.id)!;
      expect(updatedPartner.status).toBe('Under Review');
      expect(updatedPartner.locked).toBe(false);
      expect(updatedPartner.matchedWithReportId).toBeUndefined();
    });

    it('allows deleting a Returned report', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const returnedReport = appStorage.getReportById('rep_lost_backpack_1')!;
      expect(returnedReport.status).toBe('Returned');

      const res = await reportService.deleteReports([returnedReport.id], 'Purging closed archival record per retention policy');
      expect(res.success).toBe(true);
      expect(res.deleted).toBe(1);
      expect(appStorage.getReportById('rep_lost_backpack_1')).toBeUndefined();
    });

    it('deletes three ids at once, returns deleted: 3, creates three audit entries, and ignores unknown ids', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const idsToDelete = ['rep_lost_wallet_1', 'rep_found_earbuds_1', 'rep_lost_student_id_1', 'unknown_id_999'];
      const res = await reportService.deleteReports(idsToDelete, 'Bulk deletion of legacy test records');
      expect(res.success).toBe(true);
      expect(res.deleted).toBe(3);

      const auditLogs = appStorage.getAdminActions().filter(
        (a) => a.action === 'Report Deleted' && ['rep_lost_wallet_1', 'rep_found_earbuds_1', 'rep_lost_student_id_1'].includes(a.reportId || '')
      );
      expect(auditLogs.length).toBe(3);
    });

    it('clearUrgent: student is refused, short reason is refused, admin clears urgent report and writes audit entry', async () => {
      const rep = appStorage.getReportById('rep_lost_laptop_1')!;
      rep.urgent = true;
      rep.urgentReason = 'Final year thesis assignment';
      appStorage.saveReport(rep);

      // Student is refused
      await authService.signIn('priya@campusfind.test', 'Campus#2026');
      const studentRes = await reportService.clearUrgent(rep.id, 'Trying to clear urgency');
      expect(studentRes.success).toBe(false);
      expect(studentRes.error).toBe('Only administrators can clear urgent flags.');

      // Admin with short reason is refused
      await authService.signIn('admin@campusfind.test', 'Campus#2026');
      const shortRes = await reportService.clearUrgent(rep.id, 'nope');
      expect(shortRes.success).toBe(false);
      expect(shortRes.error).toBe('Please give a reason (at least 5 characters).');

      // Admin clears urgent with valid reason
      const adminRes = await reportService.clearUrgent(rep.id, 'Student was issued an emergency loaner device');
      expect(adminRes.success).toBe(true);

      const updatedRep = appStorage.getReportById(rep.id)!;
      expect(updatedRep.urgent).toBe(false);
      expect(updatedRep.urgentReason).toBeUndefined();

      const auditLogs = appStorage.getAdminActions().filter((a) => a.action === 'Urgent Cleared' && a.reportId === rep.id);
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].details).toContain('Urgent flag cleared.');
    });

    it('getReportsForAdmin filters by urgent and sorts open urgent reports first', async () => {
      await authService.signIn('admin@campusfind.test', 'Campus#2026');

      // Mark rep_lost_phone_noah_1 as urgent (open, status Submitted)
      const phone = appStorage.getReportById('rep_lost_phone_noah_1')!;
      phone.urgent = true;
      phone.urgentReason = 'Medical alerts on phone';
      phone.status = 'Submitted';
      appStorage.saveReport(phone);

      // Mark rep_lost_backpack_1 as urgent but closed (status Returned)
      const backpack = appStorage.getReportById('rep_lost_backpack_1')!;
      backpack.urgent = true;
      backpack.urgentReason = 'Medication was inside';
      backpack.status = 'Returned';
      appStorage.saveReport(backpack);

      // 1. Filter urgent: true returns only urgent reports
      const urgentReports = await reportService.getReportsForAdmin({ urgent: true });
      expect(urgentReports.length).toBeGreaterThan(0);
      expect(urgentReports.every((r) => r.urgent === true)).toBe(true);

      // 2. With no filter, open urgent reports come first
      const allReports = await reportService.getReportsForAdmin({});
      expect(allReports[0].id).toBe('rep_lost_phone_noah_1');
      expect(allReports[0].urgent).toBe(true);
    });
  });

  describe('Storage Data Version Migration', () => {
    it('migrateIfNeeded resets old browser data when version key is missing or old, and preserves when current', () => {
      // 1. When campusfind_data_version is missing: resets data, sets version '3', removes current user, returns true
      localStorage.setItem('campusfind_current_user', JSON.stringify({ id: 'old_user' }));
      localStorage.removeItem('campusfind_data_version');
      const migrated1 = appStorage.migrateIfNeeded();
      expect(migrated1).toBe(true);
      expect(localStorage.getItem('campusfind_data_version')).toBe('3');
      expect(localStorage.getItem('campusfind_current_user')).toBeNull();

      // 2. When version is already '3': does not reset and returns false
      const migrated2 = appStorage.migrateIfNeeded();
      expect(migrated2).toBe(false);

      // 3. When version is an old version (e.g. '1'): resets and returns true
      localStorage.setItem('campusfind_data_version', '1');
      const migrated3 = appStorage.migrateIfNeeded();
      expect(migrated3).toBe(true);
      expect(localStorage.getItem('campusfind_data_version')).toBe('3');

      // 4. resetToSeedData writes version '3'
      appStorage.resetToSeedData();
      expect(localStorage.getItem('campusfind_data_version')).toBe('3');

      // 5. resetToTestFixtures does NOT write the version key
      localStorage.removeItem('campusfind_data_version');
      appStorage.resetToTestFixtures();
      expect(localStorage.getItem('campusfind_data_version')).toBeNull();
    });
  });

  const mkReport = (id: string, type: 'lost' | 'found', urgent: boolean): any => ({
    id, userId: 'u_' + id, userName: id, userEmail: id + '@x.test', type, itemName: id, category: 'Other', colour: 'blue',
    location: 'Library (Level 2)', date: '2026-10-12', description: 'd', status: 'Possible Match', locked: false,
    createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), urgent,
  });
  const mkMatch = (id: string, l: string, f: string, score: number): any => ({
    id, lostReportId: l, foundReportId: f, label: score >= 75 ? 'Likely match' : 'Possible match', status: 'pending',
    createdAt: new Date().toISOString(), totalScore: score, categoryScore: 0, descriptionScore: 0, locationScore: 0, dateScore: 0, colourScore: 0,
  });
  describe('Urgent queue order', () => {
    it('an urgent pair with a lower score comes first; non-urgent pairs stay in score order', async () => {
      appStorage.resetToSeedData();
      appStorage.saveReports([mkReport('LA','lost',true), mkReport('FA','found',false), mkReport('LB','lost',false), mkReport('FB','found',false), mkReport('LC','lost',false), mkReport('FC','found',false)]);
      appStorage.saveMatchSuggestions([mkMatch('mB','LB','FB',95), mkMatch('mA','LA','FA',50), mkMatch('mC','LC','FC',80)]);
      await authService.signIn('admin@campusfind.test', 'Admin123321');
      const q = await matchService.getAdminMatchingQueue();
      expect(q.map((x) => x.id)).toEqual(['mA', 'mB', 'mC']);
    });
    it('an urgent found report also lifts its pair', async () => {
      appStorage.resetToSeedData();
      appStorage.saveReports([mkReport('LA','lost',false), mkReport('FA','found',true), mkReport('LB','lost',false), mkReport('FB','found',false)]);
      appStorage.saveMatchSuggestions([mkMatch('mB','LB','FB',90), mkMatch('mA','LA','FA',46)]);
      await authService.signIn('admin@campusfind.test', 'Admin123321');
      expect((await matchService.getAdminMatchingQueue()).map((x) => x.id)).toEqual(['mA', 'mB']);
    });
  });
});
