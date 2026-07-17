# Features

## 1. Authentication & Role-Based Access

**Description**: Email/password login via Firebase Auth. Post-login, the system checks the `superadmins` collection first (SuperAdmin path), then the `principals` collection (Principal path). Session is stored in `localStorage`.

**Screens**: `LoginPage.jsx` (`/login`)

**Services called**: Firebase Auth (`signInWithEmailAndPassword`), direct Firestore reads on `superadmins` and `principals`

**Collections**: `superadmins`, `principals`

**Status**: Implemented

---

## 2. Dashboard

**Description**: Overview page showing total students, teachers, classes, and subjects. Displays 4 recent admissions and 4 recent notices. Provides quick-action buttons to major sections.

**Screens**: `Dashboard.jsx` (`/dashboard`)

**Services called**:
- `getStudentsBySchool()` from `student.service.js`
- `getRecentNoticesBySchool()` from `notice.service.js`
- Direct Firestore `getCountFromServer` for teachers, classes, subjects counts
- Direct Firestore `getDoc` for school name

**Collections**: `students`, `notices`, `teachers`, `classes`, `subjects`, `schools`

**Status**: Implemented

---

## 3. Student Management

**Description**: Full CRUD for student records. List view with class filter and name search. Sorted by roll number. Supports bulk selection and bulk delete. Individual student profile page.

**Screens**: `Students.jsx` (`/students`), `StudentProfile.jsx` (`/students/:studentId`)

**Services called**:
- `getStudentsBySchool()`, `createStudent()`, `updateStudent()`, `deleteStudent()` from `student.service.js`
- `getClassesBySchool()` from `class.service.js`

**Dialogs**: `AddStudentDialog`, `EditStudentDialog`, `DeleteStudentConfirmDialog`, `BulkDeleteConfirmDialog`

**Collections**: `students`, `classes`

**Cloud Functions**:
- `createStudent` — `https://createstudent-z4likafkwq-uc.a.run.app/`
- `deleteStudent` — `https://deletestudent-z4likafkwq-uc.a.run.app`

**Status**: Implemented

---

## 4. Student Profile

**Description**: Detailed view of an individual student. Shows personal info, class, contact details. Likely includes fee history (via StudentProfile page referencing StudentFeeYear data).

**Screens**: `StudentProfile.jsx` (`/students/:studentId`)

**Services called**: `student.service.js`, `fees.service.js` (getActiveStudentFeeYear, getFeePaymentsByStudent)

**Collections**: `students`, `studentFeeYears`, `feePayments`

**Status**: Implemented

---

## 5. Teacher Management

**Description**: Full CRUD for teacher records. Teacher profile page with ability to change password via Cloud Function.

**Screens**: `Teachers.jsx` (`/teachers`), `TeacherProfile.jsx` (`/teachers/:teacherId`)

**Services called**:
- `getTeachersBySchool()`, `createTeacher()`, `getTeacherById()`, `updateTeacher()`, `deleteTeacher()`, `changeTeacherPassword()` from `teacher.service.js`

**Collections**: `teachers`

**Cloud Functions**:
- `createTeacher` — `https://createteacher-z4likafkwq-uc.a.run.app`
- `deleteTeacher` — `https://deleteteacher-z4likafkwq-uc.a.run.app`
- `changeTeacherPassword` — `https://changeteacherpassword-z4likafkwq-uc.a.run.app`

**Status**: Implemented

---

## 6. Attendance

**Description**: Mark and view student attendance. Filter by date and class.

**Screens**: `Attendance.jsx` (`/attendance`)

**Collections**: `attendance` (inferred; not fully verified from service files)

**Status**: Implemented (UI exists, exact service layer not confirmed from read files)

---

## 7. Notice Management

**Description**: Post notices to different audience groups (All, Students, Teachers). Supports file attachments (images/PDFs uploaded to Firebase Storage). Delete notices. View all notices for school sorted by date.

**Screens**: `NoticeManagement.jsx` (`/notices`)

**Services called**:
- `createNotice()`, `deleteNotice()`, `uploadNoticeAttachment()`, `getRecentNoticesBySchool()` from `notice.service.js`

**Collections**: `notices`

**Cloud Functions**:
- `createNotice` — `https://createnotice-z4likafkwq-uc.a.run.app`
- `deleteNotice` — `https://deletenotice-z4likafkwq-uc.a.run.app`

**Status**: Implemented

---

## 8. Fee Management V2

**Description**: The complete V2 fee lifecycle. Requires an ACTIVE academic year. Admins create draft fee profiles for students, configure variable fees and adjustments, generate installment schedules, collect payments with automatic allocation, and view/cancel payment receipts. Supports fee revisions after installments are generated.

**Screens**: `FeesV2.jsx` (`/fees-v2`)

**Sub-features**:

### 8a. Academic Year Management
Manage academic years (create INACTIVE, activate one as ACTIVE, close). Only one ACTIVE year per school at a time.

**Dialogs**: `AcademicYearDialog`

**Services**: `createAcademicYear`, `getAcademicYearsBySchool`, `activateAcademicYear`, `closeAcademicYear`, `deleteAcademicYear` from `fees-v2`

**Collections**: `academicYears`

### 8b. Fee Structure Management
Create/edit/deactivate fixed and variable fee structure templates. Fixed fees are class-specific; variable fees are school-wide add-ons.

**Dialogs**: `FeeStructuresDialog`

**Services**: `createFeeStructure`, `updateFeeStructure`, `deactivateFeeStructure`, `updateAllocationPriority`, `getAllFeeStructuresOrdered`, etc.

**Collections**: `feeStructures`

### 8c. Draft Fee Profile Creation
Select a student and academic year, auto-load fixed fee structures for the student's class. Optionally add variable fees and adjustments. Configure payment schedule (monthly/quarterly). Set opening outstanding/credit balance.

**Dialogs**: `CreateDraftProfileDialog`, `EditDraftProfileDialog`

**Services**: `createDraftProfile`, `updateDraftProfile` from `fees-v2`

**Collections**: `studentFeeProfiles`, `feeStructures`, `academicYears`, `students`

### 8d. Installment Generation (Profile Activation)
Click "Generate & Activate" on a DRAFT profile. Runs `FeeScheduleGenerator` (pure, no I/O) to produce the installment schedule, runs validation, applies opening credit/outstanding, then writes all installment documents in one Firestore transaction and transitions profile to ACTIVE.

**Services**: `createInstallments` from `fees-v2`

**Collections**: `studentFeeProfiles`, `feeInstallments`

### 8e. Payment Collection
Collect payment against an ACTIVE profile. System computes `AllocationPlan` (opening balance first, then earliest installments by priority order). Writes FeePayment + PaymentAllocation docs + updates installment balances atomically.

**Dialogs**: `CollectPaymentDialog`

**Services**: `createPayment` from `fees-v2`, `buildAllocationPlan` (pure engine)

**Collections**: `feePayments`, `paymentAllocations`, `feeInstallments`, `studentFeeProfiles`

### 8f. Receipt Generation
After payment, display a printable receipt. Built from the payment's `allocationSummary` field via `buildReceipt()` (pure).

**Dialogs**: `ReceiptDialog`

**Services**: `buildReceipt` from `fees-v2` (pure, no Firestore)

### 8g. Payment Cancellation
Cancel a confirmed payment. Reverses allocation records and installment balances.

**Dialogs**: `CancelPaymentDialog`

**Services**: `cancelPayment` from `fees-v2/services/paymentCancellation.service.js`

**Status**: Partial — implemented in service layer (`paymentCancellation.service.js` exists) but `FeePaymentService.cancelPayment` stub throws "Not implemented"

### 8h. Fee Revisions
Post-activation fee changes. Create a revision document (DRAFT), submit for approval, approve/reject, then apply. Propagates to future installments.

**Components**: `FeeRevisionSection`

**Services**: `createRevision`, `submitRevision`, `approveRevision`, `rejectRevision`, `cancelRevision`, `applyRevisionPlan`

**Collections**: `feeRevisions`, `feeInstallments`, `studentFeeProfiles`

### 8i. Profile Close
Close an ACTIVE or DRAFT profile. Only allowed when academic year is CLOSED.

**Services**: `closeProfile` from `fees-v2`

**Collections**: `studentFeeProfiles`, `academicYears`

**Status**: Implemented (for 8a–8i collectively; see 8g note)

---

## 9. Alumni Management

**Description**: View graduated/alumni students. Queries both legacy (`isGraduated: true`) and new (`status: "alumni"`) records and merges them. Supports filtering by graduation year and class, and client-side search by name/admissionId/phone.

**Screens**: `Alumni.jsx` (`/alumni`)

**Services called**:
- `getAlumni()`, `getAlumniByYear()`, `getAlumniByClass()`, `searchAlumni()`, `getAlumniProfile()` from `alumni.service.js`

**Collections**: `students`, `studentFeeProfiles`, `feePayments`

**Status**: Implemented

---

## 10. Promotion Management

**Description**: Manage bulk student promotions and graduation batches via a wizard. A PromotionBatch is created (DRAFT), then executed — the engine processes each StudentPromotion record individually. Supports retry of failed records. Graduation batches check for outstanding dues and offer collect/waive/graduate-anyway options.

**Screens**: `Promotion.jsx` (`/promotion`), `PromotionBatchDetails.jsx` (`/promotion/:batchId`)

**Dialogs/Wizards**: `PromotionWizard` (3-step: Config → Students → Preview)

**Services called** (from `@/promotion` barrel):
- `createBatch`, `getBatches`, `getBatch`, `cancelBatch`, `updateBatch`
- `createPromotion`, `getPromotionsByBatch`
- `executeBatch`, `retryFailed`
- `computeStudentBalances`
- `buildPromotionPlan`, `buildGraduationPlan` (pure engine)

Also:
- `waiverInstallmentsForBatch` from `fees-v2`
- `getProfile`, `getInstallments` from `fees-v2`
- `getClassesBySchool`, `getStudentsBySchool`

**Collections**: `promotionBatches`, `studentPromotions`, `studentFeeProfiles`, `feeInstallments`, `students`, `classes`

**Status**: Implemented

---

## 11. Academic Year Rollover

**Description**: Year-end procedure that officially transitions from one academic year to the next. Checks a pre-flight checklist (promotion batches completed, next year exists, etc.), shows a preview of all planned writes (student class updates, profile closures, graduation updates), then executes atomically per student.

**Screens**: `AcademicYearRollover.jsx` (`/academic-rollover`)

**Services called**:
- `getActiveAcademicYear`, `getAcademicYearsBySchool` from `fees-v2`
- `getBatches`, `getPromotionsByBatch` from `@/promotion`
- `buildRolloverPlan` (pure engine), `executeRollover` from `@/rollover`
- `getClassesBySchool`, `getStudentsBySchool`

**Collections**: `academicYears`, `promotionBatches`, `studentPromotions`, `studentFeeProfiles`, `students`, `classes`

**Status**: Implemented

---

## 12. Settings

**Description**: School configuration. Manage classes (create/toggle/delete), subjects, timetable time periods, and teacher-to-class assignments.

**Screens**: `Settings.jsx` (`/settings`)

**Services called**:
- `createClass`, `getClassesBySchool`, `toggleClassStatus`, `deleteClass` from `class.service.js`
- Additional subject/assignment services (details not confirmed from read files)

**Collections**: `classes`, `classSubjects`, `subjects`

**Status**: Implemented

---

## 13. Timetable

**Description**: View and manage class timetable.

**Screens**: `Timetable.jsx` (`/timetable`)

**Status**: Implemented (exact service layer not confirmed from read files)

---

## 14. Books / Library

**Description**: Library book management.

**Screens**: `Books.jsx` (`/books`)

**Status**: Placeholder / partial (route exists, content not confirmed)

---

## 15. Exams

**Description**: Exam management.

**Screens**: `Exams.jsx` (`/exams`)

**Status**: Placeholder / partial

---

## 16. Vehicle Tracking

**Description**: School vehicle/bus tracking.

**Screens**: `VehicleTracking.jsx` (`/vehicle`)

**Status**: Placeholder / partial

---

## 17. Reports

**Description**: Fee and academic reports.

**Screens**: `Reports.jsx` (`/reports`)

**Status**: Placeholder / partial

---

## 18. SuperAdmin Panel

**Description**: Platform-level management of all schools. View all schools, create new schools, view school details.

**Screens**: `SuperAdminDashboard.jsx` (`/superadmin`), `SuperAdminSchools.jsx` (`/superadmin/schools`), `SuperAdminCreateSchool.jsx` (`/superadmin/schools/new`), `SuperAdminSchoolDetail.jsx` (`/superadmin/schools/:schoolId`)

**Collections**: `schools`, `principals`

**Status**: Implemented
