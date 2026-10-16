/**
 * Item Report Service (FR-02, FR-03, FR-04, FR-05, FR-09)
 *
 * Enforces:
 * - Student/Staff can only access their OWN reports
 * - Admins can search, filter, and view all reports
 * - Required photo alt text
 * - Business Rule 2: Editing lock once verification starts
 * - Business Rule 3: 3-day duplicate report detection
 * - Business Rule 4: Closed cases are read-only
 */

import {
  ItemReport,
  ItemCategory,
  ReportType,
  ReportStatus,
} from '../types';
import { appStorage } from './storage';
import { extractDescriptionTokens } from './similarityEngine';
import { matchService } from './matchService';
import { isSharedMode } from '../config/runtimeMode';
import { notificationService } from './notificationService';
import { auditService } from './auditService';
import { firestoreSync } from './firestoreSync';
import { DUPLICATE_WINDOW_DAYS } from '../config/matchingConfig';
import {
  normaliseContactEmail,
  normaliseContactPhone,
  validateContact,
  validateUrgent,
} from './contactValidation';

export interface CreateReportDTO {
  type: ReportType;
  itemName: string;
  category: ItemCategory;
  colour: string;
  location: string;
  date: string; // YYYY-MM-DD
  description: string;
  whereItemIs?: string;
  imageUrl?: string;
  imageAltText?: string;
  contactEmail?: string;
  contactPhone?: string;
  urgent?: boolean;
  urgentReason?: string;
}

export interface ReportFilterOptions {
  category?: string;
  status?: string;
  location?: string;
  type?: ReportType;
  search?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  urgent?: boolean;
}

export const reportService = {
  /**
   * Submit a new Lost or Found Report (FR-02, FR-03, UC1)
   */
  async submitReport(data: CreateReportDTO): Promise<{ success: boolean; report?: ItemReport; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to submit a report.' };
    }

    // Required field validation
    if (!data.itemName?.trim() || !data.category || !data.colour?.trim() || !data.location?.trim() || !data.date || !data.description?.trim()) {
      return { success: false, error: 'Please complete all required fields.' };
    }

    // NFR-06 & Section 4: If a photo is added, a short description (alt text) is REQUIRED
    if (data.imageUrl && !data.imageAltText?.trim()) {
      return { success: false, error: 'Please provide a short description (alt text) for the uploaded photo.' };
    }

    // Found item handover validation
    if (data.type === 'found' && !data.whereItemIs?.trim()) {
      return { success: false, error: 'Please specify where the item is now (e.g., handed to Level 1 Security Desk).' };
    }

    // Contact & urgency validation
    const contactError = validateContact(data.contactEmail, data.contactPhone);
    if (contactError) {
      return { success: false, error: contactError };
    }

    const urgentError = validateUrgent(data.urgent, data.urgentReason);
    if (urgentError) {
      return { success: false, error: urgentError };
    }

    const allReports = appStorage.getReports();

    // Business Rule 3: Duplicate detection within 3 days for same user
    const submissionDate = new Date(data.date).getTime();
    const isDuplicate = allReports.some((r) => {
      if (r.userId !== user.id) return false;
      if (r.category !== data.category) return false;
      const reportDate = new Date(r.date).getTime();
      const dayDiff = Math.abs(submissionDate - reportDate) / (1000 * 60 * 60 * 24);
      return dayDiff <= DUPLICATE_WINDOW_DAYS && r.itemName.toLowerCase() === data.itemName.toLowerCase();
    });

    const normContactEmail = normaliseContactEmail(data.contactEmail);
    const normContactPhone = normaliseContactPhone(data.contactPhone);
    const isUrgent = data.urgent === true;
    const trimmedUrgentReason = isUrgent && data.urgentReason ? data.urgentReason.trim() : undefined;

    const newReport: ItemReport = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      type: data.type,
      itemName: data.itemName.trim(),
      category: data.category,
      colour: data.colour.trim().toLowerCase(),
      location: data.location.trim(),
      date: data.date,
      description: data.description.trim(),
      whereItemIs: data.whereItemIs?.trim(),
      status: 'Submitted',
      flaggedDuplicate: isDuplicate,
      locked: false,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      imageUrl: data.imageUrl,
      imageAltText: data.imageAltText?.trim(),
      descriptionTokens: extractDescriptionTokens(data.description),
      contactEmail: normContactEmail || undefined,
      contactPhone: normContactPhone || undefined,
      urgent: isUrgent,
      urgentReason: trimmedUrgentReason,
    };

    appStorage.saveReport(newReport);

    // If duplicate detected, flag and notify admin (Business Rule 3)
    if (isDuplicate) {
      await notificationService.createNotification({
        audience: 'admin',
        type: 'abuse_alert',
        message: `Duplicate submission suspected: ${user.name} reported "${data.itemName}" multiple times within 3 days.`,
        relatedId: newReport.id,
      });

      await auditService.logAction({
        adminId: 'system',
        adminName: 'Rule Engine',
        action: 'Account Flagged',
        reportId: newReport.id,
        targetUserId: user.id,
        details: `Report ${newReport.id} flagged as duplicate: matches prior submission within 3 days.`,
        outcome: 'Flagged Duplicate',
      });
    }

    // Run matching engine against active opposite candidates (FR-06).
    // Shared mode: a reporter cannot see other people's reports, so the administrator's
    // browser runs the matching (see cloudSync.runPendingMatching).
    if (!isSharedMode()) {
      await matchService.runMatchingForNewReport(newReport);
    }

    return { success: true, report: newReport };
  },

  /**
   * Get Current User's Own Reports (FR-04)
   * Students and staff see ONLY their own reports
   */
  async getMyReports(): Promise<ItemReport[]> {
    const user = appStorage.getCurrentUser();
    if (!user) return [];

    const all = appStorage.getReports();
    return all
      .filter((r) => r.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Get single report by ID with strict privacy check
   * Students/staff can only view their own; admins can view any.
   */
  async getReportById(id: string): Promise<ItemReport | null> {
    const user = appStorage.getCurrentUser();
    if (!user) return null;

    const report = appStorage.getReportById(id);
    if (!report) return null;

    if (user.role !== 'admin' && report.userId !== user.id) {
      // Privacy boundary: student cannot view another person's report
      return null;
    }

    return report;
  },

  /**
   * Edit Report (Screen 6, Business Rule 2 & 4)
   * Allowed ONLY while report is still open (before verification starts).
   */
  async updateReport(
    id: string,
    updates: Partial<Pick<ItemReport, 'itemName' | 'colour' | 'location' | 'date' | 'description' | 'whereItemIs' | 'imageUrl' | 'imageAltText'>>
  ): Promise<{ success: boolean; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const report = appStorage.getReportById(id);
    if (!report) return { success: false, error: 'Report not found.' };

    if (user.role !== 'admin' && report.userId !== user.id) {
      return { success: false, error: 'Not authorized.' };
    }

    // Business Rule 4: Closed cases are read-only
    if (report.status === 'Returned' || report.status === 'Archived') {
      return { success: false, error: 'Closed and archived cases cannot be edited.' };
    }

    // Business Rule 2: Editing lock once verification starts
    if (report.locked || report.status === 'Pending Verification') {
      return {
        success: false,
        error: 'Editing is locked because this report is currently undergoing match verification.',
      };
    }

    if (updates.imageUrl && !updates.imageAltText?.trim() && !report.imageAltText) {
      return { success: false, error: 'Alt text is required for uploaded photo.' };
    }

    Object.assign(report, updates, {
      lastActivityAt: new Date().toISOString(),
      ...(updates.description ? { descriptionTokens: extractDescriptionTokens(updates.description) } : {}),
    });

    if (isSharedMode()) {
      // Ask the administrator's browser to run the matching again for the edited report
      delete report.matchCheckedAt;
    }

    appStorage.saveReport(report);

    // Re-run matching if description or location changed
    if (!isSharedMode()) {
      await matchService.runMatchingForNewReport(report);
    }

    return { success: true };
  },

  /**
   * Search and Filter Reports (Admin Only - FR-05, UC7)
   */
  async getReportsForAdmin(filters: ReportFilterOptions = {}): Promise<ItemReport[]> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return [];
    }

    let reports = appStorage.getReports();

    if (filters.category && filters.category !== 'All') {
      reports = reports.filter((r) => r.category === filters.category);
    }

    if (filters.status && filters.status !== 'All') {
      reports = reports.filter((r) => r.status === filters.status);
    }

    if (filters.type && filters.type !== ('All' as any)) {
      reports = reports.filter((r) => r.type === filters.type);
    }

    if (filters.location && filters.location !== 'All') {
      reports = reports.filter((r) => r.location === filters.location);
    }

    if (filters.userId) {
      reports = reports.filter((r) => r.userId === filters.userId);
    }

    if (filters.startDate) {
      reports = reports.filter((r) => r.date >= filters.startDate!);
    }

    if (filters.endDate) {
      reports = reports.filter((r) => r.date <= filters.endDate!);
    }

    if (filters.urgent === true) {
      reports = reports.filter((r) => r.urgent === true);
    }

    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      reports = reports.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.colour.toLowerCase().includes(q) ||
          (r.userName && r.userName.toLowerCase().includes(q)) ||
          r.location.toLowerCase().includes(q)
      );
    }

    const isOpenUrgent = (r: ItemReport) =>
      r.urgent === true &&
      r.status !== 'Returned' &&
      r.status !== 'Archived' &&
      r.status !== 'Rejected';

    return reports.sort((a, b) => {
      const aOpenUrgent = isOpenUrgent(a);
      const bOpenUrgent = isOpenUrgent(b);
      if (aOpenUrgent && !bOpenUrgent) return -1;
      if (!aOpenUrgent && bOpenUrgent) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  },

  /**
   * Admin Status Management (FR-09, Business Rule 1)
   * Note: Business Rule 1 explicitly states:
   * "A found item can NOT be set to Returned until ownership verification has Passed.
   * There is no manual 'Returned' option in the status dropdown."
   */
  async updateReportStatus(
    reportId: string,
    newStatus: ReportStatus,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return { success: false, error: 'Unauthorized.' };
    }

    // Business Rule 1 enforcement:
    if (newStatus === 'Returned') {
      return {
        success: false,
        error: 'A report cannot be marked as Returned directly. Ownership verification must be completed and Passed first.',
      };
    }

    const report = appStorage.getReportById(reportId);
    if (!report) return { success: false, error: 'Report not found.' };

    const oldStatus = report.status;
    report.status = newStatus;
    report.lastActivityAt = new Date().toISOString();

    if (newStatus === 'Archived') {
      report.locked = true;
    }

    appStorage.saveReport(report);

    await auditService.logAction({
      adminId: user.id,
      adminName: user.name,
      action: 'Status Change',
      reportId: report.id,
      details: `Status updated from "${oldStatus}" to "${newStatus}". Reason: ${reason || 'Administrative review'}`,
      outcome: `Status changed to ${newStatus}`,
    });

    return { success: true };
  },

  /**
   * Update contact details for a report (owner only)
   */
  async updateContactDetails(
    id: string,
    details: { contactEmail?: string; contactPhone?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update contact details.' };
    }

    const report = appStorage.getReportById(id);
    if (!report) {
      return { success: false, error: 'Report not found.' };
    }

    // Must be the owner; administrators cannot change another person's contact details
    if (report.userId !== user.id) {
      return { success: false, error: 'You can only update contact details for your own reports.' };
    }

    if (report.status === 'Returned' || report.status === 'Archived') {
      return { success: false, error: 'Closed and archived cases cannot be edited.' };
    }

    const error = validateContact(details.contactEmail, details.contactPhone);
    if (error) {
      return { success: false, error };
    }

    const normEmail = normaliseContactEmail(details.contactEmail);
    const normPhone = normaliseContactPhone(details.contactPhone);

    report.contactEmail = normEmail || undefined;
    report.contactPhone = normPhone || undefined;
    report.lastActivityAt = new Date().toISOString();

    appStorage.saveReport(report);
    return { success: true };
  },

  /**
   * Anonymise reports for a deleted user (Business Rule 4 & FR-01)
   * Sets userName to "Deleted account", removes userEmail, archives and locks open reports.
   * Leaves closed reports read-only as they are (Business Rule 4).
   */
  anonymiseReportsForDeletedUser(userId: string): void {
    const reports = appStorage.getReports();
    const updated = reports.map((r) => {
      if (r.userId !== userId) return r;
      const isClosed = r.status === 'Returned' || r.status === 'Archived';
      return {
        ...r,
        userName: 'Deleted account',
        userEmail: undefined,
        contactEmail: undefined,
        contactPhone: undefined,
        urgent: false,
        urgentReason: undefined,
        status: isClosed ? r.status : ('Archived' as ReportStatus),
        locked: true,
        lastActivityAt: new Date().toISOString(),
      };
    });
    appStorage.saveReports(updated);
  },

  /**
   * Delete Reports (Permanent admin removal with audit entry - FR-05)
   */
  async deleteReports(
    ids: string[],
    reason: string
  ): Promise<{ success: boolean; deleted: number; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return { success: false, deleted: 0, error: 'Only administrators can delete reports.' };
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 5) {
      return { success: false, deleted: 0, error: 'Please give a reason (at least 5 characters).' };
    }

    const uniqueIds = Array.from(new Set(ids));
    let deletedCount = 0;

    for (const reportId of uniqueIds) {
      const currentReports = appStorage.getReports();
      const report = currentReports.find((r) => r.id === reportId);
      if (!report) {
        continue; // ignore unknown ids
      }

      // If another report has matchedWithReportId equal to this id (or this report has matchedWithReportId set)
      // and that other report is not Returned or Archived:
      // set that other report to status 'Under Review', locked false, matchedWithReportId undefined, lastActivityAt now.
      const otherReports = currentReports.filter(
        (r) =>
          r.id !== reportId &&
          (r.matchedWithReportId === reportId || (report.matchedWithReportId && r.id === report.matchedWithReportId)) &&
          r.status !== 'Returned' &&
          r.status !== 'Archived'
      );

      for (const otherReport of otherReports) {
        otherReport.status = 'Under Review';
        otherReport.locked = false;
        otherReport.matchedWithReportId = undefined;
        otherReport.lastActivityAt = new Date().toISOString();
        appStorage.saveReport(otherReport);
      }

      // Remove every match suggestion whose lostReportId or foundReportId equals this id.
      const removedMatchIds = new Set<string>();
      const allMatches = appStorage.getMatchSuggestions();
      const remainingMatches = allMatches.filter((m) => {
        if (m.lostReportId === reportId || m.foundReportId === reportId) {
          removedMatchIds.add(m.id);
          firestoreSync.deleteMatch(m.id);
          return false;
        }
        return true;
      });
      appStorage.saveMatchSuggestions(remainingMatches);

      // Remove every notification whose relatedId equals this report id or the id of a match suggestion that was removed.
      const allNotifs = appStorage.getNotifications();
      const remainingNotifs = allNotifs.filter((n) => {
        if (n.relatedId === reportId || (n.relatedId && removedMatchIds.has(n.relatedId))) {
          firestoreSync.deleteNotification(n.id);
          return false;
        }
        return true;
      });
      appStorage.saveNotifications(remainingNotifs);

      // Remove the report itself (this removes its photo too).
      const updatedReports = appStorage.getReports().filter((r) => r.id !== reportId);
      appStorage.saveReports(updatedReports);
      firestoreSync.deleteReport(reportId);

      // Write ONE audit entry through auditService.logAction
      await auditService.logAction({
        adminId: user.id,
        adminName: user.name,
        action: 'Report Deleted',
        reportId: report.id,
        details: `Report deleted. Type: ${report.type}; category: ${report.category}; status: ${report.status}. Reason: ${trimmedReason}`,
        outcome: 'Report Deleted',
      });

      deletedCount++;
    }

    return { success: true, deleted: deletedCount };
  },

  /**
   * Clear Urgent Flag (Admin Only)
   */
  async clearUrgent(
    reportId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return { success: false, error: 'Only administrators can clear urgent flags.' };
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 5) {
      return { success: false, error: 'Please give a reason (at least 5 characters).' };
    }

    const report = appStorage.getReportById(reportId);
    if (!report) {
      return { success: false, error: 'Report not found.' };
    }

    if (report.urgent !== true) {
      return { success: false, error: 'Report is not marked as urgent.' };
    }

    report.urgent = false;
    delete report.urgentReason;
    report.lastActivityAt = new Date().toISOString();
    appStorage.saveReport(report);

    await auditService.logAction({
      adminId: user.id,
      adminName: user.name,
      action: 'Urgent Cleared',
      reportId: report.id,
      details: `Urgent flag cleared. Reason: ${trimmedReason}`,
      outcome: 'Urgent Cleared',
    });

    return { success: true };
  },
};
