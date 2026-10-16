/**
 * CampusFind Matching Engine Configuration
 * Section 6: Weights, Thresholds, Date Decay & Colour Adjacency
 */

export const MATCHING_WEIGHTS = {
  category: 35,
  description: 30,
  location: 20,
  date: 10,
  colour: 5,
} as const;

export const MATCHING_THRESHOLDS = {
  likelyMatch: 75.0,
  possibleMatch: 45.0,
} as const;

export const DATE_DECAY = {
  sameDay: 1.0,      // 0 days apart
  oneToThreeDays: 0.8, // 1-3 days apart
  fourToFourteenDays: 0.5, // 4-14 days apart
  overFourteenDays: 0.2, // > 14 days apart
} as const;

/**
 * Visually adjacent colour pairings get partial credit (2.5 out of 5)
 */
export const ADJACENT_COLOURS: Record<string, string[]> = {
  black: ['dark brown', 'navy', 'brown', 'charcoal'],
  'dark brown': ['black', 'brown'],
  brown: ['dark brown', 'tan', 'black'],
  navy: ['black', 'dark blue', 'blue'],
  grey: ['silver', 'charcoal', 'light grey'],
  silver: ['grey', 'white', 'platinum'],
  white: ['silver', 'cream', 'off-white'],
  gold: ['yellow', 'bronze', 'brass'],
};

/**
 * Allowed email domains
 * Includes VU domains and mock domain mode for demos / tests
 */
export const STAFF_EMAIL_DOMAIN = 'vu.edu.au';
export const STUDENT_EMAIL_DOMAINS = ['student.vu.edu.au', 'live.vu.edu.au'];

export const ALLOWED_EMAIL_DOMAINS = [
  STAFF_EMAIL_DOMAIN,
  ...STUDENT_EMAIL_DOMAINS,
  'campusfind.test', // Mock domain mode for testing
];

/**
 * Domains that use the simulated email flow (mock inbox, in-app confirmation).
 * All real university domains receive real emails sent directly by Firebase Authentication.
 */
export const SIMULATED_EMAIL_DOMAINS = ['campusfind.test'];

export const MAX_SIGNUP_ATTEMPTS = 5;
export const SIGNUP_LOCKOUT_HOURS = 24;
// Applies to simulated (@campusfind.test) emails only. Firebase controls expiry for real emails.
export const VERIFICATION_LINK_EXPIRY_HOURS = 24;
export const INACTIVITY_ARCHIVE_DAYS = 90;
export const DUPLICATE_WINDOW_DAYS = 3;
export const REJECTED_CLAIM_FLAG_THRESHOLD = 3;
