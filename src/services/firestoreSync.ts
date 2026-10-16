import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ItemReport, User, AdminAction, MatchSuggestion, Notification } from '../types';
import { isSharedMode } from '../config/runtimeMode';

/**
 * Firestore write-through (shared mode).
 * Every change made through appStorage is pushed to Cloud Firestore here.
 * Failures are logged and never block the screen (the next snapshot corrects the cache).
 */

export type SharedCollection =
  | 'item_reports'
  | 'users'
  | 'match_suggestions'
  | 'notifications'
  | 'admin_actions';

let syncPaused = false;

const isSyncEnabled = () => !syncPaused && isSharedMode();

/**
 * Firestore rejects undefined values. A JSON round trip drops every undefined field (also inside
 * nested objects), so a missing field stays missing in the cloud and the document is stable
 * when it is read back and written again.
 */
function toFirestoreData(value: Record<string, any>): Record<string, any> {
  return JSON.parse(JSON.stringify(value));
}

function sameDoc(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const firestoreSync = {
  setSyncPaused(paused: boolean) {
    syncPaused = paused;
  },

  isEnabled(): boolean {
    return isSyncEnabled();
  },

  /**
   * Push the difference between two versions of a collection:
   * new or changed documents are written, documents that disappeared are deleted.
   * The Firestore calls are started synchronously so the SDK orders them with its own snapshots.
   */
  pushDiff(collectionName: SharedCollection, prev: any[], next: any[]): void {
    if (!isSyncEnabled()) return;

    const prevById = new Map<string, any>();
    prev.forEach((item) => prevById.set(item.id, item));
    const nextIds = new Set<string>();

    for (const item of next) {
      nextIds.add(item.id);
      const before = prevById.get(item.id);
      if (before !== undefined && sameDoc(before, item)) continue;
      setDoc(doc(db, collectionName, item.id), toFirestoreData(item)).catch((error) => {
        console.warn(`Firestore sync (${collectionName}/${item.id}):`, error);
      });
    }

    for (const item of prev) {
      if (nextIds.has(item.id)) continue;
      deleteDoc(doc(db, collectionName, item.id)).catch((error) => {
        console.warn(`Firestore sync (delete ${collectionName}/${item.id}):`, error);
      });
    }
  },

  /** Write one user document and wait for it (used during sign-up and sign-in). */
  async writeUser(user: User): Promise<void> {
    await setDoc(doc(db, 'users', user.id), toFirestoreData(user));
  },

  async deleteUserDoc(userId: string): Promise<void> {
    await deleteDoc(doc(db, 'users', userId));
  },

  // The helpers below keep the old call sites working; they now use the generic diff path.
  async saveReport(report: ItemReport): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await setDoc(doc(db, 'item_reports', report.id), toFirestoreData(report));
    } catch (error) {
      console.warn('Firestore sync (report):', error);
    }
  },

  async saveUser(user: User): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await setDoc(doc(db, 'users', user.id), toFirestoreData(user));
    } catch (error) {
      console.warn('Firestore sync (user):', error);
    }
  },

  async saveAdminAction(action: AdminAction): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await setDoc(doc(db, 'admin_actions', action.id), toFirestoreData(action));
    } catch (error) {
      console.warn('Firestore sync (adminAction):', error);
    }
  },

  async saveMatch(match: MatchSuggestion): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await setDoc(doc(db, 'match_suggestions', match.id), toFirestoreData(match));
    } catch (error) {
      console.warn('Firestore sync (match):', error);
    }
  },

  async saveNotification(notification: Notification): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await setDoc(doc(db, 'notifications', notification.id), toFirestoreData(notification));
    } catch (error) {
      console.warn('Firestore sync (notification):', error);
    }
  },

  async deleteReport(reportId: string): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await deleteDoc(doc(db, 'item_reports', reportId));
    } catch (error) {
      console.warn('Firestore sync (deleteReport):', error);
    }
  },

  async deleteMatch(matchId: string): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await deleteDoc(doc(db, 'match_suggestions', matchId));
    } catch (error) {
      console.warn('Firestore sync (deleteMatch):', error);
    }
  },

  async deleteNotification(notificationId: string): Promise<void> {
    if (!isSyncEnabled()) return;
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.warn('Firestore sync (deleteNotification):', error);
    }
  },
};
