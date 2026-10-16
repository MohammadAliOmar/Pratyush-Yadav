/**
 * Storage Service
 * Handles persistence in localStorage and provides atomic access for CampusFind service layer.
 * Prepares the application for zero-friction Firebase Firestore swap.
 */

import {
  User,
  ItemReport,
  MatchSuggestion,
  Notification,
  AdminAction,
  SignupAttempt,
  SimulatedEmail,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_REPORTS,
  INITIAL_MATCH_SUGGESTIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_ADMIN_ACTIONS,
  DEFAULT_ADMIN_PASSWORD_HASH,
  hashPassword,
} from './seedData';
import {
  FIXTURE_USERS,
  FIXTURE_REPORTS,
  FIXTURE_MATCH_SUGGESTIONS,
  FIXTURE_NOTIFICATIONS,
  FIXTURE_ADMIN_ACTIONS,
  FIXTURE_PASSWORD_HASH,
} from '../config/testFixtures';
import { INACTIVITY_ARCHIVE_DAYS } from '../config/matchingConfig';
import { firestoreSync, SharedCollection } from './firestoreSync';
import { isSharedMode } from '../config/runtimeMode';
import { DATA_CHANGED_EVENT } from '../hooks/useDataVersion';

export { hashPassword };

const DATA_VERSION = '3';

const STORAGE_KEYS = {
  USERS: 'campusfind_users',
  REPORTS: 'campusfind_reports',
  MATCHES: 'campusfind_matches',
  NOTIFICATIONS: 'campusfind_notifications',
  ADMIN_ACTIONS: 'campusfind_admin_actions',
  SIGNUP_ATTEMPTS: 'campusfind_signup_attempts',
  PASSWORDS: 'campusfind_passwords',
  SIMULATED_EMAILS: 'campusfind_simulated_emails',
  CURRENT_USER: 'campusfind_current_user',
  DATA_VERSION: 'campusfind_data_version',
};

// Safe localStorage writer with quota error handling
function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    if (
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e?.code === 22 ||
      e?.code === 1014 ||
      e?.message?.toLowerCase().includes('quota')
    ) {
      throw new Error('Storage is full - remove the photo and try again');
    }
    throw e;
  }
}

class AppStorage {
  private initialized = false;

  constructor() {
    this.init();
  }

  public migrateIfNeeded(): boolean {
    const storedVersion = localStorage.getItem(STORAGE_KEYS.DATA_VERSION);
    // In local mode the seed must exist; in shared mode the data lives in Firestore instead.
    const missingSeed = isSharedMode() ? false : !localStorage.getItem(STORAGE_KEYS.USERS);

    if (missingSeed || storedVersion !== DATA_VERSION) {
      if (isSharedMode()) {
        this.clearLegacyLocalData();
      } else {
        this.resetToSeedData();
      }
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      safeSetItem(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
      return true;
    }
    return false;
  }

  /** Shared mode: remove the old browser-only data (reports, users, password hashes) once. */
  private clearLegacyLocalData() {
    [
      STORAGE_KEYS.USERS,
      STORAGE_KEYS.REPORTS,
      STORAGE_KEYS.MATCHES,
      STORAGE_KEYS.NOTIFICATIONS,
      STORAGE_KEYS.ADMIN_ACTIONS,
      STORAGE_KEYS.SIGNUP_ATTEMPTS,
      STORAGE_KEYS.PASSWORDS,
      STORAGE_KEYS.SIMULATED_EMAILS,
    ].forEach((key) => localStorage.removeItem(key));
  }

  public init() {
    if (this.initialized) return;

    const migrated = this.migrateIfNeeded();
    if (!migrated && !isSharedMode()) {
      // Run automatic 90-day inactivity check (Business Rule 7).
      // In shared mode the administrator's browser runs it after the data has loaded.
      this.checkInactivityArchiving();
    }
    this.initialized = true;
  }

  public resetToSeedData() {
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    safeSetItem(STORAGE_KEYS.REPORTS, JSON.stringify(INITIAL_REPORTS));
    safeSetItem(STORAGE_KEYS.MATCHES, JSON.stringify(INITIAL_MATCH_SUGGESTIONS));
    safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(INITIAL_NOTIFICATIONS));
    safeSetItem(STORAGE_KEYS.ADMIN_ACTIONS, JSON.stringify(INITIAL_ADMIN_ACTIONS));
    safeSetItem(STORAGE_KEYS.SIGNUP_ATTEMPTS, JSON.stringify({}));
    safeSetItem(STORAGE_KEYS.SIMULATED_EMAILS, JSON.stringify([]));

    // Store admin password hash
    const passwords: Record<string, string> = {};
    INITIAL_USERS.forEach((u) => {
      passwords[u.email.toLowerCase()] = DEFAULT_ADMIN_PASSWORD_HASH;
    });
    safeSetItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
    safeSetItem(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
  }

  public resetToTestFixtures() {
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(FIXTURE_USERS));
    safeSetItem(STORAGE_KEYS.REPORTS, JSON.stringify(FIXTURE_REPORTS));
    safeSetItem(STORAGE_KEYS.MATCHES, JSON.stringify(FIXTURE_MATCH_SUGGESTIONS));
    safeSetItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(FIXTURE_NOTIFICATIONS));
    safeSetItem(STORAGE_KEYS.ADMIN_ACTIONS, JSON.stringify(FIXTURE_ADMIN_ACTIONS));
    safeSetItem(STORAGE_KEYS.SIGNUP_ATTEMPTS, JSON.stringify({}));
    safeSetItem(STORAGE_KEYS.SIMULATED_EMAILS, JSON.stringify([]));

    const passwords: Record<string, string> = {};
    FIXTURE_USERS.forEach((u) => {
      passwords[u.email.toLowerCase()] = FIXTURE_PASSWORD_HASH;
    });
    safeSetItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
  }

  // --- SHARED-MODE CACHE ---
  // In shared mode the five shared collections live in memory (filled by the Firestore listeners)
  // instead of localStorage, so photos never hit the 5 MB browser limit and nothing is left behind
  // on a shared computer after sign-out. In local mode they stay in localStorage as before.
  private memory: Record<string, string> = {};
  private changeTimer: ReturnType<typeof setTimeout> | null = null;

  private readShared(key: string): string | null {
    if (isSharedMode()) {
      return key in this.memory ? this.memory[key] : null;
    }
    return localStorage.getItem(key);
  }

  private writeShared(key: string, value: string) {
    if (isSharedMode()) {
      this.memory[key] = value;
    } else {
      safeSetItem(key, value);
    }
  }

  private readList<T>(key: string): T[] {
    try {
      const data = this.readShared(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private writeList<T extends { id: string }>(key: string, collectionName: SharedCollection, next: T[]) {
    const prev = firestoreSync.isEnabled() ? this.readList<T>(key) : [];
    this.writeShared(key, JSON.stringify(next));
    firestoreSync.pushDiff(collectionName, prev, next);
  }

  /** Called by the Firestore listeners: replace a cached collection without writing it back. */
  public applyRemoteCollection(collectionName: SharedCollection, docs: any[]) {
    const keyByCollection: Record<SharedCollection, string> = {
      item_reports: STORAGE_KEYS.REPORTS,
      users: STORAGE_KEYS.USERS,
      match_suggestions: STORAGE_KEYS.MATCHES,
      notifications: STORAGE_KEYS.NOTIFICATIONS,
      admin_actions: STORAGE_KEYS.ADMIN_ACTIONS,
    };
    this.memory[keyByCollection[collectionName]] = JSON.stringify(docs);
    this.notifyDataChanged();
  }

  /** Forget everything held in memory (called on sign-out). */
  public clearSharedCache() {
    this.memory = {};
    this.notifyDataChanged();
  }

  public notifyDataChanged() {
    if (typeof window === 'undefined') return;
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    }, 60);
  }

  // --- USERS ---
  public getUsers(): User[] {
    return this.readList<User>(STORAGE_KEYS.USERS);
  }

  public saveUsers(users: User[]) {
    this.writeList(STORAGE_KEYS.USERS, 'users', users);
  }

  public getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    return this.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public saveUser(user: User) {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    this.saveUsers(users);
  }

  public deleteUser(id: string) {
    const users = this.getUsers().filter((u) => u.id !== id);
    this.saveUsers(users);
  }

  // --- PASSWORDS ---
  public getPasswordHash(email: string): string | undefined {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PASSWORDS);
      const passwords = data ? JSON.parse(data) : {};
      const hash = passwords[email.toLowerCase()];
      if (hash === 'demo_sha256_campus2026') {
        return FIXTURE_PASSWORD_HASH;
      }
      return hash;
    } catch {
      return undefined;
    }
  }

  public setPasswordHash(email: string, hash: string) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PASSWORDS);
      const passwords = data ? JSON.parse(data) : {};
      passwords[email.toLowerCase()] = hash;
      safeSetItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
    } catch (e) {
      if (e instanceof Error && e.message.includes('Storage is full')) {
        throw e;
      }
    }
  }

  public deletePasswordHash(email: string) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PASSWORDS);
      const passwords = data ? JSON.parse(data) : {};
      delete passwords[email.toLowerCase()];
      safeSetItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
    } catch {}
  }

  // --- CURRENT USER SESSION ---
  public getCurrentUser(): User | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public setCurrentUser(user: User | null) {
    if (user) {
      safeSetItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }

  // --- REPORTS ---
  public getReports(): ItemReport[] {
    return this.readList<ItemReport>(STORAGE_KEYS.REPORTS);
  }

  public saveReports(reports: ItemReport[]) {
    this.writeList(STORAGE_KEYS.REPORTS, 'item_reports', reports);
  }

  public getReportById(id: string): ItemReport | undefined {
    return this.getReports().find((r) => r.id === id);
  }

  public saveReport(report: ItemReport) {
    const reports = this.getReports();
    const idx = reports.findIndex((r) => r.id === report.id);
    if (idx >= 0) {
      reports[idx] = report;
    } else {
      reports.push(report);
    }
    this.saveReports(reports);
  }

  // Business Rule 7: 90 days inactivity moves to Archived
  public runInactivityArchiving() {
    this.checkInactivityArchiving();
  }

  private checkInactivityArchiving() {
    const reports = this.getReports();
    const now = new Date().getTime();
    let updated = false;

    reports.forEach((r) => {
      if (r.status !== 'Archived' && r.status !== 'Returned') {
        const lastActivity = new Date(r.lastActivityAt || r.createdAt).getTime();
        const daysDiff = (now - lastActivity) / (1000 * 60 * 60 * 24);
        if (daysDiff >= INACTIVITY_ARCHIVE_DAYS) {
          r.status = 'Archived';
          r.locked = true;
          updated = true;
        }
      }
    });

    if (updated) {
      this.saveReports(reports);
    }
  }

  // --- MATCH SUGGESTIONS ---
  public getMatchSuggestions(): MatchSuggestion[] {
    return this.readList<MatchSuggestion>(STORAGE_KEYS.MATCHES);
  }

  public saveMatchSuggestions(matches: MatchSuggestion[]) {
    this.writeList(STORAGE_KEYS.MATCHES, 'match_suggestions', matches);
  }

  public saveMatchSuggestion(match: MatchSuggestion) {
    const matches = this.getMatchSuggestions();
    const idx = matches.findIndex((m) => m.id === match.id);
    if (idx >= 0) {
      matches[idx] = match;
    } else {
      matches.push(match);
    }
    this.saveMatchSuggestions(matches);
  }

  // --- NOTIFICATIONS ---
  public getNotifications(): Notification[] {
    return this.readList<Notification>(STORAGE_KEYS.NOTIFICATIONS);
  }

  public saveNotifications(notifications: Notification[]) {
    this.writeList(STORAGE_KEYS.NOTIFICATIONS, 'notifications', notifications);
  }

  public addNotification(notification: Notification) {
    const notifs = this.getNotifications();
    notifs.unshift(notification);
    this.saveNotifications(notifs);
  }

  // --- ADMIN ACTIONS / AUDIT LOG ---
  public getAdminActions(): AdminAction[] {
    return this.readList<AdminAction>(STORAGE_KEYS.ADMIN_ACTIONS);
  }

  public saveAdminActions(actions: AdminAction[]) {
    this.writeList(STORAGE_KEYS.ADMIN_ACTIONS, 'admin_actions', actions);
  }

  public addAdminAction(action: AdminAction) {
    const actions = this.getAdminActions();
    actions.unshift(action);
    this.saveAdminActions(actions);
  }

  // --- SIGNUP ATTEMPTS RATE LIMITING ---
  public getSignupAttempts(): Record<string, SignupAttempt> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SIGNUP_ATTEMPTS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  public saveSignupAttempts(attempts: Record<string, SignupAttempt>) {
    safeSetItem(STORAGE_KEYS.SIGNUP_ATTEMPTS, JSON.stringify(attempts));
  }

  // --- SIMULATED EMAILS ---
  public getSimulatedEmails(): SimulatedEmail[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SIMULATED_EMAILS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public saveSimulatedEmails(emails: SimulatedEmail[]) {
    safeSetItem(STORAGE_KEYS.SIMULATED_EMAILS, JSON.stringify(emails));
  }

  public addSimulatedEmail(email: SimulatedEmail) {
    const emails = this.getSimulatedEmails();
    emails.unshift(email);
    this.saveSimulatedEmails(emails);
  }
}

export const appStorage = new AppStorage();
