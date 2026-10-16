/**
 * CampusFind Data Types
 * Aligned with NIT3003 Assessment 2 Specification & Future Firestore Schema
 */

export type UserRole = 'student' | 'staff' | 'admin';
export type UserStatus = 'pending' | 'active';
export type AccountStatus = 'active' | 'suspended';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  accountStatus: AccountStatus;
  rejectedClaimCount: number;
  flagged: boolean;
  flagReason?: string;
  createdAt: string;
}

export type ReportType = 'lost' | 'found';

export type ReportStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Possible Match'
  | 'Pending Verification'
  | 'Returned'
  | 'Rejected'
  | 'Archived';

export const ITEM_CATEGORIES = [
  'Laptop / tablet',
  'Phone',
  'Student ID / cards',
  'Wallet',
  'Bag / backpack',
  'Keys',
  'Headphones / earbuds',
  'Books / stationery',
  'Clothing',
  'Other',
] as const;

export type ItemCategory = typeof ITEM_CATEGORIES[number];

export const CAMPUS_LOCATIONS = [
  'Library (Level 2)',
  'Student Lounge (Level 4)',
  'Cafeteria (Level 4)',
  'Lecture Theatre 1 (Level 3)',
  'Lecture Theatre 2 (Level 3)',
  'Computer Lab 2.04 (Level 2)',
  'Computer Lab 2.08 (Level 2)',
  'Reception / Security Desk (Level 1)',
  'Main Entrance & Foyer (Level 1)',
  'Study Pods (Level 5)',
  'Outdoor Courtyard',
  'Other Campus Area',
] as const;

export type CampusLocation = typeof CAMPUS_LOCATIONS[number];

export interface ItemReport {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  type: ReportType;
  itemName: string;
  category: ItemCategory;
  colour: string;
  location: CampusLocation | string;
  date: string; // YYYY-MM-DD
  description: string;
  whereItemIs?: string; // For found items: e.g. "Handed to Level 1 Security"
  status: ReportStatus;
  flaggedDuplicate: boolean;
  locked: boolean; // Cannot edit once verification starts or closed
  createdAt: string;
  lastActivityAt: string;
  imageUrl?: string;
  imageAltText?: string;
  // Scalability: description similarity input tokens / cache stored at submission
  descriptionTokens?: string[];
  // If matched or verification in progress
  matchedWithReportId?: string;
  verificationNotes?: string;
  // Contact details & Urgency (Admin only access)
  contactEmail?: string;
  contactPhone?: string;
  urgent?: boolean;
  urgentReason?: string;
  /** Shared mode: set by the administrator's browser once the matching engine has checked this report. */
  matchCheckedAt?: string;
}

export interface MatchFactorBreakdown {
  categoryScore: number;   // Max 35
  descriptionScore: number;// Max 30
  locationScore: number;   // Max 20
  dateScore: number;       // Max 10
  colourScore: number;     // Max 5
  totalScore: number;      // Max 100
}

export type MatchLabel = 'Likely match' | 'Possible match';

export interface MatchSuggestion extends MatchFactorBreakdown {
  id: string;
  lostReportId: string;
  foundReportId: string;
  label: MatchLabel;
  status: 'pending' | 'dismissed' | 'confirmed';
  createdAt: string;
  lostReport?: ItemReport;
  foundReport?: ItemReport;
}

export interface Notification {
  id: string;
  audience: 'admin';
  type: 'possible_match' | 'report_review' | 'account_flagged' | 'abuse_alert';
  message: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  adminName: string;
  action:
    | 'Review Match'
    | 'Start Verification'
    | 'Verification Passed'
    | 'Verification Failed'
    | 'Status Change'
    | 'Returned Item'
    | 'Case Closed'
    | 'Account Flagged'
    | 'Account Suspended'
    | 'Account Reinstated'
    | 'Formal Warning'
    | 'Clear Flag'
    | 'Dismiss Match'
    | 'Account Deleted'
    | 'Report Deleted'
    | 'Urgent Cleared';
  reportId?: string;
  targetUserId?: string;
  details: string;
  verificationLog?: {
    question: string;
    matched: boolean;
    notes?: string;
  }[];
  secondDetailChecked?: boolean;
  outcome?: string;
  createdAt: string;
}

export interface SignupAttempt {
  email: string;
  count: number;
  lockedUntil?: string; // ISO date string
}

export interface SimulatedEmail {
  id: string;
  recipientEmail: string;
  subject: string;
  token: string;
  verifyUrl: string;
  createdAt: string;
  used: boolean;
}
