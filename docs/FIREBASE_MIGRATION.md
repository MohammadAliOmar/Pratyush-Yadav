# CampusFind Firebase Migration Blueprint
**Document Version:** 1.0  
**Project:** Victoria University (NIT3003 / NIT3004 IT Capstone)

This document defines the zero-friction migration path from the CampusFind React/TypeScript in-memory service layer to Google Firebase (Firebase Authentication, Cloud Firestore, Cloud Storage, and Cloud Functions).

---

## 1. Architecture Overview

All UI components and screens interact exclusively with `/src/services/*`. None of the components read or write persistent storage directly. In this migration, each service file is re-linked from `localStorage` / `appStorage` to the official Firebase SDK (`firebase/auth`, `firebase/firestore`, `firebase/storage`, `firebase/functions`).

```
+-------------------------------------------------------------+
|                 UI Screens & React Components               |
+-------------------------------------------------------------+
                             |
                             v
+-------------------------------------------------------------+
|             CampusFind Service Layer (/src/services)         |
|  - authService.ts        - reportService.ts                 |
|  - matchService.ts       - verificationService.ts           |
|  - notificationService.ts - auditService.ts                  |
+-------------------------------------------------------------+
                             |
         [Current: localStorage]   --> [Production: Firebase]
                             |
      +----------------------+-----------------------+
      |                      |                       |
      v                      v                       v
Firebase Auth        Cloud Firestore          Cloud Functions
(Email/Password,    (Collections: users,     (MiniLM-L6-v2 Embeddings,
 Custom Claims:      item_reports,            Date Decay, Matching,
 role=student|       match_suggestions,       90-Day Archiving Cron)
 staff|admin)        notifications,
                     admin_actions)
```

---

## 2. Authentication Mapping (`authService.ts`)

| In-Memory Property / Action | Firebase Equivalent | Details |
|---|---|---|
| User sign-up & pending link | `createUserWithEmailAndPassword()` + `sendEmailVerification()` | Native Firebase single-use link verifies email ownership. |
| University domain enforcement | Cloud Functions `beforeUserCreated` blocking function | Validates that email ends in `@vu.edu.au`, `@student.vu.edu.au`, or `@live.vu.edu.au`. |
| Role assignment | Firebase Auth Custom Claims (`admin`, `staff`, `student`) | Admin accounts cannot self-register; provisioned via Firebase Admin SDK CLI. |
| Account suspension | Cloud Function `beforeUserSignedIn` | Blocks token generation if user document has `accountStatus == 'suspended'`. |

---

## 3. Firestore Collections Schema (`/src/types/index.ts`)

### `users/{userId}`
- `id`: string (matches Firebase Auth `uid`)
- `name`: string
- `email`: string
- `role`: `'student' | 'staff' | 'admin'`
- `status`: `'pending' | 'active'`
- `accountStatus`: `'active' | 'suspended'`
- `rejectedClaimCount`: number
- `flagged`: boolean
- `flagReason`: string (optional)
- `createdAt`: timestamp

### `item_reports/{reportId}`
- `id`: string
- `userId`: string
- `userName`: string
- `userEmail`: string
- `type`: `'lost' | 'found'`
- `itemName`: string
- `category`: `'Laptop / tablet' | 'Phone' | ...`
- `colour`: string
- `location`: string
- `date`: string (ISO `YYYY-MM-DD`)
- `description`: string
- `whereItemIs`: string (required if `type == 'found'`)
- `status`: `'Submitted' | 'Under Review' | 'Possible Match' | 'Pending Verification' | 'Returned' | 'Rejected' | 'Archived'`
- `flaggedDuplicate`: boolean
- `locked`: boolean
- `imageUrl`: string (download URL from Cloud Storage `item_images/{reportId}`)
- `imageAltText`: string (required if `imageUrl` exists)
- `descriptionEmbedding`: array of floats (384-dimensional vector from all-MiniLM-L6-v2)
- `createdAt`: timestamp
- `lastActivityAt`: timestamp

### `match_suggestions/{matchId}`
- `id`: string
- `lostReportId`: string
- `foundReportId`: string
- `totalScore`: number
- `categoryScore`: number (35)
- `descriptionScore`: number (30)
- `locationScore`: number (20)
- `dateScore`: number (10)
- `colourScore`: number (5)
- `label`: `'Likely match' | 'Possible match'`
- `status`: `'pending' | 'dismissed' | 'confirmed'`
- `createdAt`: timestamp

### `notifications/{notificationId}`
- `id`: string
- `audience`: `'admin'` (admins only)
- `type`: `'possible_match' | 'report_review' | 'account_flagged' | 'abuse_alert'`
- `message`: string
- `relatedId`: string
- `read`: boolean
- `createdAt`: timestamp

### `admin_actions/{actionId}` (Immutable Audit Log)
- `id`: string
- `adminId`: string
- `adminName`: string
- `action`: string
- `reportId`: string (optional)
- `targetUserId`: string (optional)
- `details`: string
- `verificationLog`: array of question/answer objects
- `secondDetailChecked`: boolean (optional)
- `outcome`: string
- `createdAt`: timestamp

---

## 4. Cloud Functions Mapping (`matchService.ts` & Backend Rules)

1. **`onReportCreated` (Firestore Trigger):**
   - Extracts description text.
   - Generates 384-dimensional sentence embedding using pretrained `all-MiniLM-L6-v2` container.
   - Performs pre-filtered indexed query for opposite report type in same category where status in `['Submitted', 'Under Review', 'Possible Match']`.
   - Computes weighted score using exact formula (category 35 + description 30 + location 20 + date 10 + colour 5).
   - If score >= 45, writes to `match_suggestions` collection.
   - If match found, creates notification in `notifications` for admin users only.

2. **`checkInactivityArchiving` (Scheduled Cron Trigger):**
   - Runs daily. Queries active reports with `lastActivityAt < now - 90 days`.
   - Updates status to `Archived` and sets `locked: true`.

---

## 5. Firestore Security Rules Specification (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && request.auth.token.role == 'admin';
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Users collection: users can read their own profile; admins can read all
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow write: if isAdmin();
    }

    // Item reports: users can read and write only their own reports; admins can read and update all
    match /item_reports/{reportId} {
      allow read: if isAdmin() || (isAuthenticated() && resource.data.userId == request.auth.uid);
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      // Editing lock: users cannot update once locked is true or status is Pending Verification / Returned
      allow update: if isAdmin() || (
        isOwner(resource.data.userId) &&
        resource.data.locked == false &&
        resource.data.status != 'Pending Verification' &&
        resource.data.status != 'Returned' &&
        resource.data.status != 'Archived'
      );
      allow delete: if false; // Reports are never hard-deleted
    }

    // Match suggestions: STRICTLY ADMIN ONLY (NFR-02 Privacy & APP compliance)
    match /match_suggestions/{matchId} {
      allow read, write: if isAdmin();
    }

    // Notifications: STRICTLY ADMIN ONLY
    match /notifications/{notifId} {
      allow read, write: if isAdmin();
    }

    // Admin Actions: Append-only for admins, no edits or deletions permitted
    match /admin_actions/{actionId} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update, delete: if false; // Immutable audit log (NFR-08)
    }
  }
}
```
