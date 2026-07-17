# Project Overview — USMS Admin V2

## Purpose

USMS Admin V2 (Universal School Management System) is a **school ERP admin panel** for school principals to manage day-to-day operations: students, teachers, fees, attendance, notices, timetables, promotions, and academic year rollovers. A separate SuperAdmin layer allows a platform operator to manage multiple schools across tenants.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 19 |
| Build tool | Vite | 7 |
| Styling | Tailwind CSS | v4 |
| UI primitives | Radix UI (shadcn/ui style) | latest |
| Backend / DB | Firebase | v12 |
| Auth | Firebase Auth | v12 |
| Database | Firestore | v12 |
| File storage | Firebase Storage | v12 |
| Routing | React Router DOM | v7 |
| Icons | lucide-react | latest |
| PDF export | jspdf | latest |
| Hosting | Firebase Hosting | site: `usms-v2` |
| Functions | Firebase Cloud Functions | Node.js (region: `us-central1`) |

---

## Folder Structure

```
USMS_Admin_V2/
├── firebase.json                  # Firebase config (hosting, functions, indexes)
├── firestore.indexes.json         # Firestore composite indexes
├── backend/
│   └── functions/                 # Cloud Functions source (not in frontend)
└── frontend/
    ├── vite.config.js
    └── src/
        ├── main.jsx               # React entry point
        ├── config/
        │   └── firebase.js        # Firebase SDK init (auth + db exports)
        ├── Routes/
        │   ├── AppRoute.jsx       # BrowserRouter + all routes
        │   ├── ProtectedRoute.jsx # Guards principal routes (localStorage check)
        │   └── SuperAdminRoute.jsx
        ├── Pages/
        │   ├── auth/              # LoginPage.jsx
        │   ├── dashboard/         # Dashboard.jsx
        │   ├── students/          # Students.jsx, StudentProfile.jsx
        │   ├── teachers/          # Teachers.jsx, TeacherProfile.jsx
        │   ├── attendance/        # Attendance.jsx
        │   ├── notices/           # NoticeManagement.jsx
        │   ├── fees/              # FeesV2.jsx
        │   ├── alumni/            # Alumni.jsx
        │   ├── settings/          # Settings.jsx
        │   ├── timetable/         # Timetable.jsx
        │   ├── books/             # Books.jsx
        │   ├── exams/             # Exams.jsx
        │   ├── reports/           # Reports.jsx
        │   ├── vehicle/           # VehicleTracking.jsx
        │   ├── promotion/         # Promotion.jsx, PromotionBatchDetails.jsx
        │   ├── rollover/          # AcademicYearRollover.jsx
        │   └── superadmin/        # SuperAdminDashboard.jsx, SuperAdminSchools.jsx,
        │                          # SuperAdminCreateSchool.jsx, SuperAdminSchoolDetail.jsx
        ├── components/
        │   ├── ui/                # Button, Card, Input, Dialog, Badge, Select,
        │   │                      # Tabs, Alert, Checkbox, Toast, ConfirmDialog, Spinner, ...
        │   ├── Layout/            # AdminLayout.jsx, SuperAdminLayout.jsx,
        │   │                      # Sidebar.jsx, Header.jsx
        │   ├── students/          # AddStudentDialog, EditStudentDialog,
        │   │                      # DeleteStudentConfirmDialog, BulkDeleteConfirmDialog
        │   ├── teachers/          # teacher-specific dialogs
        │   ├── attendance/        # attendance filters, calendar, table
        │   ├── fees/              # AcademicYearDialog, FeeStructuresDialog,
        │   │                      # CreateDraftProfileDialog, EditDraftProfileDialog,
        │   │                      # CollectPaymentDialog, CancelPaymentDialog,
        │   │                      # ReceiptDialog, FeeRevisionSection
        │   ├── promotion/         # PromotionWizard, PromotionConfigStep,
        │   │                      # PromotionStudentStep, PromotionPreviewStep
        │   └── settings/          # ClassManagement, SubjectManagement,
        │                          # TimePeriodManagement, TeacherAssignment
        ├── services/              # Firestore service layer
        │   ├── student.service.js
        │   ├── teacher.service.js
        │   ├── class.service.js
        │   ├── notice.service.js
        │   ├── alumni.service.js
        │   └── fees.service.js    # Legacy fee ledger (studentFeeYears + feePayments)
        ├── hooks/
        │   ├── useSchoolSettings.js  # Reads school's feeAcademicYear, feeSchedule, holidayMonths
        │   └── useSchoolPlan.js      # Reads school's plan field (free/premium)
        ├── fees-v2/               # Fee Management V2 module
        │   ├── index.js           # Barrel export
        │   ├── constants/
        │   │   ├── collections.js # COLLECTIONS frozen object
        │   │   └── enums.js       # All status/type enums
        │   ├── services/          # academicYear, feeProfile, feeInstallment,
        │   │                      # feePayment, feeRevision, feeStructure,
        │   │                      # paymentAllocation, paymentCancellation,
        │   │                      # feeRevisionPersistence services
        │   ├── feeScheduleGenerator.js   # Pure: generate installment schedule
        │   ├── paymentAllocationEngine.js # Pure: build allocation plan
        │   ├── feeRevisionEngine.js       # Pure: compute revision plan
        │   ├── receiptGenerator.js        # Pure: build receipt model
        │   ├── utils/
        │   │   └── receiptNumber.js       # Receipt number generator (counter-backed)
        │   └── validation/        # Zod/manual validators for each entity
        ├── promotion/             # Promotion module
        │   ├── index.js           # Barrel export
        │   ├── constants/         # enums, collections
        │   ├── services/          # promotionBatch, studentPromotion,
        │   │                      # promotionPersistence, promotionExecution
        │   ├── promotionEngine.js # Pure: build promotion/graduation plan
        │   └── utils/
        │       └── promotionBalanceUtils.js
        ├── rollover/              # Academic Year Rollover module
        │   ├── index.js
        │   ├── rolloverEngine.js          # Pure: build RolloverPlan
        │   └── rolloverExecution.service.js  # Persists RolloverPlan to Firestore
        └── data/                  # Static/seed data files
```

---

## High-Level Architecture

```
Browser (React SPA)
        │
        ▼
Firebase Auth  ──── signInWithEmailAndPassword ───▶  principals / superadmins collections
        │
        ▼
ProtectedRoute / SuperAdminRoute
  reads localStorage: principalId, principalSchoolId
        │
        ▼
React Pages & Components
        │
        ├── Direct Firestore SDK calls (most read/query operations)
        │
        └── Firebase Cloud Functions (HTTP) for sensitive writes:
              createStudent, deleteStudent, createTeacher, deleteTeacher,
              changeteacherpassword, createNotice, deleteNotice
```

### Session Storage

After login, the following keys are stored in `localStorage`:

| Key | Value |
|---|---|
| `principalId` | Firebase Auth UID of the logged-in principal |
| `principalSchoolId` | Firestore document ID of the principal's school |
| `principalName` | Display name |
| `isSuperAdmin` | `"true"` if SuperAdmin |

---

## User Roles

### 1. Principal
- Single-school admin
- Authenticated via `principals` Firestore collection (`isActive: true` required)
- After login: redirected to `/dashboard`
- Can manage: students, teachers, classes, subjects, fees, attendance, timetable, notices, books, exams, alumni, promotions, rollover, reports, settings

### 2. SuperAdmin
- Platform operator
- Authenticated via `superadmins` Firestore collection
- After login: redirected to `/superadmin`
- Can manage: all schools (create, view, configure)
- Separate layout (SuperAdminLayout)

---

## Modules Overview

| Module | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | School summary stats, recent admissions, recent notices |
| Students | `/students`, `/students/:id` | CRUD student records, profile view |
| Teachers | `/teachers`, `/teachers/:id` | CRUD teacher records, profile view |
| Attendance | `/attendance` | Mark and view student attendance |
| Fee Management V2 | `/fees-v2` | Academic years, fee profiles, installments, payments, revisions |
| Notices | `/notices` | Post and manage school notices |
| Alumni | `/alumni` | View graduated/alumni students |
| Settings | `/settings` | Manage classes, subjects, timetable periods, teacher assignments |
| Timetable | `/timetable` | Class timetable view |
| Books | `/books` | Library/book management (placeholder) |
| Exams | `/exams` | Exam management (placeholder) |
| Vehicle Tracking | `/vehicle` | Vehicle tracking (placeholder) |
| Reports | `/reports` | Fee and academic reports (placeholder) |
| Promotion | `/promotion`, `/promotion/:batchId` | Bulk class promotion and graduation batches |
| Academic Year Rollover | `/academic-rollover` | Year-end rollover: activate next year, close current |
| SuperAdmin | `/superadmin/**` | Platform-level school management |

---

## School Plan Gating

The `schools` collection has a `plan` field (`"free"` or `"premium"`). The `useSchoolPlan` hook reads this field and exposes `isPremium` / `isFree` booleans to gate premium features in the UI.
