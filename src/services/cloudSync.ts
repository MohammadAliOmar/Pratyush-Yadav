/**
 * Cloud Sync (shared mode)
 *
 * After sign-in this service listens to Cloud Firestore and keeps the in-memory cache of
 * appStorage up to date, so every screen sees the same data on every computer:
 *  - Administrator: all five collections (reports, users, match suggestions, notifications, audit log).
 *  - Student / staff: only their own reports and their own user document (the Firestore rules
 *    enforce this too).
 *
 * The administrator's browser also runs the matching engine for new or edited reports, because
 * reporters cannot read other people's reports. Matches appear while an administrator has the
 * app open; when an administrator opens the app later, all waiting reports are matched then.
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { appStorage } from './storage';
import { matchService } from './matchService';
import { SharedCollection } from './firestoreSync';
import { isSharedMode } from '../config/runtimeMode';
import { User } from '../types';

const ADMIN_COLLECTIONS: SharedCollection[] = [
  'item_reports',
  'users',
  'match_suggestions',
  'notifications',
  'admin_actions',
];

const READY_TIMEOUT_MS = 10000;
const MATCHING_DEBOUNCE_MS = 500;

let unsubscribers: Unsubscribe[] = [];
let running = false;
let matching = false;
let matchingAgain = false;
let matchingTimer: ReturnType<typeof setTimeout> | null = null;
let archivedOnce = false;

/** Firestore stores undefined as null; the app expects the field to be missing. */
function clean(data: DocumentData): any {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

function scheduleMatching() {
  if (matchingTimer) clearTimeout(matchingTimer);
  matchingTimer = setTimeout(() => {
    matchingTimer = null;
    void runPendingMatching();
  }, MATCHING_DEBOUNCE_MS);
}

/**
 * Administrator browser only: match every open report that has not been checked yet.
 * Safe to run in several administrator browsers at once (match ids are deterministic).
 */
async function runPendingMatching(): Promise<void> {
  if (!isSharedMode() || !running) return;
  if (matching) {
    matchingAgain = true;
    return;
  }
  const user = appStorage.getCurrentUser();
  if (!user || user.role !== 'admin') return;

  matching = true;
  try {
    const pending = appStorage
      .getReports()
      .filter(
        (r) =>
          !r.matchCheckedAt &&
          (r.status === 'Submitted' || r.status === 'Under Review' || r.status === 'Possible Match')
      );

    for (const candidate of pending) {
      if (!running) break;
      const fresh = appStorage.getReportById(candidate.id);
      if (!fresh || fresh.matchCheckedAt) continue;

      await matchService.runMatchingForNewReport(fresh);

      const after = appStorage.getReportById(candidate.id);
      if (after && !after.matchCheckedAt) {
        after.matchCheckedAt = new Date().toISOString();
        appStorage.saveReport(after);
      }
    }
  } catch (error) {
    console.warn('Cloud sync (matching):', error);
  } finally {
    matching = false;
    if (matchingAgain) {
      matchingAgain = false;
      scheduleMatching();
    }
  }
}

export const cloudSync = {
  isRunning(): boolean {
    return running;
  },

  /**
   * Start listening for this signed-in user. Resolves when the first data has arrived
   * (or after a timeout, so a slow connection never blocks sign-in).
   */
  async start(user: User): Promise<void> {
    if (!isSharedMode()) return;
    this.stop();
    running = true;
    archivedOnce = false;

    const ready: Promise<void>[] = [];

    const watch = (
      collectionName: SharedCollection,
      source: ReturnType<typeof collection> | ReturnType<typeof doc>,
      toDocs: (snap: any) => any[]
    ) => {
      let first = true;
      ready.push(
        new Promise<void>((resolve) => {
          const unsubscribe = onSnapshot(
            source as any,
            (snap: any) => {
              if (!running) return;
              appStorage.applyRemoteCollection(collectionName, toDocs(snap));
              if (collectionName === 'item_reports' && user.role === 'admin') {
                scheduleMatching();
              }
              if (first) {
                first = false;
                resolve();
              }
            },
            (error: unknown) => {
              console.warn(`Cloud sync (${collectionName}):`, error);
              if (first) {
                first = false;
                resolve();
              }
            }
          );
          unsubscribers.push(unsubscribe);
        })
      );
    };

    const docsOf = (snap: any) => snap.docs.map((d: any) => clean(d.data()));

    if (user.role === 'admin') {
      ADMIN_COLLECTIONS.forEach((name) => watch(name, collection(db, name), docsOf));
    } else {
      watch(
        'item_reports',
        query(collection(db, 'item_reports'), where('userId', '==', user.id)) as any,
        docsOf
      );
      watch('users', doc(db, 'users', user.id), (snap: any) =>
        snap.exists() ? [clean(snap.data())] : []
      );
    }

    await Promise.race([
      Promise.all(ready).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
    ]);

    if (user.role === 'admin' && running && !archivedOnce) {
      archivedOnce = true;
      // Business Rule 7 (90-day inactivity archiving), run once per administrator session
      appStorage.runInactivityArchiving();
      scheduleMatching();
    }
  },

  /** Stop listening and forget everything held in memory (sign-out). */
  stop(): void {
    unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    });
    unsubscribers = [];
    if (matchingTimer) {
      clearTimeout(matchingTimer);
      matchingTimer = null;
    }
    const wasRunning = running;
    running = false;
    matching = false;
    matchingAgain = false;
    if (wasRunning) {
      appStorage.clearSharedCache();
    }
  },
};
