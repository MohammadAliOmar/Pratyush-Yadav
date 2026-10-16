# CampusFind: Admin-Controlled AI-Assisted Lost & Found Platform
**Institution:** Victoria University (Sydney Campus)  
**Unit:** NIT3003 / NIT3004 IT Capstone Project  
**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Google Cloud Firestore, Firebase Authentication, Vite  

---

## 1. Executive Summary & Aim

**CampusFind** is an admin-controlled, AI-assisted lost-and-found web platform tailored for university campuses. 

Unlike public bulletin boards or social media channels that risk fraudulent claims and privacy exposure, CampusFind adheres strictly to the **Australian Privacy Principles (OAIC)**:
* **Strict Privacy Boundary:** Students and staff report lost or found property and can **only view the status of their own reports**. They never see other students' reports, match candidates, or similarity scores.
* **Administrative Governance:** Only verified campus administrators have access to global inventory, candidate match queues, side-by-side comparisons, ownership verification question banks, and case closure workflows.
* **Deterministic Verification Before Handover:** Found items can **never** be marked as "Returned" directly; ownership verification must pass via category-specific checklists.

---

## 2. System Architecture & Folder Structure

All data access is decoupled behind an asynchronous service layer in `/src/services/*`, allowing seamless synchronization with Google Cloud Firestore without coupling UI components to the database implementation.

*Note: The application currently stores data in the browser (localStorage) and cloud sync is switched off until Firebase Authentication is connected.*

```
/
├── docs/
│   └── FIREBASE_MIGRATION.md            # Complete Firebase mapping & security spec
├── firebase-applet-config.json          # Live Firebase configuration (campusfind-ba71c)
├── firestore.rules                      # Deployed hardened ABAC security rules
├── firebase-blueprint.json              # Data models & schema definitions
├── src/
│   ├── config/
│   │   ├── matchingConfig.ts            # Scoring weights (35/30/20/10/5), decay curve, thresholds
│   │   └── verificationQuestions.ts     # Category-specific verification question bank
│   ├── types/
│   │   └── index.ts                     # TypeScript data contracts & enums
│   ├── services/
│   │   ├── firebase.ts                  # Firebase app, db, auth initialization & health probe
│   │   ├── firestoreSync.ts             # Cloud Firestore real-time persistence
│   │   ├── authService.ts               # Domain validation, rate limiting, single-use email verification
│   │   ├── reportService.ts             # Submit, edit locks, duplicate detection, admin search/filter
│   │   ├── matchService.ts              # Hybrid weighted scoring & candidate queue
│   │   ├── similarityEngine.ts          # Semantic description similarity (MiniLM placeholder)
│   │   ├── verificationService.ts       # Category verification checklists & high-value checks
│   │   ├── adminAccountService.ts       # Flagged account moderation (warnings, suspensions)
│   │   ├── notificationService.ts       # Admin-only alerts and abuse notifications
│   │   ├── auditService.ts              # Immutable audit logging (admin_actions)
│   │   ├── storage.ts                   # Local store, 90-day archive check, seed manager
│   │   └── seedData.ts                  # Clean start data: one administrator account
│   ├── components/
│   │   └── common/                      # StatusBadge, PerFactorScoreCard, Button, CategoryDropdown,
│   │                                    # VerificationChecklistItem, Navbar, SimulatedInboxModal
│   ├── screens/
│   │   ├── auth/                        # SignInSignUpScreen, EmailVerificationScreen
│   │   ├── student/                     # HomeScreen, ReportItemScreen, MyReportsScreen,
│   │   │                                # ReportStatusScreen, EditReportScreen, ProfileScreen
│   │   └── admin/                       # AdminDashboardScreen, MatchReviewQueueScreen,
│   │                                    # OwnershipVerificationScreen, SearchFilterReportsScreen,
│   │                                    # FlaggedAccountsScreen, ArchiveScreen, AuditLogScreen,
│   │                                    # SystemTestsScreen (interactive test runner)
│   ├── App.tsx                          # Role-based route guard & application controller
│   └── main.tsx                         # App bootstrap & connection verification probe
```

---

## 3. Matching Engine & Formula (Section 6)

The engine scores candidate pairs on a **0 to 100 scale**:

$$\text{Score} = \text{Category} (35) + \text{Description} (30) + \text{Location} (20) + \text{Date Decay} (10) + \text{Colour Adjacency} (5)$$

1. **Item Category (35%):** Exact match required via fixed dropdown (35.0 pts; otherwise 0).
2. **Description Similarity (30%):** $30.0 \times \text{computeDescriptionSimilarity}(\text{descA}, \text{descB}) \in [0.0, 1.0]$.
3. **Campus Location (20%):** Exact match on submitted campus area (20.0 pts; otherwise 0).
4. **Date Factor (10%):** Decay factor based on absolute days apart:
   * 0 days apart (same day): $1.0 \times 10 = 10.0$ pts
   * 1–3 days apart: $0.8 \times 10 = 8.0$ pts
   * 4–14 days apart: $0.5 \times 10 = 5.0$ pts
   * $>14$ days apart: $0.2 \times 10 = 2.0$ pts
5. **Colour Factor (5%):** Exact colour match = 5.0 pts. Visually adjacent colours (black $\leftrightarrow$ dark brown, black $\leftrightarrow$ navy, grey $\leftrightarrow$ silver) = 2.5 pts; otherwise 0.

### Thresholds:
* $\ge 75.0$: **Likely match**
* $45.0 - 74.9$: **Possible match**
* $< 45.0$: **Discarded** (never surfaced to avoid queue flooding)

### Benchmark Worked Example:
* **Lost Report:** Black leather wallet at Library on Monday (`2026-10-05`) with student card.
* **Found A:** Black leather wallet at Library on Monday $\rightarrow$ **97.0% (Likely match)**.
* **Found B:** Brown leather wallet with student ID at Library on Tuesday $\rightarrow$ **85.0% (Likely match)**.
* **Result:** Found A ranks 1st, Found B ranks 2nd in the Administrator Queue.

---

## 4. The Seven Business Rules

1. **No Manual "Returned" Status:** A found item cannot be set to "Returned" via dropdowns. Returned status can only be granted by completing and passing the **Ownership Verification Checklist**.
2. **Editing Lock:** Students cannot edit reports once ownership verification has begun (`locked: true`).
3. **Duplicate Detection:** Same user submitting the same item category & location within 3 days is flagged for admin review as duplicate (`flaggedDuplicate: true`).
4. **Closed Cases Read-Only:** Reports with status "Returned" or "Archived" cannot be edited or reopened.
5. **One-Time Claim:** Returning an item automatically dismisses all other pending matches for that item.
6. **Conflict of Interest:** Administrators cannot verify or process reports they submitted themselves.
7. **90-Day Auto-Archive:** Reports with no activity for 90 days automatically transition to "Archived" status and exit the active comparison pool.

---

## 5. Traceability Matrix

| Requirement | Description | Implementation File(s) |
|---|---|---|
| **FR-01** | Login, access control, university email check, rate-limiting | `src/services/authService.ts`, `src/screens/auth/*` |
| **FR-02** | Submit lost report (fields + photo alt-text) | `src/screens/student/ReportItemScreen.tsx`, `src/services/reportService.ts` |
| **FR-03** | Submit found report (handover details mandatory) | `src/screens/student/ReportItemScreen.tsx`, `src/services/reportService.ts` |
| **FR-04** | Own report status tracking (private, plain-English badges) | `src/screens/student/MyReportsScreen.tsx`, `src/screens/student/ReportStatusScreen.tsx` |
| **FR-05** | Admin dashboard, search, filter, and inventory oversight | `src/screens/admin/AdminDashboardScreen.tsx`, `SearchFilterReportsScreen.tsx` |
| **FR-06** | Hybrid weighted matching algorithm ($35+30+20+10+5$) | `src/services/matchService.ts`, `src/config/matchingConfig.ts` |
| **FR-07** | Admin match notification (only triggered for score $\ge 45$) | `src/services/notificationService.ts`, `src/services/matchService.ts` |
| **FR-08** | Structured category ownership verification & high-value check | `src/services/verificationService.ts`, `OwnershipVerificationScreen.tsx` |
| **FR-09** | Status lifecycle management | `src/types/index.ts`, `src/components/common/StatusBadge.tsx` |
| **FR-10** | Immutable administrative audit log | `src/services/auditService.ts`, `src/screens/admin/AuditLogScreen.tsx` |
| **NFR-01** | Security & role-based routing | `src/App.tsx`, `firestore.rules` |
| **NFR-02** | Privacy (APP compliant; no public found item browsing) | Core architecture & query isolation |
| **NFR-06** | Accessibility (WCAG 2.2 AA compliant, colour+text, required alt text) | `src/components/common/*`, form validation |

### Administrator Screens & Workflow
* **Administrative Control Dashboard (Section 4 Screen 1 / `AdminDashboardScreen.tsx`):**
  - **Metric Tiles:** Key operational tiles for New Matches Waiting (direct link to Match Review Queue), In Verification, Flagged Accounts, and Items Returned, alongside status breakdowns across the 7 report lifecycle states.
  - **Urgent Panel:** Shown directly beneath the metric tiles when open urgent reports exist. Displays the heading "Urgent reports" with an UrgentBadge showing the urgent count, item Lost/Found tag, item name, category, location, date, truncated urgent reason, reporter name and contact details (email and mobile), and current status badge. Clicking any row opens Search & Filter with that report pre-selected.
  - **Side-by-Side Lost and Found Lists:** Side-by-side grid (`lg:grid-cols-2`) showing the 6 newest open reports for Lost items (left) and Found items (right), prioritized with open urgent reports first. Each item row provides a 48px square thumbnail (photo or placeholder icon), item name with urgent badge, metadata line (`category · location · date`), reporter name, and status badge. Clicking any row opens Search & Filter with that report selected. Header links allow jumping to "View all lost reports" or "View all found reports" in Search & Filter.
  - **Admin Alerts:** Positioned full-width below the two lists, retaining system notifications, security warnings, and activity records.
* **Match Review Queue (`MatchReviewQueueScreen.tsx`):**
  - Candidate match suggestions are reviewed exclusively in the Match Review Queue (not on the dashboard). Displays side-by-side photo comparisons, submitter contact details, urgent prioritization, and full factor score breakdowns.

---

## 6. Accounts and Testing

The app starts with a clean database containing exactly **one** default administrator account:
* **Administrator:** `admin@campusfind.test` (Password: **`Admin123321`**)

To try the student side, register with any address ending in @campusfind.test and confirm it from the Simulated Inbox, or register with a real university address.

Test fixture data (a separate set of sample users, reports and matches, with the fixture password Campus#2026) lives only in src/config/testFixtures.ts. It is used by npm test and by the Algorithm Tests screen, which restores your own data when it finishes. It is never part of the running app's data.

On the first load after an update, a one-time data version check (key campusfind_data_version) clears older local data and signs out any old session.

### Email Verification & Password Reset Architecture
* **Real University Addresses (`vu.edu.au`, `student.vu.edu.au`, `live.vu.edu.au`):** Real university addresses receive a real email through Firebase Authentication and confirm on Firebase's standard confirmation page. Confirmation links never appear inside the app.
* **Simulated Test Addresses (`@campusfind.test`):** The "Yes, it's me / No, that's not me" page is used only for @campusfind.test test-inbox emails.
* **Link Lifetime:** Link lifetime for real emails is set by Firebase. The 24-hour verification link expiry rule applies strictly to `@campusfind.test` test emails.
* **Forgot Password:** Forgot password uses Firebase's reset email (`sendPasswordResetEmail`) with a continue URL fallback.

### Staff and student sign-up rules

| Domain | Role |
|---|---|
| `vu.edu.au` | Staff |
| `student.vu.edu.au`, `live.vu.edu.au` | Student |
| `campusfind.test` | Demo, either role |

The domain rule only prevents mistakes; the verification email is what proves ownership of the address.

### Account safety

* **Show/Hide password:** Every password input (sign-in, registration, and account deletion) includes an accessible eye toggle button (`aria-label="Show password" / "Hide password"`, `aria-pressed`, `type="button"`) allowing users to toggle between hidden and plain-text modes. An active Caps Lock indicator alerts users if Caps Lock is detected while typing.
* **Confirm password:** The registration form requires a matching "Confirm password" field with real-time feedback ("Passwords match" in green, "Passwords do not match" in red). The "Send Verification Email" button remains disabled until passwords match and satisfy complexity requirements (minimum 8 characters, at least 1 letter and 1 number).
* **Delete my account:** Available in the user Profile "Danger zone" with an explicit confirmation dialog requiring the user's current password.
  - **What it removes:** Permanently purges user account data (`storage.deleteUser`), their stored password hash, active session, rate-limiting counters (`clearAttempts`), notifications, and any simulated emails addressed to them. For real accounts, it re-authenticates with Firebase Authentication, deletes the user (`deleteUser`), and signs out.
  - **What it keeps:** Anonymises user reports via `reportService.anonymiseReportsForDeletedUser` (replaces `userName` with `"Deleted account"`, removes `userEmail`, auto-archives and locks open reports, while leaving closed reports read-only as per Business Rule 4). Administrative audit history is preserved for statutory compliance, and exactly ONE system audit-log entry (`"Account Deleted"`) is recorded containing only the user ID.
  - **Safeguards:** Deletion is strictly prevented for the administrator account, and any accounts with reports currently under "Pending Verification".
* **On-screen Mock / Simulated Inbox:** The on-screen Mock Inbox is strictly for `@campusfind.test` addresses. Real university addresses (`vu.edu.au`, `student.vu.edu.au`, `live.vu.edu.au`) never appear in the Mock Inbox; they receive authentic emails via Firebase Authentication to their actual university mailboxes. The Mock Inbox button is gone from the header (the test inbox opens from the sign-up confirmation for `@campusfind.test` addresses).

### Interactive System Test Suite
Algorithm Tests is admin-only and found in the user menu. Navigate to **Algorithm Tests** as an administrator to execute automated verification of:
1. Worked Example score calculation (Found A: 97.0 vs Found B: 85.0)
2. Threshold classification (Likely match $\ge 75$, Possible match $45-74$, Discarded $<45$)
3. Business Rules 1 through 7
4. Email abuse rate limiting (5 attempts lockout)

### Design tokens

* **Typography:**
  - Body & UI Sans: `Figtree Variable` (`@fontsource-variable/figtree`), fallback to `ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`.
  - Editorial & Heading Serif: `Source Serif 4 Variable` (`@fontsource-variable/source-serif-4`), fallback to `ui-serif, Georgia, "Times New Roman", serif`. Used for primary screen headings (`h1`, `.font-display`) with `-0.01em` letter tracking.
  - Tabular Numbers: `font-variant-numeric: tabular-nums` applied globally to tables and quantitative readouts.
* **Colour System:**
  - Extended calm blue brand scale (`--color-blue-50` through `--color-blue-950`), replacing high-saturation purples and indigos with cohesive academic navy tones.
  - Neutral slate background and surface scale (`--color-slate-50` through `--color-slate-950`).
  - Page canvas: Subtle linear top gradient (`linear-gradient(180deg, #e4ebf6 0, #f6f8fb 440px)`) with crisp white card containers.
* **Elevations & Borders:**
  - Soft, low-contrast shadows (`--shadow-xs`, `--shadow-sm`, `--shadow-md`) avoiding harsh card drop shadows.
  - 1px hairline borders (`border-slate-200`) providing calm definition across cards and tables.
* **Accessibility & Motion:**
  - High-contrast focus rings: `:focus-visible { outline: 2px solid var(--color-blue-500); outline-offset: 2px; }`.
  - Motion reduction: `@media (prefers-reduced-motion: reduce)` dampens animations and transitions to near-zero duration.

---

## 7. Development & Deployment

```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Run TypeScript compilation and build
npm run build

# Run linting checks
npm run lint
```
