import {
  User,
  ItemReport,
  MatchSuggestion,
  Notification,
  AdminAction,
} from '../types';

export function hashPassword(plainText: string): string {
  let hash = 0;
  for (let i = 0; i < plainText.length; i++) {
    const char = plainText.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash)}_${plainText.length}`;
}

export const DEFAULT_ADMIN_PASSWORD = 'Admin123321';
export const DEFAULT_ADMIN_PASSWORD_HASH = hashPassword(DEFAULT_ADMIN_PASSWORD);

export const SEEDED_USER_IDS = [
  'user_admin_1',
  'user_admin_2',
  'user_student_1',
  'user_student_2',
  'user_student_3',
  'user_student_4',
  'user_staff_1',
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user_admin_1',
    name: 'Admin',
    email: 'admin@campusfind.test',
    role: 'admin',
    status: 'active',
    accountStatus: 'active',
    rejectedClaimCount: 0,
    flagged: false,
    createdAt: '2026-09-01T08:00:00Z',
  },
];

export const INITIAL_REPORTS: ItemReport[] = [];

export const INITIAL_MATCH_SUGGESTIONS: MatchSuggestion[] = [];

export const INITIAL_NOTIFICATIONS: Notification[] = [];

export const INITIAL_ADMIN_ACTIONS: AdminAction[] = [];
