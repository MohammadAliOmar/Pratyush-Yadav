/**
 * Runtime mode (shared cloud mode vs local mode)
 *
 * Shared mode (default for the published app): every account signs in through Firebase
 * Authentication and all reports, users, match suggestions, notifications and audit entries
 * live in Cloud Firestore, so a report made on one computer appears on the administrator's
 * screen on another computer.
 *
 * Local mode: everything stays in the browser (localStorage). Used by the unit tests
 * (VITE_SHARED_MODE=false in vitest.config.ts) and by the in-app Algorithm Tests screen,
 * which temporarily forces local mode while it runs.
 */

export const SHARED_MODE_DEFAULT = true;

/** Administrator accounts are Firebase accounts whose address is on this list. */
export const ADMIN_EMAILS: string[] = ['admin@campusfind.test'];

let forcedLocal = false;

export function setForcedLocalMode(value: boolean): void {
  forcedLocal = value;
}

export function isSharedMode(): boolean {
  if (forcedLocal) return false;
  let env: unknown;
  try {
    env = (import.meta as any).env.VITE_SHARED_MODE;
  } catch {
    env = undefined;
  }
  if (env === 'false') return false;
  if (env === 'true') return true;
  return SHARED_MODE_DEFAULT;
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes((email || '').trim().toLowerCase());
}
