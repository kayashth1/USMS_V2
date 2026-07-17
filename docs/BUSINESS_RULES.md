# Business Rules

All rules are extracted directly from source code.

---

## 1. Academic Year Format

- Format: `"YYYY-YY"` where the suffix is the last two digits of `startYear + 1`.
- Example: `"2025-26"` is valid; `"2025-27"` is invalid.
- Only one ACTIVE year per school at a time.
- Status transitions: `INACTIVE → ACTIVE → INACTIVE` (when another activated) or `ACTIVE/INACTIVE → CLOSED`.

---

## 2. Fee Profile Lifecycle (V2)

```
DRAFT → ACTIVE → CLOSED
```

### DRAFT
- Created by `createDraftProfile()`.
- Pre-conditions:
  - Academic year must be ACTIVE.
  - Student must exist in `students` collection.
  - At least one active fixed fee structure must exist for the student's class.
- Mutable fields: `variableFeeIds`, `feeAdjustments`, `schedule`.
- Fixed fee line items are loaded automatically from `feeStructures` and cannot be changed in DRAFT (they are a snapshot).
- `computedAmount` on each `FeeAdjustment` is always derived server-side; any caller-supplied value is discarded.
- `grossAnnualFee` in DRAFT does NOT account for holiday months; that correction is applied when installments are generated.

### DRAFT → ACTIVE (Installment Generation)
- Triggered by `createInstallments()`.
- Profile must be in DRAFT status and `installmentsGenerated === false`.
- `FeeScheduleGenerator` produces the installment schedule (pure, no I/O).
- Schedule is validated; any error aborts the entire operation.
- Opening credit is applied from the earliest installment forward.
- Opening outstanding is added to the first installment's balance.
- All installment documents are written atomically in a single Firestore transaction.
- Profile transitions to ACTIVE in the same transaction; `installmentsGenerated` set to `true`.
- `openingOutstanding` and `openingCredit` on the profile are reset to `0` (installments are now the source of truth).
- Regeneration is NOT supported. Fee revisions must be used after activation.

### ACTIVE
- Payments are accepted.
- Changes must flow through `FeeRevisionService` (DRAFT → PENDING_APPROVAL → APPROVED → APPLIED).

### CLOSED
- Academic year must be CLOSED before any profile can be closed.
- Both DRAFT and ACTIVE profiles may be closed during year-end cleanup.
- Terminal state; no further mutations.

---

## 3. Fee Profile Document ID

Document ID is deterministic: `${studentId}_${academicYearId}`. Uniqueness is enforced via a Firestore transaction (`tx.get()` + `tx.set()`), eliminating TOCTOU race conditions.

---

## 4. Installment Generation Rules

### Schedule Types
- `monthly`: 12 periods per year, April through March (April = index 0, March = index 11).
- `quarterly`: 4 periods per year: Q1 (Apr–Jun), Q2 (Jul–Sep), Q3 (Oct–Dec), Q4 (Jan–Mar).

### Period Sort Order (Legacy module)
`sortIndex`: April=0, May=1, June=2, July=3, August=4, September=5, October=6, November=7, December=8, January=9, February=10, March=11, opening=-1.

### Holiday Months
- Fee structures with `chargedDuringHolidays === false` are excluded from holiday-month installments.
- Fee structures with `chargedDuringHolidays === true` (the default) are always included.

### One-Time Fees (Legacy module)
- Charged only in the first period of the year.
- In subsequent periods, one-time items do not appear.

### One-Time Fees (V2 module)
- `grossAnnualFee` counts one-time items once (not multiplied by period count).
- Included only in installment #1 (`installmentNumber === 1`).

### Opening Balance (Legacy module)
- If `openingBalance !== 0`, a special payment record is created with:
  - `period: "opening-{academicYear}"`, `sortIndex: -1`, `isBalanceTransfer: true`, `isClosed: true`.
  - `totalDue = openingBalance > 0 ? openingBalance : 0`
  - `amountPaid = openingBalance < 0 ? Math.abs(openingBalance) : 0`
- After insertion, full ledger recalculation runs.

### Opening Balance (V2 module)
- `openingOutstanding` (positive) is added to the first installment's `balance`.
- `openingCredit` (positive) reduces installment balances from the earliest forward.
- After installment generation, both are reset to `0` on the profile.

---

## 5. Payment Allocation Order (V2)

Payment allocation uses **priority order** strategy by default:

1. Opening balance is allocated first (if `profile.openingOutstanding > 0`).
2. Remaining amount allocated to installments in ascending `installmentNumber` order.
3. Within an installment, line items are allocated in ascending `allocationPriority` order.
4. Any payment amount exceeding total outstanding is recorded as `unallocatedAmount`.

The `buildAllocationPlan()` pure function produces this plan without writing to Firestore. `createPayment()` then persists the plan atomically.

---

## 6. Payment Ledger Recalculation (Legacy module)

`recalculateStudentLedger(studentId, academicYear)` reprocesses all payment records for one student and one year:

1. Load all `feePayments` for the student (no year filter in query — JS-filtered by `academicYear`).
2. Sort by `sortIndex` ascending.
3. For each record: `outstanding = carryForward + totalDue - amountPaid`.
4. `status`: `outstanding <= 0` → `"paid"`; `amountPaid > 0` → `"partial"`; else → `"pending"`.
5. Write back updated `carryForward`, `outstanding`, `status` in batches of 200.

---

## 7. Fee Revision Lifecycle (V2)

```
DRAFT → PENDING_APPROVAL → APPROVED → APPLIED
         │
         └──────────────→ REJECTED
DRAFT/PENDING_APPROVAL → CANCELLED
```

- `createRevision()` → DRAFT.
- `submitRevision()` → PENDING_APPROVAL. Only DRAFT may be submitted.
- `approveRevision()` → APPROVED. Only PENDING_APPROVAL may be approved.
- `rejectRevision()` → REJECTED. Only PENDING_APPROVAL may be rejected.
- `applyRevisionPlan()` → APPLIED. Changes are propagated to installments and profile. Document becomes immutable.
- `cancelRevision()` → CANCELLED. Only DRAFT and PENDING_APPROVAL may be cancelled.
- `updateDraftRevision()` — only `reason`, `effectiveInstallment`, `changes` are mutable; only on DRAFT.

Approved and Applied are intentionally distinct: approval gates the change before any financial data is written.

---

## 8. Promotion Workflow

### Wizard Steps
1. **Config step**: Choose source class, destination class (or GRADUATION), source/destination academic years, carry options.
2. **Student step**: Select which students from the source class to include.
3. **Preview step**: Run `buildPromotionPlan()` / `buildGraduationPlan()` (pure engine) for each student, display planned fee profile changes. Create batch + StudentPromotion records (status: DRAFT).

### Batch Execution
- `executeBatch()` processes each DRAFT/PENDING StudentPromotion sequentially.
- For each student:
  - Runs promotion engine to build a plan.
  - Calls `persistPromotionPlan()` which writes the new draft fee profile and updates the StudentPromotion.
  - Marks StudentPromotion as COMPLETED or FAILED.
- Progress callback called after each student.
- `retryFailed()` retries FAILED records only.

### Fee Carry-Over Rules (Promotion Engine)
- `carryFeeBalance === true`: closing balance from old fee profile becomes `openingOutstanding` on new profile.
- `carryVariableFees === true`: variable fee IDs from old profile are carried to new profile.
- Adjustments (scholarships, concessions) are carried from the old profile.
- Fixed fee structures are always reloaded from the destination class for the new year.

### Batch Status Derivation (`deriveBatchStatus`)
- All COMPLETED → `COMPLETED`.
- Some COMPLETED, some FAILED → `PARTIAL_SUCCESS`.
- All FAILED → `FAILED`.
- Any CANCELLED → `CANCELLED`.

---

## 9. Graduation Rules

### Dues Check
Before executing a GRADUATION batch, the UI performs a live outstanding balance check:

```
getProfile(sp.oldFeeProfileId)
getInstallments(sp.oldFeeProfileId)
computeStudentBalances(profile, installments)
```

If `totalOutstanding > 0`, a dialog presents three choices:
- **Collect payment first**: Abort graduation; admin must collect dues.
- **Waive outstanding dues**: Calls `waiverInstallmentsForBatch()` to set all unpaid installments to WAIVED (balance=0), then proceeds.
- **Graduate anyway (Admin only)**: Proceeds with outstanding balance visible in alumni records.

### Student Status After Graduation (Rollover)
`executeGraduationUpdate()` sets on the student document:
```
status: "alumni"
isActive: false
graduatedAcademicYear: batch.fromAcademicYear
graduatedClassId: sp.fromClassId
graduatedAt: serverTimestamp()
```
Graduated students do NOT get `currentClassId` or `currentAcademicYear` updates.

---

## 10. Academic Year Rollover Pre-Conditions (Checklist)

All five must be true before the Execute button is enabled:

1. **Promotion batches completed**: At least one batch for the current academic year exists with status `COMPLETED` or `PARTIAL_SUCCESS`.
2. **No pending promotions**: No batch in `DRAFT` or `RUNNING` state.
3. **Draft fee profiles ready**: At least one `newFeeProfileId` exists on completed StudentPromotion records.
4. **Next academic year exists**: The `toAcademicYear` from batches must exist as a document in `academicYears`.
5. **Current academic year is active**: An ACTIVE year must exist for the school.

### Close Pre-Conditions (`closeAcademicYear`)
- No `DRAFT` student fee profiles for the year.
- No `PENDING` fee revisions for the year.

---

## 11. Rollover Execution Order

1. **Year transition** (atomic transaction): Set `nextYear.status = ACTIVE`, set `currentYear.status = CLOSED`.
2. **Per promoted student** (one transaction each):
   - Update `students.classId`, `classLabel`, `currentClassId`, `currentAcademicYear`.
   - Note: new fee profile is intentionally NOT activated here (stays DRAFT so admin can generate installments from Fee Management V2).
   - Close old fee profile (`status = CLOSED`).
3. **Per graduated student** (one transaction each):
   - Set `students.status = "alumni"`, `isActive = false`, graduation fields.
   - Close old fee profile.
4. **Write summary** to closed year document (`rolloverSummary` field).

### Idempotency
- Year activation: skipped if already ACTIVE.
- Year closure: skipped if already CLOSED.
- Student update: skipped if `student.currentAcademicYear === nextYear.year`.
- Profile activate: skipped if `profile.status !== DRAFT`.
- Profile close: skipped if `profile.status === CLOSED`.
- Graduation: skipped if `student.status === "alumni"`.

---

## 12. Student Status Lifecycle

```
Active student (isActive: true, no status field)
        │
        ├── Legacy graduation path: graduateStudents()
        │     Sets: isActive=false, isGraduated=true, finalClassId, academicYear
        │
        └── New rollover path: executeGraduationUpdate()
              Sets: status="alumni", isActive=false, graduatedAcademicYear, graduatedClassId
```

### isActive vs status: "alumni"

Two parallel systems exist for marking graduates. Alumni service queries BOTH:
- Legacy: `where("isGraduated", "==", true)`
- New: `where("status", "==", "alumni")`

The `getStudentsBySchool()` filter excludes both:
```js
s.isActive !== false && s.status !== "alumni"
```

---

## 13. Class Deletion Guard

`deleteClass()` queries `classSubjects` for any assignments to that class before deleting. If any subjects are assigned, deletion is rejected with: `"Class has subjects assigned. Remove subjects first."`

---

## 14. School Plan Gating

`useSchoolPlan()` hook reads `schools.plan`:
- `"premium"` → `isPremium = true`
- `"free"` (or missing) → `isFree = true`
- While loading: `isFree = false` (prevents premature redirects).
- Value is module-level cached (`_cachedPlan`) to avoid repeated reads.

---

## 15. SuperAdmin vs Principal Role Separation

- **SuperAdmin**: Identified by existence of a document in `superadmins` collection with the user's Auth UID. Redirected to `/superadmin`. Uses `SuperAdminRoute` and `SuperAdminLayout`. Cannot access principal routes.
- **Principal**: Identified by existence of `principals/{uid}` with `isActive === true`. Session stored in `localStorage` (`principalId`, `principalSchoolId`). Uses `ProtectedRoute` and `AdminLayout`. All data queries are scoped by `principalSchoolId`.

### ProtectedRoute Implementation
Checks `localStorage.principalId` and `localStorage.principalSchoolId`. If either is missing, redirects to `/login`. Does NOT verify Firebase Auth token on the client side (relies on Firestore security rules server-side).

---

## 16. Receipt Number Generation (V2)

Receipt numbers are generated using a Firestore counter document to ensure uniqueness under concurrent payments:

- Counter document path: `schools/{schoolId}/receiptCounters/{YYYY-MM}` (one counter per school per month).
- Receipt format: implemented in `receiptNumber.js` (exact format depends on counter value and date).
- The counter increment and receipt assignment happen inside the same Firestore transaction as the payment write, making duplicate receipt numbers impossible even under concurrent requests.

---

## 17. Installment Status Derivation (V2)

Status is derived on every balance-affecting write:

| Condition | Status |
|---|---|
| cancelled field set | `"cancelled"` |
| `balance <= 0` | `"paid"` |
| `balance > 0`, today > dueDate | `"overdue"` |
| `balance > 0`, some payment applied | `"partial"` |
| `balance > 0`, today <= dueDate | `"due"` |
| `balance > 0`, dueDate in future | `"upcoming"` |

Note: The payment service uses a simplified three-state derivation (PAID / PARTIAL / DUE); overdue/upcoming transitions are handled separately by date-aware operations.

---

## 18. Period Close (Legacy module)

`closePeriod(schoolId, period, academicYear)`:
1. Loads all `feePayments` for the school + period.
2. JS-filters by `academicYear`.
3. Sets `isClosed = true` on all matching records.
4. Triggers `recalculateStudentLedger()` for each affected student so outstanding balance carries forward to the next period.

---

## 19. Waiver of Installments for Graduation Batch

`waiverInstallmentsForBatch(pendingPromotions, waivedBy, waiverReason)`:
- Only processes StudentPromotion records with `openingOutstanding > 0` and a valid `oldFeeProfileId`.
- Loads all installments for each target profile.
- Skips installments with status `"cancelled"`, `"paid"`, or `"waived"`.
- Sets remaining installments: `status = "waived"`, `balance = 0`, `waivedBy`, `waivedAt`, `waiverReason`.
- Uses chunked `writeBatch` (400 ops per batch) to stay under Firestore's 500-op limit.
