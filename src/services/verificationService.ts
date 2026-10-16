/**
 * Ownership Verification Service (FR-08, Section 7, UC4, UC5)
 *
 * Enforces:
 * - Category-specific question bank
 * - High-value items require "second unpublished detail checked" checkbox
 * - Passed verification:
 *   - Both reports become 'Returned' and locked (Business Rule 1, 4)
 *   - Other pending matches for this item are dismissed automatically (Business Rule 5)
 *   - Closure logged in admin_actions
 * - Failed verification:
 *   - Reports revert to 'Under Review'
 *   - Claimant's rejectedClaimCount increments by 1
 *   - At >= 3 rejected claims, account is flagged (Section 8.7)
 * - Conflict of interest check (Business Rule 6): Admin cannot process own report.
 */

import {
  ItemReport,
  MatchSuggestion,
} from '../types';
import { appStorage } from './storage';
import { VERIFICATION_QUESTION_BANK, VerificationQuestion } from '../config/verificationQuestions';
import { REJECTED_CLAIM_FLAG_THRESHOLD } from '../config/matchingConfig';
import { auditService } from './auditService';
import { notificationService } from './notificationService';

export interface VerificationSubmission {
  matchSuggestionId: string;
  lostReportId: string;
  foundReportId: string;
  checklistResponses: {
    question: string;
    matched: boolean;
    notes?: string;
  }[];
  secondDetailChecked?: boolean; // For high-value items (Laptop/tablet, Phone)
  adminNotes: string;
  outcome: 'Passed' | 'Failed';
}

export const verificationService = {
  /**
   * Get Category Questions
   */
  getQuestionsForCategory(category: string): VerificationQuestion[] {
    return (VERIFICATION_QUESTION_BANK as any)[category] || VERIFICATION_QUESTION_BANK['Other'];
  },

  /**
   * Check if category is high value
   */
  isHighValueCategory(category: string): boolean {
    return category === 'Laptop / tablet' || category === 'Phone';
  },

  /**
   * Confirm match and advance both reports to Pending Verification (UC3 -> UC4)
   * Enforces Business Rule 6 (Admin conflict of interest)
   */
  async startVerification(
    matchSuggestionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') {
      return { success: false, error: 'Unauthorized.' };
    }

    const matches = appStorage.getMatchSuggestions();
    const match = matches.find((m) => m.id === matchSuggestionId);
    if (!match) return { success: false, error: 'Match suggestion not found.' };

    const lostReport = appStorage.getReportById(match.lostReportId);
    const foundReport = appStorage.getReportById(match.foundReportId);
    if (!lostReport || !foundReport) {
      return { success: false, error: 'Associated reports not found.' };
    }

    // Business Rule 6: Admin cannot process a report they submitted themselves
    if (lostReport.userId === admin.id || foundReport.userId === admin.id) {
      return {
        success: false,
        error: 'Conflict of interest: You cannot verify or process a report that you submitted yourself.',
      };
    }

    // Update statuses to Pending Verification and lock reports from student editing (Business Rule 2)
    lostReport.status = 'Pending Verification';
    lostReport.locked = true;
    lostReport.matchedWithReportId = foundReport.id;
    lostReport.lastActivityAt = new Date().toISOString();

    foundReport.status = 'Pending Verification';
    foundReport.locked = true;
    foundReport.matchedWithReportId = lostReport.id;
    foundReport.lastActivityAt = new Date().toISOString();

    match.status = 'confirmed';

    appStorage.saveReport(lostReport);
    appStorage.saveReport(foundReport);
    appStorage.saveMatchSuggestion(match);

    await auditService.logAction({
      adminId: admin.id,
      adminName: admin.name,
      action: 'Start Verification',
      reportId: lostReport.id,
      details: `Started ownership verification between Lost Report (${lostReport.itemName}) and Found Report (${foundReport.itemName}).`,
      outcome: 'Status changed to Pending Verification',
    });

    return { success: true };
  },

  /**
   * Submit Verification Result (UC4, UC5)
   */
  async submitVerificationResult(
    submission: VerificationSubmission
  ): Promise<{ success: boolean; error?: string }> {
    const admin = appStorage.getCurrentUser();
    if (!admin || admin.role !== 'admin') {
      return { success: false, error: 'Unauthorized.' };
    }

    const lostReport = appStorage.getReportById(submission.lostReportId);
    const foundReport = appStorage.getReportById(submission.foundReportId);
    if (!lostReport || !foundReport) {
      return { success: false, error: 'Reports not found.' };
    }

    // Conflict of interest check (Business Rule 6)
    if (lostReport.userId === admin.id || foundReport.userId === admin.id) {
      return {
        success: false,
        error: 'Conflict of interest: You cannot process a report that you submitted yourself.',
      };
    }

    // High value validation check
    const isHighValue = this.isHighValueCategory(lostReport.category);
    if (isHighValue && submission.outcome === 'Passed' && !submission.secondDetailChecked) {
      return {
        success: false,
        error: 'High-value items (laptop/tablet, phone) require verifying a second unpublished detail before passing.',
      };
    }

    const claimant = appStorage.getUserById(lostReport.userId);

    if (submission.outcome === 'Passed') {
      // 1. Both reports become 'Returned' and read-only locked (Business Rule 1 & 4)
      lostReport.status = 'Returned';
      lostReport.locked = true;
      lostReport.lastActivityAt = new Date().toISOString();
      lostReport.verificationNotes = submission.adminNotes;

      foundReport.status = 'Returned';
      foundReport.locked = true;
      foundReport.lastActivityAt = new Date().toISOString();
      foundReport.verificationNotes = submission.adminNotes;

      appStorage.saveReport(lostReport);
      appStorage.saveReport(foundReport);

      // 2. Business Rule 5: An item already Returned cannot be claimed again; dismiss other pending matches
      const allMatches = appStorage.getMatchSuggestions();
      allMatches.forEach((m) => {
        if (
          m.id !== submission.matchSuggestionId &&
          (m.lostReportId === lostReport.id ||
            m.foundReportId === foundReport.id ||
            m.lostReportId === foundReport.id ||
            m.foundReportId === lostReport.id)
        ) {
          m.status = 'dismissed';
        }
      });
      appStorage.saveMatchSuggestions(allMatches);

      // 3. Log audit action
      await auditService.logAction({
        adminId: admin.id,
        adminName: admin.name,
        action: 'Verification Passed',
        reportId: lostReport.id,
        targetUserId: lostReport.userId,
        details: `Ownership verified and item released. Notes: ${submission.adminNotes}`,
        verificationLog: submission.checklistResponses,
        secondDetailChecked: submission.secondDetailChecked,
        outcome: 'Case Closed - Item Returned',
      });

      return { success: true };
    } else {
      // Verification FAILED
      // 1. Revert reports back to 'Under Review'
      lostReport.status = 'Under Review';
      lostReport.locked = false;
      lostReport.matchedWithReportId = undefined;
      lostReport.lastActivityAt = new Date().toISOString();

      foundReport.status = 'Under Review';
      foundReport.locked = false;
      foundReport.matchedWithReportId = undefined;
      foundReport.lastActivityAt = new Date().toISOString();

      appStorage.saveReport(lostReport);
      appStorage.saveReport(foundReport);

      // 2. Dismiss this specific match suggestion
      const allMatches = appStorage.getMatchSuggestions();
      const currentMatch = allMatches.find((m) => m.id === submission.matchSuggestionId);
      if (currentMatch) {
        currentMatch.status = 'dismissed';
        appStorage.saveMatchSuggestions(allMatches);
      }

      // 3. Increment claimant's rejected claim count (Abuse handling 2.8)
      if (claimant) {
        claimant.rejectedClaimCount = (claimant.rejectedClaimCount || 0) + 1;

        // If >= 3, flag account (Section 8.7)
        if (claimant.rejectedClaimCount >= REJECTED_CLAIM_FLAG_THRESHOLD && !claimant.flagged) {
          claimant.flagged = true;
          claimant.flagReason = `Threshold crossed: ${claimant.rejectedClaimCount} rejected verification claims.`;

          await notificationService.createNotification({
            audience: 'admin',
            type: 'account_flagged',
            message: `Account flagged: ${claimant.name} has accumulated ${claimant.rejectedClaimCount} failed claims.`,
            relatedId: claimant.id,
          });

          await auditService.logAction({
            adminId: 'system',
            adminName: 'System Rule Engine',
            action: 'Account Flagged',
            targetUserId: claimant.id,
            details: `Automated flag: ${claimant.name} crossed the rejected claim threshold (${claimant.rejectedClaimCount}).`,
            outcome: 'Account Flagged for Review',
          });
        }

        appStorage.saveUser(claimant);
      }

      // 4. Log audit action
      await auditService.logAction({
        adminId: admin.id,
        adminName: admin.name,
        action: 'Verification Failed',
        reportId: lostReport.id,
        targetUserId: lostReport.userId,
        details: `Verification failed. Answers did not match physical item. Notes: ${submission.adminNotes}`,
        verificationLog: submission.checklistResponses,
        secondDetailChecked: submission.secondDetailChecked,
        outcome: 'Reverted to Under Review',
      });

      return { success: true };
    }
  },
};
