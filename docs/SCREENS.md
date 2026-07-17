# Screens

Every route in the application, with its components, services, Firestore collections, and navigation targets.

---

## Public Routes

### `/` (root)
- **Behavior**: Redirects immediately to `/login`.
- **Component**: `AppRoute.jsx` inline redirect.

### `/login`
- **Component**: `Pages/auth/LoginPage.jsx`
- **Services**:
  - Firebase Auth `signInWithEmailAndPassword`
  - Direct Firestore reads on `superadmins/{uid}` and `principals/{uid}`
- **Collections**: `superadmins`, `principals`
- **On success**:
  - SuperAdmin → `localStorage.isSuperAdmin = "true"` + navigate `/superadmin`
  - Principal → stores `principalId`, `principalSchoolId`, `principalName` in `localStorage` + navigate `/dashboard`
- **Navigation**: `/dashboard` (principal), `/superadmin` (superadmin)

---

## Principal Routes (guarded by `ProtectedRoute`)

All principal routes check `localStorage.principalId` + `localStorage.principalSchoolId`. Redirect to `/login` if either is missing.

---

### `/dashboard`
- **Component**: `Pages/dashboard/Dashboard.jsx`
- **Services**:
  - `getStudentsBySchool(schoolId)` — student list + recent admissions
  - `getRecentNoticesBySchool(schoolId)` — 4 recent notices
  - `getCountFromServer` — teachers, classes, subjects counts
  - `getDoc schools/{schoolId}` — school name
- **Collections**: `students`, `notices`, `teachers`, `classes`, `subjects`, `schools`
- **Navigation**: Quick-action buttons to `/students`, `/teachers`, `/fees-v2`, `/notices`

---

### `/students`
- **Component**: `Pages/students/Students.jsx`
- **Services**:
  - `getStudentsBySchool(schoolId)`
  - `getClassesBySchool(schoolId)`
  - `createStudent()` (CF)
  - `updateStudent()`
  - `deleteStudent()` (CF)
- **Collections**: `students`, `classes`
- **Dialogs**: `AddStudentDialog`, `EditStudentDialog`, `DeleteStudentConfirmDialog`, `BulkDeleteConfirmDialog`
- **Navigation**: Click row → `/students/:studentId`

---

### `/students/:studentId`
- **Component**: `Pages/students/StudentProfile.jsx`
- **Services**:
  - `student.service.js` (getStudentById or from list)
  - `fees.service.js` (getActiveStudentFeeYear, getFeePaymentsByStudent)
- **Collections**: `students`, `studentFeeYears`, `feePayments`
- **Navigation**: Back to `/students`

---

### `/teachers`
- **Component**: `Pages/teachers/Teachers.jsx`
- **Services**:
  - `getTeachersBySchool(schoolId)`
  - `createTeacher()` (CF)
  - `deleteTeacher()` (CF)
- **Collections**: `teachers`
- **Navigation**: Click row → `/teachers/:teacherId`

---

### `/teachers/:teacherId`
- **Component**: `Pages/teachers/TeacherProfile.jsx`
- **Services**:
  - `getTeacherById(teacherId)`
  - `updateTeacher()`
  - `changeTeacherPassword()` (CF)
- **Collections**: `teachers`, `teacherClassSubjects`
- **Navigation**: Back to `/teachers`

---

### `/attendance`
- **Component**: `Pages/attendance/Attendance.jsx`
- **Services**: Attendance service (collection: `attendance`)
- **Collections**: `attendance`, `students`, `classes`
- **Components**: `AttendanceFilters`, `AttendanceCalendar`, `AttendanceTable`

---

### `/timetable`
- **Component**: `Pages/timetable/Timetable.jsx`
- **Services**: `timetable.service.js`, `classTimetable.service.js`
- **Collections**: `timetables` (or `classTimetables`), `timePeriods`, `classes`

---

### `/fees-v2`
- **Component**: `Pages/fees/FeesV2.jsx`
- **Services** (from `fees-v2` barrel):
  - `getAcademicYearsBySchool`, `getActiveAcademicYear`, `activateAcademicYear`, `closeAcademicYear`, `createAcademicYear`, `deleteAcademicYear`
  - `getAllFeeStructuresOrdered`, `createFeeStructure`, `updateFeeStructure`, `deactivateFeeStructure`
  - `getProfilesBySchoolAndYear`, `createDraftProfile`, `updateDraftProfile`, `deleteDraftProfile`, `closeProfile`
  - `createInstallments`, `getInstallments`
  - `createPayment`, `getPaymentsByStudent`
  - `cancelPayment` (from paymentCancellation.service.js)
  - `createRevision`, `submitRevision`, `approveRevision`, `rejectRevision`, `cancelRevision`, `applyRevisionPlan`
  - `getStudentsBySchool`, `getClassesBySchool`
  - Direct `getDoc schools/{schoolId}` for school settings
- **Collections**: `academicYears`, `feeStructures`, `studentFeeProfiles`, `feeInstallments`, `feePayments`, `paymentAllocations`, `feeRevisions`, `students`, `classes`, `schools`
- **Dialogs/Components**:
  - `AcademicYearDialog` — create/manage academic years
  - `FeeStructuresDialog` — manage fee structure templates
  - `CreateDraftProfileDialog` — create new draft fee profile for a student
  - `EditDraftProfileDialog` — edit variable fees + adjustments on a DRAFT profile
  - `CollectPaymentDialog` — record payment against an ACTIVE profile
  - `CancelPaymentDialog` — cancel a confirmed payment
  - `ReceiptDialog` — view/print payment receipt
  - `FeeRevisionSection` — inline section within FeeProfileDetail for revision workflow
  - `FeeProfileDetail` — expandable row showing line items, installments, payments, revisions

**UI Layout**:
- Year selector (top)
- Filter bar (student name, class, profile status)
- Table of profiles; each row expandable
- Per-profile: installment table, payment history, revision management

---

### `/alumni`
- **Component**: `Pages/alumni/Alumni.jsx`
- **Services**:
  - `getAlumni(schoolId)`, `getAlumniByYear()`, `getAlumniByClass()`, `searchAlumni()`
- **Collections**: `students` (filtered by isGraduated==true or status=="alumni")
- **Navigation**: Click alumni → view profile (may navigate to `/students/:studentId`)

---

### `/books`
- **Component**: `Pages/books/Books.jsx`
- **Status**: Placeholder / partial implementation

---

### `/exams`
- **Component**: `Pages/exams/Exams.jsx`
- **Status**: Placeholder / partial implementation

---

### `/vehicle`
- **Component**: `Pages/vehicle/VehicleTracking.jsx`
- **Status**: Placeholder / partial implementation

---

### `/promotion`
- **Component**: `Pages/promotion/Promotion.jsx`
- **Services**:
  - `getBatches(schoolId)` from promotion barrel
  - `getClassesBySchool(schoolId)`
- **Collections**: `promotionBatches`, `classes`
- **Dialogs**: `PromotionWizard` (3-step wizard)
  - **Step 1 — Config**: Choose type (CLASS_PROMOTION or GRADUATION), source class, destination class, academic years, carry options (carryFeeBalance, carryVariableFees).
  - **Step 2 — Students**: Select which students from source class to include. Shows current fee balances.
  - **Step 3 — Preview**: Runs `buildPromotionPlan()` / `buildGraduationPlan()` per student. Displays planned changes. `createBatch()` + `createPromotion()` on confirm.
- **Navigation**: Click batch → `/promotion/:batchId`

---

### `/promotion/:batchId`
- **Component**: `Pages/promotion/PromotionBatchDetails.jsx`
- **Services**:
  - `getBatch(batchId)`, `getPromotionsByBatch(batchId)`
  - `executeBatch(batchId, executedBy, { onProgress })` — execution with live progress
  - `retryFailed(batchId, promotionIds, executedBy)`
  - `cancelBatch(batchId, cancelledBy)`
  - `getProfile(profileId)`, `getInstallments(profileId)` — for outstanding balance check
  - `waiverInstallmentsForBatch()` — waive dues before graduation
  - `getClassesBySchool()`
- **Collections**: `promotionBatches`, `studentPromotions`, `studentFeeProfiles`, `feeInstallments`, `students`, `classes`
- **Components**:
  - `BatchSummaryCard` — metadata + status + counters
  - `StudentRow` — one row per StudentPromotion, expandable
  - `ExpandedDetail` — plan details, error messages, new profile link
  - `GraduationOutstandingDialog` — 3-choice dialog for outstanding dues (collect / waive / proceed)
- **Actions**:
  - Execute batch — calls `executeBatch()`, shows progress dialog
  - Retry failed — calls `retryFailed()`
  - Cancel batch — calls `cancelBatch()`
- **Navigation**: Back to `/promotion`

---

### `/academic-rollover`
- **Component**: `Pages/rollover/AcademicYearRollover.jsx`
- **Services**:
  - `getActiveAcademicYear(schoolId)`, `getAcademicYearsBySchool(schoolId)` — from fees-v2
  - `getBatches(schoolId)`, `getPromotionsByBatch(batchId)` — from promotion barrel
  - `buildRolloverPlan()` (pure engine) — from rollover barrel
  - `executeRollover(plan)` — from rollover barrel
  - `getClassesBySchool()`, `getStudentsBySchool()`
- **Collections**: `academicYears`, `promotionBatches`, `studentPromotions`, `studentFeeProfiles`, `students`, `classes`
- **UI Sections**:
  - Pre-flight checklist (5 items, all must be green to enable Execute)
  - Preview tabs:
    - "Student Updates" — table of students being promoted with old→new class
    - "Fee Profiles" — profiles being closed, new draft profiles created
    - "Graduation" — students being graduated
  - Execute button (disabled until all checks pass)
  - Progress dialog (per-student as rollover runs)
  - Success dialog with summary (promoted count, graduated count, failed count)

---

### `/reports`
- **Component**: `Pages/reports/Reports.jsx`
- **Status**: Placeholder / partial implementation

---

### `/notices`
- **Component**: `Pages/notices/NoticeManagement.jsx`
- **Services**:
  - `createNotice()` (CF), `deleteNotice()` (CF)
  - `getRecentNoticesBySchool(schoolId)`, `uploadNoticeAttachment()`
- **Collections**: `notices`
- **Firebase Storage**: Notice attachments

---

### `/settings`
- **Component**: `Pages/settings/Settings.jsx`
- **Sub-components**:
  - `ClassManagement`: `createClass()`, `getClassesBySchool()`, `toggleClassStatus()`, `deleteClass()`
  - `SubjectManagement`: `addSubject()`, `getSubjectsBySchool()`, `toggleSubjectStatus()`, `deleteSubject()`
  - `ClassSubjectAssignment`: `getClassSubjects()`, `addSubjectToClass()`, `removeSubjectFromClass()`
  - `TeacherAssignment`: `getTeacherAssignments()`, `assignTeacher()`, `removeTeacherAssignment()`
  - `TimePeriodManagement`: `getTimePeriodsBySchool()`, `addTimePeriod()`, `updateTimePeriod()`, `deleteTimePeriod()`
- **Collections**: `classes`, `subjects`, `classSubjects`, `teacherClassSubjects`, `timePeriods`

---

## SuperAdmin Routes (guarded by `SuperAdminRoute`)

### `/superadmin`
- **Component**: `Pages/superadmin/SuperAdminDashboard.jsx`
- **Services**: `getPlatformStats()`, `getRecentSchools()`
- **Collections**: `schools`, `students`, `teachers`

### `/superadmin/schools`
- **Component**: `Pages/superadmin/SuperAdminSchools.jsx`
- **Services**: `getAllSchools()`
- **Collections**: `schools`
- **Navigation**: Click school → `/superadmin/schools/:schoolId`; "New" button → `/superadmin/schools/new`

### `/superadmin/schools/new`
- **Component**: `Pages/superadmin/SuperAdminCreateSchool.jsx`
- **Services**: `createSchool()` (CF)
- **Navigation**: On success → `/superadmin/schools`

### `/superadmin/schools/:schoolId`
- **Component**: `Pages/superadmin/SuperAdminSchoolDetail.jsx`
- **Services**:
  - `getSchool(schoolId)`, `getPrincipalBySchool(schoolId)`, `getSchoolEntityCounts(schoolId)`
  - `updateSchoolSubscription(schoolId, { plan, planExpiresAt, isActive })`
  - `deleteSchool(schoolId)` (CF)
- **Collections**: `schools`, `principals`, `students`, `teachers`
