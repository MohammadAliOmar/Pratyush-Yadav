import React, { useState } from 'react';
import { matchService } from '../../services/matchService';
import { authService } from '../../services/authService';
import { reportService } from '../../services/reportService';
import { verificationService } from '../../services/verificationService';
import { appStorage } from '../../services/storage';
import { firestoreSync } from '../../services/firestoreSync';
import { setForcedLocalMode } from '../../config/runtimeMode';
import { ItemReport, SimulatedEmail, User } from '../../types';
import { Button } from '../../components/common/Button';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Play,
  ShieldCheck,
} from 'lucide-react';

interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export const SystemTestsScreen: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[]>([]);

  const runAllTests = async () => {
    setIsRunning(true);
    const results: TestCaseResult[] = [];

    // Snapshot isolation: Preserve current localStorage state so tests do not alter real data
    const snapshot: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('campusfind_')) {
        snapshot[key] = localStorage.getItem(key);
      }
    }

    // Do not send anything to Firestore during tests, and run them on the browser's own
    // temporary test data instead of the shared live data
    firestoreSync.setSyncPaused(true);
    setForcedLocalMode(true);

    try {
      // Reset to test fixture data for isolated test execution
      appStorage.resetToTestFixtures();

      // -------------------------------------------------------------
      // TEST 1: Benchmark Worked Example Ranking (Section 6)
      // Passed with fixed similarities 0.90 and 0.65 as specified
      // -------------------------------------------------------------
      const lostWallet: ItemReport = {
        id: 'rep_lost_wallet_test',
        userId: 'test_u1',
        type: 'lost',
        itemName: 'Black Leather Wallet',
        category: 'Wallet',
        colour: 'black',
        location: 'Library (Level 2)',
        date: '2026-10-05',
        description: 'Black leather wallet with Monash student card and Melbourne Myki card inside.',
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
        description: 'Black leather wallet found near study desk row B.',
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
        description: 'Brown leather wallet with student ID found on study desk.',
        status: 'Submitted',
        flaggedDuplicate: false,
        locked: false,
        createdAt: '2026-10-06T10:15:00Z',
        lastActivityAt: '2026-10-06T10:15:00Z',
      };

      const scoreA = matchService.scoreReports(lostWallet, foundWalletA, 0.90);
      const scoreB = matchService.scoreReports(lostWallet, foundWalletB, 0.65);

      const test1Passed =
        scoreA.totalScore === 97.0 &&
        scoreB.totalScore === 85.0 &&
        scoreA.totalScore > scoreB.totalScore;

      results.push({
        id: 't1',
        name: 'Worked Example Benchmark (Found A = 97.0 vs Found B = 85.0)',
        category: 'Section 6 Matching Engine',
        passed: test1Passed,
        expected: 'Found A = 97.0, Found B = 85.0 (Found A ranks first)',
        actual: `Found A = ${scoreA.totalScore.toFixed(1)}, Found B = ${scoreB.totalScore.toFixed(1)}`,
        details: `Breakdown A: Cat=${scoreA.categoryScore}, Desc=${scoreA.descriptionScore}, Loc=${scoreA.locationScore}, Date=${scoreA.dateScore}, Col=${scoreA.colourScore}. Breakdown B: Cat=${scoreB.categoryScore}, Desc=${scoreB.descriptionScore}, Loc=${scoreB.locationScore}, Date=${scoreB.dateScore}, Col=${scoreB.colourScore}.`,
      });

      // -------------------------------------------------------------
      // TEST 2: Thresholds and Classification
      // -------------------------------------------------------------
      const classHigh = matchService.classifyMatch(75.0);
      const classMid = matchService.classifyMatch(52.0);
      const classLow = matchService.classifyMatch(44.9);
      const test2Passed =
        classHigh === 'Likely match' &&
        classMid === 'Possible match' &&
        classLow === null;

      results.push({
        id: 't2',
        name: 'Confidence Classification Thresholds (>=75, 45-74, <45)',
        category: 'Section 6 Matching Engine',
        passed: test2Passed,
        expected: '>=75: Likely match; 45-74: Possible match; <45: Not surfaced (null)',
        actual: `75.0 -> ${classHigh}; 52.0 -> ${classMid}; 44.9 -> ${classLow ?? 'null'}`,
      });

      // -------------------------------------------------------------
      // TEST 3: Business Rule 1 - Cannot set 'Returned' manually without verification
      // -------------------------------------------------------------
      const adminUser = appStorage.getUserById('user_admin_1');
      appStorage.setCurrentUser(adminUser || null);

      const br1Result = await reportService.updateReportStatus(
        'rep_found_earbuds_1',
        'Returned' as any
      );
      const test3Passed = br1Result.success === false && !!br1Result.error;

      results.push({
        id: 't3',
        name: 'Business Rule 1: No manual Returned status without verification',
        category: 'Section 6 Business Rules',
        passed: test3Passed,
        expected: 'Status update to "Returned" blocked by service layer',
        actual: br1Result.success
          ? 'Allowed (FAIL)'
          : `Blocked with error: "${br1Result.error}"`,
      });

      // -------------------------------------------------------------
      // TEST 4: Business Rule 2 - Editing Lock once verification starts
      // -------------------------------------------------------------
      const br2Result = await reportService.updateReport('rep_lost_laptop_1', {
        itemName: 'Hacked Name Attempt',
      });
      const test4Passed = br2Result.success === false && !!br2Result.error;

      results.push({
        id: 't4',
        name: 'Business Rule 2: Report editing locked once verification begins',
        category: 'Section 6 Business Rules',
        passed: test4Passed,
        expected: 'Update rejected for report undergoing verification',
        actual: br2Result.success
          ? 'Allowed (FAIL)'
          : `Blocked with message: "${br2Result.error}"`,
      });

      // -------------------------------------------------------------
      // TEST 5: Business Rule 3 - Duplicate submission within 3 days flagged
      // -------------------------------------------------------------
      const allReps = appStorage.getReports();
      const duplicateRep = allReps.find((r) => r.id === 'rep_lost_phone_noah_2');
      const test5Passed = duplicateRep?.flaggedDuplicate === true;

      results.push({
        id: 't5',
        name: 'Business Rule 3: 3-day duplicate report flagged for administrator',
        category: 'Section 6 Business Rules',
        passed: test5Passed,
        expected: 'flaggedDuplicate === true',
        actual: `flaggedDuplicate === ${duplicateRep?.flaggedDuplicate}`,
      });

      // -------------------------------------------------------------
      // TEST 6: Business Rule 4 - Closed cases (Returned or Archived) are read-only
      // -------------------------------------------------------------
      const br4Result = await reportService.updateReport('rep_lost_backpack_1', {
        itemName: 'Modified Closed Item',
      });
      const test6Passed = br4Result.success === false && !!br4Result.error;

      results.push({
        id: 't6',
        name: 'Business Rule 4: Closed / Archived cases are read-only',
        category: 'Section 6 Business Rules',
        passed: test6Passed,
        expected: 'Modifying Returned or Archived report is blocked',
        actual: br4Result.success
          ? 'Allowed (FAIL)'
          : `Blocked with: "${br4Result.error}"`,
      });

      // -------------------------------------------------------------
      // TEST 7: Business Rule 5 - Returned item dismisses all other pending matches
      // -------------------------------------------------------------
      // rep_lost_wallet_1 has two match suggestions: match_wallet_1a and match_wallet_1b
      appStorage.setCurrentUser(adminUser || null);
      const resBr5 = await verificationService.submitVerificationResult({
        matchSuggestionId: 'match_wallet_1a',
        lostReportId: 'rep_lost_wallet_1',
        foundReportId: 'rep_found_wallet_a',
        checklistResponses: [{ question: 'Q1', matched: true }],
        adminNotes: 'Verified during automated test',
        outcome: 'Passed',
      });

      const updatedMatches = appStorage.getMatchSuggestions();
      const otherMatch = updatedMatches.find((m) => m.id === 'match_wallet_1b');
      const testBr5Passed = resBr5.success === true && otherMatch?.status === 'dismissed';

      results.push({
        id: 't7_br5',
        name: 'Business Rule 5: Item return dismisses other pending matches',
        category: 'Section 6 Business Rules',
        passed: testBr5Passed,
        expected: 'Competing candidate match_wallet_1b status === "dismissed"',
        actual: `match_wallet_1b status: ${otherMatch?.status}`,
      });

      // -------------------------------------------------------------
      // TEST 8: Business Rule 6 - Admin conflict of interest check
      // -------------------------------------------------------------
      // Admin Sam Rivera cannot verify a report submitted by Sam Rivera
      const conflictLostReport = appStorage.getReportById('rep_lost_wallet_1');
      if (conflictLostReport) {
        conflictLostReport.userId = 'user_admin_1'; // Set admin as report creator
        conflictLostReport.status = 'Submitted';
        appStorage.saveReport(conflictLostReport);
      }
      appStorage.setCurrentUser(adminUser || null);

      const conflictResult = await verificationService.startVerification('match_wallet_1a');
      const testBr6Passed =
        conflictResult.success === false &&
        typeof conflictResult.error === 'string' &&
        conflictResult.error.toLowerCase().includes('conflict of interest');

      results.push({
        id: 't8_br6',
        name: 'Business Rule 6: Admin conflict of interest check',
        category: 'Section 6 Business Rules',
        passed: testBr6Passed,
        expected: 'startVerification fails with conflict of interest error',
        actual: conflictResult.success
          ? 'Allowed (FAIL)'
          : `Blocked with: "${conflictResult.error}"`,
      });

      // -------------------------------------------------------------
      // TEST 9: Business Rule 7 - 90-day inactivity archiving
      // -------------------------------------------------------------
      const testReportOld: ItemReport = {
        id: 'rep_test_old_91d',
        userId: 'test_u1',
        type: 'lost',
        itemName: 'Old Calculator',
        category: 'Other',
        colour: 'black',
        location: 'Library (Level 2)',
        date: '2026-06-01',
        description: 'Test calculator 91 days old',
        status: 'Submitted',
        flaggedDuplicate: false,
        locked: false,
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const testReportRecent: ItemReport = {
        id: 'rep_test_recent_89d',
        userId: 'test_u1',
        type: 'lost',
        itemName: 'Recent Calculator',
        category: 'Other',
        colour: 'black',
        location: 'Library (Level 2)',
        date: '2026-07-01',
        description: 'Test calculator 89 days old',
        status: 'Submitted',
        flaggedDuplicate: false,
        locked: false,
        createdAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(),
      };

      appStorage.saveReport(testReportOld);
      appStorage.saveReport(testReportRecent);

      appStorage.runInactivityArchiving();

      const checkedOld = appStorage.getReportById('rep_test_old_91d');
      const checkedRecent = appStorage.getReportById('rep_test_recent_89d');

      const testBr7Passed =
        checkedOld?.status === 'Archived' &&
        checkedOld?.locked === true &&
        checkedRecent?.status === 'Submitted' &&
        checkedRecent?.locked === false;

      results.push({
        id: 't9_br7',
        name: 'Business Rule 7: 90-day inactivity auto-archiving',
        category: 'Section 6 Business Rules',
        passed: testBr7Passed,
        expected: '91d old becomes Archived & locked; 89d old remains active',
        actual: `91d: status=${checkedOld?.status}, locked=${checkedOld?.locked}; 89d: status=${checkedRecent?.status}, locked=${checkedRecent?.locked}`,
      });

      // -------------------------------------------------------------
      // TEST 10: University Email Domain Validation
      // -------------------------------------------------------------
      const validUni = authService.isValidUniversityEmail('student@student.vu.edu.au');
      const validLive = authService.isValidUniversityEmail('staff@live.vu.edu.au');
      const validTest = authService.isValidUniversityEmail('demo@campusfind.test');
      const invalidGmail = authService.isValidUniversityEmail('student@gmail.com');
      const test10Passed = validUni && validLive && validTest && !invalidGmail;

      results.push({
        id: 't10',
        name: 'University Email Domain Validation',
        category: 'Section 8 Abuse & Misuse Handling',
        passed: test10Passed,
        expected: 'VU domains and campusfind.test valid; public domains rejected',
        actual: `student.vu.edu.au: ${validUni}, live.vu.edu.au: ${validLive}, gmail.com: ${invalidGmail}`,
      });

      // -------------------------------------------------------------
      // TEST 11: Sign-up Rate Limiting (5 tries lockout)
      // -------------------------------------------------------------
      const testEmail = 'abuse_test@student.vu.edu.au';
      authService.clearAttempts(testEmail);
      for (let i = 0; i < 5; i++) {
        authService.recordAttempt(testEmail);
      }
      const rateCheck = authService.checkRateLimit(testEmail);
      const test11Passed = rateCheck.locked === true;
      authService.clearAttempts(testEmail);

      results.push({
        id: 't11',
        name: 'Sign-up Abuse Rate Limit (5 attempts locks for 24h)',
        category: 'Section 8 Abuse & Misuse Handling',
        passed: test11Passed,
        expected: 'locked === true after 5 attempts',
        actual: `locked === ${rateCheck.locked}`,
      });

      // -------------------------------------------------------------
      // TEST 12: 24-Hour Link Expiry
      // -------------------------------------------------------------
      const expiredEmail: SimulatedEmail = {
        id: 'mail_expired_test',
        recipientEmail: 'expired@student.vu.edu.au',
        subject: 'Verify',
        token: 'token_expired_25h',
        verifyUrl: '/?action=verify',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        used: false,
      };
      appStorage.addSimulatedEmail(expiredEmail);

      const decisionExpired = await authService.handleVerificationDecision(
        'token_expired_25h',
        'expired@student.vu.edu.au',
        true
      );

      const test12Passed =
        decisionExpired.success === false &&
        decisionExpired.message.includes('expired');

      results.push({
        id: 't12',
        name: 'Verification links expire after 24 hours',
        category: 'Section 8 Abuse & Misuse Handling',
        passed: test12Passed,
        expected: '25-hour old link rejected with "This confirmation link has expired. Please register again."',
        actual: `success=${decisionExpired.success}, message="${decisionExpired.message}"`,
      });

      // -------------------------------------------------------------
      // TEST 13: Demo-Password Backdoor Removal
      // -------------------------------------------------------------
      // Register custom student with password 'Mypass#123'
      const customEmail = 'custom_student@campusfind.test';
      const signUpRes = await authService.signUp({
        name: 'Custom Student',
        email: customEmail,
        password: 'Mypass#123',
        confirmPassword: 'Mypass#123',
        role: 'student',
      });

      if (signUpRes.success && signUpRes.data) {
        // Confirm account
        await authService.handleVerificationDecision(signUpRes.data.token, customEmail, true);
      }

      // Try signing in with Campus#2026 (must FAIL)
      const tryDemoPw = await authService.signIn(customEmail, 'Campus#2026');
      // Try signing in with real password (must SUCCEED)
      const tryRealPw = await authService.signIn(customEmail, 'Mypass#123');

      const test13Passed = tryDemoPw.success === false && tryRealPw.success === true;

      results.push({
        id: 't13',
        name: 'Demo password backdoor removed from self-registered accounts',
        category: 'Security & Access Control',
        passed: test13Passed,
        expected: 'Campus#2026 fails on self-registered account; custom password succeeds',
        actual: `Campus#2026 success=${tryDemoPw.success}; Mypass#123 success=${tryRealPw.success}`,
      });
    } finally {
      // Snapshot restoration: Restore exact localStorage state prior to test run
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('campusfind_') && !(key in snapshot)) {
          localStorage.removeItem(key);
        }
      }
      for (const [k, v] of Object.entries(snapshot)) {
        if (v !== null) localStorage.setItem(k, v);
        else localStorage.removeItem(k);
      }
      setForcedLocalMode(false);
      firestoreSync.setSyncPaused(false);
      appStorage.notifyDataChanged();
    }

    setTestResults(results);
    setIsRunning(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Algorithm &amp; Business Rules Test Suite
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              Isolated Test Runner
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Validates matching formulas, worked example ranking (Found A vs B), business rules 1–7, and abuse protections without mutating real data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            isLoading={isRunning}
            onClick={runAllTests}
            leftIcon={<Play className="w-4 h-4 mr-1.5" />}
          >
            Run All Verification Tests
          </Button>
        </div>
      </div>

      {/* Description of Worked Example */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 text-xs text-blue-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm text-blue-900">
          <ShieldCheck className="w-5 h-5 text-blue-700" />
          <span>NIT3003 Assessment 2 Specification Benchmark:</span>
        </div>
        <p className="leading-relaxed">
          Lost black leather wallet at the Library on Monday vs Found A (black leather wallet, Library, Monday) scores <strong>97.0%</strong> (Likely match) and Found B (brown leather wallet with student ID, Library, Tuesday) scores <strong>85.0%</strong> (Likely match). Both surface in queue; Found A ranks 1st.
        </p>
      </div>

      {/* Test Results Display */}
      {testResults.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FlaskConical className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Ready to Execute Test Suite</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click "Run All Verification Tests" above to verify the worked example, matching decay curve, color adjacency, and all seven business rules.
          </p>
          <div className="pt-2">
            <Button variant="primary" size="sm" onClick={runAllTests}>
              Execute Suite Now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>
              Results:{' '}
              <strong className="text-emerald-700">
                {testResults.filter((r) => r.passed).length} Passed
              </strong>{' '}
              / {testResults.length} Total
            </span>
          </div>

          <div className="space-y-3">
            {testResults.map((t) => (
              <div
                key={t.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  t.passed
                    ? 'bg-white border-emerald-200 shadow-xs'
                    : 'bg-rose-50/50 border-rose-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      )}
                      <h3 className="font-bold text-sm text-slate-900">{t.name}</h3>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {t.category}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 pl-7">
                      <p>
                        <strong>Expected:</strong> {t.expected}
                      </p>
                      <p>
                        <strong>Actual:</strong>{' '}
                        <span className={t.passed ? 'text-emerald-800 font-semibold' : 'text-rose-700 font-semibold'}>
                          {t.actual}
                        </span>
                      </p>
                      {t.details && (
                        <p className="text-slate-500 text-[11px] pt-0.5">{t.details}</p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      t.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {t.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
