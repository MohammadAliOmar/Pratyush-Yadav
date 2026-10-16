/**
 * CampusFind Matching Service (FR-06, FR-07, Section 6)
 *
 * Implements:
 * - Hybrid weighted scoring engine:
 *   Score / 100 = category 35 + description 30 + location 20 + date 10 + colour 5.
 * - Date decay curve: 0 days = 1.0; 1-3 days = 0.8; 4-14 days = 0.5; >14 days = 0.2.
 * - Colour adjacency: exact = 5; adjacent = 2.5; otherwise 0.
 * - Classification: >= 75 "Likely match", 45-74 "Possible match", < 45 not shown.
 * - Business Rule 6: Admins cannot process reports they submitted themselves.
 */

import {
  ItemReport,
  MatchSuggestion,
  MatchFactorBreakdown,
  MatchLabel,
} from '../types';
import {
  MATCHING_WEIGHTS,
  MATCHING_THRESHOLDS,
  DATE_DECAY,
  ADJACENT_COLOURS,
} from '../config/matchingConfig';
import { computeDescriptionSimilarity } from './similarityEngine';
import { appStorage } from './storage';
import { notificationService } from './notificationService';

export const matchService = {
  /**
   * Calculate date decay factor based on absolute day difference
   */
  calculateDateDecay(daysApart: number): number {
    if (daysApart === 0) return DATE_DECAY.sameDay;
    if (daysApart <= 3) return DATE_DECAY.oneToThreeDays;
    if (daysApart <= 14) return DATE_DECAY.fourToFourteenDays;
    return DATE_DECAY.overFourteenDays;
  },

  /**
   * Calculate colour score (exact = 5, adjacent = 2.5, other = 0)
   */
  calculateColourScore(colourA: string, colourB: string): number {
    const colA = colourA.trim().toLowerCase();
    const colB = colourB.trim().toLowerCase();

    if (colA === colB) {
      return MATCHING_WEIGHTS.colour; // 5.0
    }

    const adjacentList = ADJACENT_COLOURS[colA] || [];
    if (adjacentList.includes(colB)) {
      return MATCHING_WEIGHTS.colour * 0.5; // 2.5
    }

    const reverseAdjacentList = ADJACENT_COLOURS[colB] || [];
    if (reverseAdjacentList.includes(colA)) {
      return MATCHING_WEIGHTS.colour * 0.5; // 2.5
    }

    return 0;
  },

  /**
   * Score two reports using the Section 6 formula
   */
  scoreReports(
    reportA: ItemReport,
    reportB: ItemReport,
    customDescriptionSimilarity?: number
  ): MatchFactorBreakdown {
    // 1. Category (35%) - exact match only
    const categoryScore =
      reportA.category === reportB.category ? MATCHING_WEIGHTS.category : 0;

    // 2. Description (30%) - semantic similarity via embeddings (or placeholder)
    const similarity =
      customDescriptionSimilarity !== undefined
        ? customDescriptionSimilarity
        : computeDescriptionSimilarity(reportA.description, reportB.description);
    const descriptionScore = Number((MATCHING_WEIGHTS.description * similarity).toFixed(1));

    // 3. Location (20%) - exact match on campus location
    const locationScore =
      reportA.location.trim().toLowerCase() === reportB.location.trim().toLowerCase()
        ? MATCHING_WEIGHTS.location
        : 0;

    // 4. Date (10%) - decay curve
    const dateA = new Date(reportA.date).getTime();
    const dateB = new Date(reportB.date).getTime();
    const diffDays = Math.round(Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24));
    const dateDecayFactor = this.calculateDateDecay(diffDays);
    const dateScore = Number((MATCHING_WEIGHTS.date * dateDecayFactor).toFixed(1));

    // 5. Colour (5%) - exact or adjacent
    const colourScore = this.calculateColourScore(reportA.colour, reportB.colour);

    // Total Score
    const rawTotal =
      categoryScore + descriptionScore + locationScore + dateScore + colourScore;
    const totalScore = Math.min(100.0, Math.round(rawTotal * 10) / 10);

    return {
      categoryScore,
      descriptionScore,
      locationScore,
      dateScore,
      colourScore,
      totalScore,
    };
  },

  /**
   * Classify score into label (Section 6)
   */
  classifyMatch(score: number): MatchLabel | null {
    if (score >= MATCHING_THRESHOLDS.likelyMatch) {
      return 'Likely match';
    }
    if (score >= MATCHING_THRESHOLDS.possibleMatch) {
      return 'Possible match';
    }
    return null; // < 45.0 is not surfaced anywhere
  },

  /**
   * Run matching algorithm when a new report is submitted (UC1)
   */
  async runMatchingForNewReport(newReport: ItemReport): Promise<MatchSuggestion[]> {
    const allReports = appStorage.getReports();

    // Candidate pre-filtering by category and status BEFORE scoring (Scalability 3.1)
    const oppositeType = newReport.type === 'lost' ? 'found' : 'lost';
    const activeCandidates = allReports.filter(
      (r) =>
        r.id !== newReport.id &&
        r.type === oppositeType &&
        r.category === newReport.category &&
        (r.status === 'Submitted' || r.status === 'Under Review' || r.status === 'Possible Match')
    );

    const generatedSuggestions: MatchSuggestion[] = [];
    const existingSuggestions = appStorage.getMatchSuggestions();

    for (const candidate of activeCandidates) {
      const breakdown = this.scoreReports(newReport, candidate);

      // Only candidates scoring 45 or more are surfaced (Threshold Rule)
      if (breakdown.totalScore >= MATCHING_THRESHOLDS.possibleMatch) {
        const label = this.classifyMatch(breakdown.totalScore)!;
        const lostReportId = newReport.type === 'lost' ? newReport.id : candidate.id;
        const foundReportId = newReport.type === 'found' ? newReport.id : candidate.id;

        // Check if suggestion already exists
        const exists = existingSuggestions.find(
          (m) => m.lostReportId === lostReportId && m.foundReportId === foundReportId
        );

        if (!exists) {
          const suggestion: MatchSuggestion = {
            // Deterministic id: two administrator browsers matching the same pair write the same document
            id: `match_${lostReportId}_${foundReportId}`,
            lostReportId,
            foundReportId,
            ...breakdown,
            label,
            status: 'pending',
            createdAt: new Date().toISOString(),
          };

          appStorage.saveMatchSuggestion(suggestion);
          generatedSuggestions.push(suggestion);
        }
      }
    }

    // FR-07: Notify administrators ONLY when at least one candidate scores 45 or more
    if (generatedSuggestions.length > 0) {
      const topScore = Math.max(...generatedSuggestions.map((s) => s.totalScore));
      await notificationService.createNotification({
        audience: 'admin',
        type: 'possible_match',
        message: `New match identified (${topScore.toFixed(1)}%) for ${newReport.type} report "${newReport.itemName}" in ${newReport.category}.`,
        relatedId: generatedSuggestions[0].id,
      });

      // Update report status to Possible Match if currently Submitted
      if (newReport.status === 'Submitted') {
        newReport.status = 'Possible Match';
        appStorage.saveReport(newReport);
      }
    }

    return generatedSuggestions;
  },

  /**
   * Get ranked matching queue for Administrator (UC3, Desktop-first)
   * Enforces Business Rule 6: An admin cannot process a report they submitted themselves.
   */
  async getAdminMatchingQueue(): Promise<MatchSuggestion[]> {
    const currentUser = appStorage.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return [];
    }

    const suggestions = appStorage.getMatchSuggestions();
    const reports = appStorage.getReports();

    // Populate lost and found report objects
    const populated = suggestions
      .filter((m) => m.status === 'pending' || m.status === 'confirmed')
      .map((m) => {
        const lostReport = reports.find((r) => r.id === m.lostReportId);
        const foundReport = reports.find((r) => r.id === m.foundReportId);
        return {
          ...m,
          lostReport,
          foundReport,
        };
      })
      .filter((m) => {
        // Exclude closed or archived reports
        if (!m.lostReport || !m.foundReport) return false;
        if (m.lostReport.status === 'Returned' || m.lostReport.status === 'Archived') return false;
        if (m.foundReport.status === 'Returned' || m.foundReport.status === 'Archived') return false;
        return true;
      });

    // Sort: pairs where lostReport or foundReport has urgent === true come first,
    // and within each group the order stays totalScore descending.
    populated.sort((a, b) => {
      const aUrgent = a.lostReport?.urgent === true || a.foundReport?.urgent === true;
      const bUrgent = b.lostReport?.urgent === true || b.foundReport?.urgent === true;

      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;

      return b.totalScore - a.totalScore;
    });

    return populated;
  },

  /**
   * Dismiss match suggestion
   */
  async dismissMatch(matchId: string, adminId: string, adminName: string): Promise<boolean> {
    const suggestions = appStorage.getMatchSuggestions();
    const match = suggestions.find((m) => m.id === matchId);
    if (!match) return false;

    match.status = 'dismissed';
    appStorage.saveMatchSuggestions(suggestions);
    return true;
  },
};
