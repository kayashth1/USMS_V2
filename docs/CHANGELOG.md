# Changelog

Records implemented features, known stubs/TODOs, and architectural decisions.

---

## Implemented Features

### Authentication (Complete)
- Firebase Auth email/password login.
- Post-login role detection: SuperAdmin (checks `superadmins` collection) → Principal (checks `principals` collection).
- Session stored in `localStorage`. Protected routes check `principalId` + `principalSchoolId`.
- SuperAdmin and Principal use completely separate layouts and route namespaces.

### Dashboard (Complete)
- Real-time summary counts for students, teachers, classes, subjects via `getCountFromServer`.
- 4 recent admissions derived client-side from the full student list (sorted by `createdAt` desc, sliced to 4).
- 4 recent notices from `getRecentNoticesBySchool`.
- Quick-action navigation buttons.

### Student Management (Complete)
- CRUD via Cloud Functions (`createStudent`, `deleteStudent`) + direct Firestore for updates.
- Class filter + name search on list view.
- Sort by roll number.
- Bulk selection + bulk delete.
- `getStudentsBySchool` applies client-side filters: `isActive !== false && status !== "alumni"`.

### Teacher Management (Complete)
- CRUD via Cloud Functions (`createTeacher`, `deleteTeacher`, `changeTeacherPassword`) + direct Firestore for updates.
- Teacher profile page with subject/class assignments.

### Attendance (Complete — service layer not confirmed)
- UI exists at `/attendance`.
- Exact Firestore collection schema and service functions not fully reviewed.

### Notice Management (Complete)
- Create and delete via Cloud Functions.
- File attachments uploaded to Firebase Storage, metadata saved in notice document.
- Notices ordered by `createdAt` desc.

### Settings (Complete)
- **Class Management**: Create, toggle active/inactive, delete (guards against classSubjects assignment).
- **Subject Management**: Create (duplicate-check), toggle, delete (guards against classSubjects assignment).
- **Class-Subject Assignment**: Add/remove subjects from classes. Remove cascades to teacher assignments.
- **Teacher Assignment**: Assign/remove teachers from class-subject pairs.
- **Time Period Management**: Full CRUD for timetable time periods.

### Alumni Management (Complete)
- Dual-query system for legacy (`isGraduated: true`) and new (`status: "alumni"`) alumni records.
- Client-side normalisation merges both schemas into a consistent shape.
- Filters by graduation year, class, and free-text search.

### Fee Management V2 (Mostly Complete — see Stubs section)

#### Academic Year Management (Complete)
- Create INACTIVE years, activate (deactivates current in a transaction), close (with pre-condition checks), delete (INACTIVE only).

#### Fee Structure Management (Complete)
- Fixed (class-specific) and variable (school-wide) structure types.
- `allocationPriority` field controls payment allocation order.
- `chargedDuringHolidays` controls holiday-month installment generation.

#### Draft Fee Profile (Complete)
- Deterministic document ID `${studentId}_${academicYearId}`.
- Fixed fee structures auto-loaded and snapshotted as `feeLineItems`.
- Variable fees and adjustments configurable.
- `computedAmount` on adjustments always server-derived (caller value discarded).
- Uniqueness enforced via Firestore transaction.

#### Installment Generation (Complete)
- Pure `FeeScheduleGenerator` produces installment schedule (no I/O).
- Monthly (12 periods Apr–Mar) or quarterly (4 periods) supported.
- Holiday month exclusion per fee structure's `chargedDuringHolidays`.
- One-time fees included only in installment #1.
- Opening credit/outstanding applied and then reset to 0 on profile.
- All writes in a single Firestore transaction; profile transitions to ACTIVE.
- Regeneration is not supported post-activation.

#### Payment Collection (Complete)
- Pure `PaymentAllocationEngine` computes allocation plan (no I/O).
- Allocation order: opening balance first, then installments by `installmentNumber`.
- Atomic transaction: payment + allocations + installment balance updates.
- Receipt number generated from monthly counter inside same transaction.

#### Payment Cancellation (Complete — service layer; UI not confirmed)
- `paymentCancellation.service.js` fully implemented.
- Reverses allocation records (stamps `isReversed`, never deletes), restores installment balances, decrements `openingPaid`.
- `FeePaymentService.cancelPayment()` stub still throws "Not implemented" — callers should import directly from `paymentCancellation.service.js`.

#### Fee Revisions (Complete — apply path uses new persistence service)
- Full lifecycle: DRAFT → PENDING_APPROVAL → APPROVED → APPLIED (or REJECTED/CANCELLED).
- `feeRevisionPersistence.service.js` implements `applyRevisionPlan()` atomically.
- `feeRevision.service.js` has a deprecated `applyRevision()` stub.

#### Profile Close (Complete)
- Requires academic year to be CLOSED first.
- Both DRAFT and ACTIVE profiles may be closed.

### Promotion Management (Complete)
- 3-step wizard: Config → Students → Preview.
- PromotionBatch + StudentPromotion documents created at wizard completion.
- `executeBatch()` runs sequentially per student with live progress via `onProgress` callback.
- `retryFailed()` resets FAILED → DRAFT then re-executes.
- GRADUATION type: checks outstanding dues, offers collect/waive/proceed options.
- `waiverInstallmentsForBatch()` uses chunked writeBatch (400 ops) for WAIVED status.
- Promotion engine is pure (`promotionEngine.js`): no Firestore, deterministic.
- Persistence service (`promotionPersistence.service.js`) is the only writer for promotion results.

### Academic Year Rollover (Complete)
- Pre-flight checklist (5 items) gates the Execute button.
- Preview tabs: Student Updates, Fee Profiles, Graduation.
- `rolloverEngine.js` (pure) builds the plan; `rolloverExecution.service.js` persists it.
- Year transition (activate next, close current) is atomic.
- Each student update is a separate transaction; failures are logged and execution continues.
- Rollover summary written to closed year's `rolloverSummary` field.
- All steps are idempotent (re-runnable after partial failure).
- Post-rollover: student's `classId`, `classLabel`, `currentClassId`, `currentAcademicYear` updated.
- New fee profile stays DRAFT intentionally; admin must manually generate installments from `/fees-v2`.

### SuperAdmin Panel (Complete)
- List all schools, view detail, create/delete school (via Cloud Functions).
- Platform-level stats (total schools, students, teachers).
- Update school subscription (`plan`, `planExpiresAt`, `isActive`).

---

## Known Stubs / Not Yet Implemented

| Location | Function | Note |
|---|---|---|
| `feeInstallment.service.js` | `updateInstallment()` | Throws "Not implemented" |
| `feeInstallment.service.js` | `cancelInstallment()` | Throws "Not implemented" |
| `feeInstallment.service.js` | `lockPeriodInstallments()` | Throws "Not implemented" |
| `feePayment.service.js` | `cancelPayment()` | Throws "Not implemented" — use `paymentCancellation.service.js` directly |
| `paymentAllocation.service.js` | All functions | ALL stubs. `createAllocation`, `deleteAllocation`, `getAllocationsByInstallment`, `getAllocationsByPayment`, `computeComponentAllocations` all throw "Not implemented" |
| `academicYear.service.js` | `updateAcademicYear()` | Throws "Not implemented" |
| `feeRevision.service.js` | `applyRevision()` | Deprecated stub — use `feeRevisionPersistence.service.js` instead |

---

## Placeholder / Partial Pages

| Route | Status |
|---|---|
| `/books` | Route exists; content is placeholder |
| `/exams` | Route exists; content is placeholder |
| `/vehicle` | Route exists; content is placeholder |
| `/reports` | Route exists; content is placeholder |
| `/attendance` | UI exists; service layer not fully reviewed |
| `/timetable` | UI exists; service layer not fully reviewed |

---

## Architectural Decisions

### 1. Pure Engine Pattern
All financial computation engines are pure functions with no I/O:
- `feeScheduleGenerator.js` — installment schedule
- `paymentAllocationEngine.js` — payment allocation plan
- `feeRevisionEngine.js` — revision impact computation
- `promotionEngine.js` — promotion/graduation plan
- `rolloverEngine.js` — rollover plan

**Rationale**: Engines are deterministic and fully unit-testable without Firebase mocks. Persistence layers consume their output in atomic Firestore transactions.

### 2. Persistence Separation
Dedicated persistence services exist for complex multi-document writes:
- `feeRevisionPersistence.service.js` — `applyRevisionPlan()`
- `promotionPersistence.service.js` — `persistPromotionPlan()`
- `paymentCancellation.service.js` — `cancelPayment()`
- `rolloverExecution.service.js` — `executeRollover()`

**Rationale**: Separates the "what to write" (engine) from the "how to write" (persistence), enabling independent testing and making transactional boundaries explicit.

### 3. Deterministic Firestore Document IDs
- `studentFeeProfiles`: `${studentId}_${academicYearId}`
- `feeInstallments`: `${profileId}_${period}`
- Promotion fee profiles: same scheme as `studentFeeProfiles`

**Rationale**: Uniqueness can be enforced inside a Firestore transaction via `tx.get()` without a separate query, eliminating TOCTOU race conditions.

### 4. Read-Before-Write Transaction Convention
All Firestore transactions follow strict read-before-write ordering (required by the Firebase Web SDK):
- Phase 1: all `tx.get()` calls, often parallelized with `Promise.all`.
- Phase 2: all `tx.update()`/`tx.set()` calls (synchronous after reads complete).

This pattern is consistently enforced across `paymentCancellation.service.js`, `feeRevisionPersistence.service.js`, `promotionPersistence.service.js`, and the rollover execution service.

### 5. Dual Alumni System
Two parallel graduation mechanisms exist:
- **Legacy** (`graduateStudents()` in `student.service.js`): sets `isGraduated: true`, `isActive: false`. Used by direct graduation from the old academic module.
- **New** (`executeGraduationUpdate()` in `rolloverExecution.service.js`): sets `status: "alumni"`, `isActive: false`. Used by the rollover module.

`alumni.service.js` queries both and normalises results. `getStudentsBySchool()` excludes both via `isActive !== false && status !== "alumni"`.

### 6. Fee System Coexistence
Two fee systems run in parallel:
- **Legacy** (`fees.service.js`): `studentFeeYears` + `feePayments` collections. Running balance ledger recalculated on every payment.
- **V2** (`fees-v2/` module): `studentFeeProfiles` + `feeInstallments` + `feePayments` + `paymentAllocations` + `feeRevisions`. Event-sourced allocation model; no global ledger recalculation.

The UI routes (`/fees-v2`) use only the V2 module. Legacy routes (`/fees`) have been deleted per git status.

### 7. Rollover Does Not Activate Fee Profiles
After rollover, promoted students' new `studentFeeProfiles` remain in DRAFT status. Admin must manually navigate to `/fees-v2` and click "Generate & Activate" for each profile.

**Rationale**: Admin review before installment generation; class fees may need adjustments not captured in the promotion wizard.

### 8. Module-Level Caching for Hooks
`useSchoolSettings.js` and `useSchoolPlan.js` use module-level variables (`_cache`, `_cachedPlan`) to avoid repeated Firestore reads across component mounts within the same browser session.

### 9. Cloud Functions for Sensitive Writes
Student creation/deletion, teacher creation/deletion/password change, and notice creation/deletion go through Cloud Functions rather than direct Firestore writes. This allows server-side validation, Firebase Auth user creation/deletion, and cascading cleanup that cannot be done safely from the client.

### 10. Client-Side Filtering
Several queries load more data than needed and apply filters in JavaScript:
- `getStudentsBySchool()` — excludes alumni client-side.
- `recalculateStudentLedger()` — loads all feePayments for student, filters by `academicYear` in JS.
- `closePeriod()` — loads all school+period records, filters by `academicYear` in JS.

This avoids the need for additional composite Firestore indexes but increases data transfer volume. Consider server-side filtering for large schools.

### 11. Receipt Numbers Scoped to School + Month
Receipt counter documents live at `schools/{schoolId}/receiptCounters/{YYYY-MM}`. Counter increment and receipt creation happen in the same transaction, guaranteeing uniqueness even under concurrent payments.

### 12. Plan Gating
`schools.plan` field (`"free"` or `"premium"`) gates UI features via `useSchoolPlan()`. Premium-only features are hidden or disabled for free-tier schools. The plan is cached module-level after first read.

---

## Git History Reference

Recent commits at documentation time:

| Commit | Message |
|---|---|
| `2e8aaa3` | Complete Fees V2 + Promotion + Rollover implementation |
| `0acc996` | small changes |
| `70ad496` | Add site name to hosting config |
| `69018a7` | small changes |
| `6cd438d` | Fix broken Home import, redirect / to /login |

Files deleted in the most recent major commit:
- `frontend/src/Pages/academics/Academics.jsx`
- `frontend/src/Pages/fees/Fees.jsx`
- `frontend/src/components/academics/PromoteStudentsDialog.jsx`
- `frontend/src/components/academics/UpgradeClassDialog.jsx`
- `frontend/src/components/fees/ManageStudentFeesDialog.jsx`

These deletions indicate the legacy Academics and Fees pages were replaced by the new Promotion + Rollover + FeesV2 system.
