# Firestore Schema

All collections are flat (no subcollections). Multi-tenancy is enforced by a `schoolId` field on every school-scoped document.

---

## `students`

One document per student. Active students have `isActive !== false && status !== "alumni"`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | References `schools` document ID |
| `fullName` | string | yes | Display name |
| `admissionId` | string | yes | School-assigned admission number |
| `admissionNumber` | string | no | Alias for `admissionId` (legacy) |
| `roll` | string/number | no | Roll number (sorted as number in Students page) |
| `rollNo` | string | no | Alias for `roll` (legacy) |
| `classId` | string | yes | Canonical class field, references `classes.docId` |
| `classLabel` | string | no | Denormalised display label e.g. `"Grade 10 – A"` |
| `currentClassId` | string | no | Set by Rollover module (mirrors `classId` post-rollover) |
| `currentAcademicYear` | string | no | Set by Rollover module e.g. `"2026-27"` |
| `gender` | string | no | |
| `phone` | string | no | Contact number |
| `contact` | string | no | Alias for `phone` (legacy) |
| `email` | string | no | |
| `address` | string | no | |
| `parentName` | string | no | |
| `fatherName` | string | no | Alias for `parentName` (legacy) |
| `parentPhone` | string | no | |
| `parentContact` | string | no | Alias for `parentPhone` (legacy) |
| `photo` | string | no | Storage URL |
| `photoURL` | string | no | Alias for `photo` (legacy) |
| `admissionDate` | Timestamp/string | no | |
| `isActive` | boolean | no | `false` means deactivated or graduated (legacy graduation path) |
| `isGraduated` | boolean | no | `true` for legacy graduation (isGraduated path) |
| `status` | string | no | `"alumni"` set by new rollover system |
| `graduatedAt` | Timestamp | no | Set when graduated (legacy path) |
| `finalClassId` | string | no | Graduating class (legacy path) |
| `finalClassLabel` | string | no | Graduating class label (legacy path) |
| `academicYear` | string | no | Graduation year (legacy path) |
| `graduatedBy` | string | no | UID of admin who graduated (legacy) |
| `graduatedAcademicYear` | string | no | Set by rollover system e.g. `"2025-26"` |
| `graduatedClassId` | string | no | Set by rollover system |
| `promotionHistory` | array | no | Array of `{ fromClassId, fromClassLabel, toClassId, toClassLabel, promotedAt, promotedBy }` |
| `createdAt` | Timestamp | yes | Server timestamp |
| `updatedAt` | Timestamp | no | Server timestamp on update |

### Active Student Filter
```js
where("schoolId", "==", schoolId)
// then client-side filter:
s.isActive !== false && s.status !== "alumni"
```

### Relationships
- `schoolId` → `schools`
- `classId` → `classes.docId`
- Referenced by `studentFeeProfiles`, `studentFeeYears`, `feeInstallments`, `feePayments`, `studentPromotions`

### Example Document
```json
{
  "schoolId": "sch_xyz",
  "fullName": "Ravi Kumar",
  "admissionId": "ADM2024001",
  "roll": "12",
  "classId": "docId_of_10A_class",
  "classLabel": "Grade 10 – A",
  "currentClassId": "docId_of_10A_class",
  "currentAcademicYear": "2025-26",
  "gender": "Male",
  "phone": "9876543210",
  "parentName": "Suresh Kumar",
  "isActive": true,
  "createdAt": "<Timestamp>"
}
```

---

## `teachers`

One document per teacher. Document ID equals the Firebase Auth UID of the teacher's login.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | References `schools` |
| `fullName` | string | yes | |
| `email` | string | yes | Firebase Auth email |
| `phone` | string | no | |
| `subject` | string | no | Primary subject |
| `qualification` | string | no | |
| `isActive` | boolean | no | |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | no | |

### Example Document
```json
{
  "schoolId": "sch_xyz",
  "fullName": "Meena Sharma",
  "email": "meena@school.com",
  "subject": "Mathematics",
  "isActive": true,
  "createdAt": "<Timestamp>"
}
```

---

## `classes`

One document per class section per school. The `id` field inside the document is a computed key (`grade + section`), but the Firestore document ID is auto-generated.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `"${grade}${section}"` e.g. `"10A"` (stored as a field) |
| `grade` | number | yes | Numeric grade e.g. `10` |
| `section` | string | yes | Uppercase section e.g. `"A"` |
| `schoolId` | string | yes | |
| `isActive` | boolean | yes | |
| `createdAt` | Timestamp | yes | |

> **Important**: The Firestore document ID (returned as `docId` by `getClassesBySchool`) is used as `classId` on student documents. The `id` field inside the document is a computed display key, not the Firestore doc ID.

### Relationships
- `schoolId` → `schools`
- Referenced by `students.classId`, `feeStructures.classId`, `studentFeeProfiles.classId`

### Example Document
```json
{
  "id": "10A",
  "grade": 10,
  "section": "A",
  "schoolId": "sch_xyz",
  "isActive": true,
  "createdAt": "<Timestamp>"
}
```

---

## `classSubjects`

Assignments of subjects to classes. Checked by `deleteClass()` before allowing class deletion.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `classId` | string | yes | The computed `id` field value (e.g. `"10A"`), NOT the docId |
| `schoolId` | string | yes | |
| `subjectId` | string | yes | |

---

## `subjects`

One document per subject per school.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `name` | string | yes | |
| `createdAt` | Timestamp | yes | |

---

## `schools`

One document per school. Document ID is the `schoolId` used across all other collections.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | School display name |
| `schoolName` | string | no | Alias (legacy) |
| `address` | string | no | |
| `plan` | string | no | `"free"` or `"premium"`. Defaults to `"free"` |
| `feeAcademicYear` | string | no | Active fee year string e.g. `"2025-26"` (used by legacy fees module) |
| `feeSchedule` | string | no | `"monthly"` or `"quarterly"` (used by legacy fees module) |
| `holidayMonths` | string[] | no | Array of period strings that are holiday months e.g. `["2025-10", "2025-11"]`. Used by both legacy and V2 fee modules |

### Relationships
- Referenced by virtually all other collections via `schoolId`

### Example Document
```json
{
  "name": "Delhi Public School",
  "address": "123 Main St, Delhi",
  "plan": "premium",
  "feeAcademicYear": "2025-26",
  "feeSchedule": "monthly",
  "holidayMonths": ["2025-10", "2025-11", "2026-01"]
}
```

---

## `principals`

One document per principal. Document ID equals Firebase Auth UID.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `fullName` | string | yes | |
| `name` | string | no | Alias for `fullName` |
| `email` | string | yes | |
| `isActive` | boolean | yes | Login denied if `false` |

---

## `superadmins`

One document per super admin. Document ID equals Firebase Auth UID. Existence of this document is the sole gate for SuperAdmin access.

---

## `notices`

One document per notice.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `title` | string | yes | |
| `message` | string | yes | |
| `targetAudience` | string | yes | e.g. `"All"`, `"Students"`, `"Teachers"` |
| `attachments` | array | no | Array of `{ name, url, type, size }` |
| `status` | string | no | e.g. `"active"` |
| `createdBy` | string | yes | Principal UID |
| `createdByRole` | string | yes | `"principal"` |
| `createdAt` | Timestamp | yes | |

### Reads
- Dashboard: `orderBy("createdAt", "desc"), limit(4)` via `getRecentNoticesBySchool`

---

## `feeStructures`

Fee component templates. Shared between legacy fees module and V2. V2 adds `allocationPriority` and `isActive`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `type` | string | yes | `"fixed"` or `"variable"` |
| `classId` | string | conditional | Required if `type === "fixed"`. Firestore docId of the class |
| `classLabel` | string | no | Denormalised class label |
| `label` | string | yes | Fee component name e.g. `"Tuition Fee"` |
| `amount` | number | yes | Per-cycle amount in INR |
| `isOneTime` | boolean | no | If `true`, charged in first installment only |
| `chargedDuringHolidays` | boolean | no | Default `true`. If `false`, not billed in holiday months |
| `allocationPriority` | number | no | V2 only. Lower = allocated first during payment. Default `999` |
| `isActive` | boolean | no | V2 only. Default `true`. `false` = soft-deleted |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | no | |

### Relationships
- `schoolId` → `schools`
- `classId` → `classes` (docId), for fixed fees
- Referenced by `studentFeeProfiles.feeLineItems[].feeStructureId`

---

## `studentFeeYears` (Legacy fee module)

One document per student per academic year. Doc ID: `${studentId}_${academicYear}`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentId` | string | yes | |
| `studentName` | string | yes | |
| `classId` | string | yes | |
| `classLabel` | string | yes | |
| `schoolId` | string | yes | |
| `academicYear` | string | yes | `"YYYY-YY"` |
| `schedule` | string | yes | `"monthly"` or `"quarterly"` |
| `items` | array | yes | Fee items array |
| `totalPerCycle` | number | yes | Sum of recurring item amounts |
| `openingBalance` | number | no | |
| `closingBalance` | number | no | |
| `status` | string | yes | `"active"` or `"closed"` |
| `createdAt` | Timestamp | yes | |
| `closedAt` | Timestamp | no | |

---

## `feePayments` (dual-use: legacy + V2)

> **This collection is written by BOTH the legacy `fees.service.js` and the V2 `feePayment.service.js`. The document schemas differ. The V2 module co-exists with the legacy module during the migration period.**

### Legacy schema (fees.service.js)

| Field | Type | Notes |
|---|---|---|
| `studentId` | string | |
| `studentName` | string | |
| `classId` | string | |
| `classLabel` | string | |
| `schoolId` | string | |
| `academicYear` | string | |
| `period` | string | `"YYYY-MM"` or `"Q{n}-YYYY-YY"` or `"opening-{year}"` |
| `periodLabel` | string | Human-readable |
| `sortIndex` | number | April=0, May=1, ..., Mar=11, opening=-1 |
| `totalDue` | number | |
| `amountPaid` | number | |
| `carryForward` | number | Outstanding from previous period |
| `outstanding` | number | Remaining after payment |
| `status` | string | `"pending"`, `"partial"`, `"paid"` |
| `isClosed` | boolean | Period locked |
| `isHolidayMonth` | boolean | |
| `isBalanceTransfer` | boolean | Opening balance entry flag |
| `items` | array | Fee line items for this period |
| `receiptNo` | string/null | |
| `paidAt` | Timestamp/null | |
| `paidBy` | string/null | |
| `collectedBy` | string/null | |
| `notes` | string/null | |
| `createdAt` | Timestamp | |

### V2 schema (feePayment.service.js)

| Field | Type | Notes |
|---|---|---|
| `studentId` | string | |
| `schoolId` | string | |
| `academicYear` | string | `"YYYY-YY"` |
| `feeProfileId` | string | References `studentFeeProfiles` |
| `receiptNo` | string | Counter-backed, format varies |
| `paymentAmount` | number | Total paid |
| `paymentMode` | string | `"cash"`, `"upi"`, `"cheque"`, `"dd"`, `"online"` |
| `paymentDate` | Date/Timestamp | |
| `collectedBy` | string | |
| `remarks` | string/null | |
| `status` | string | `"confirmed"` or `"cancelled"` |
| `allocationSummary` | array | `[{ target, installmentId, period, periodLabel, amount }]` |
| `allocatedAmount` | number | |
| `unallocatedAmount` | number | |
| `cancelledAt` | Timestamp/null | |
| `cancellationNote` | string/null | |
| `cancelledBy` | string/null | |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

---

## `academicYears` (V2)

One document per academic year per school.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `year` | string | yes | `"YYYY-YY"` e.g. `"2025-26"`. Format validated: suffix must be consistent |
| `startDate` | Timestamp/Date | yes | Must be before `endDate` |
| `endDate` | Timestamp/Date | yes | |
| `status` | string | yes | `"active"`, `"inactive"`, `"closed"` |
| `activatedAt` | Timestamp/null | no | |
| `activatedBy` | string/null | no | Admin UID |
| `closedAt` | Timestamp/null | no | |
| `closedBy` | string/null | no | Admin UID |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | yes | |
| `createdBy` | string | no | Admin UID |
| `rolloverSummary` | object | no | Written by rollover execution: `{ studentsUpdated, profilesActivated, profilesClosed, graduates, failed, skipped, completedBy, completedAt }` |

### Uniqueness Constraint
`schoolId + year` must be unique (enforced by query check before insert).

### Only One ACTIVE per School
Enforced by `activateAcademicYear()` via Firestore transaction.

---

## `studentFeeProfiles` (V2)

One document per student per academic year. Doc ID: `${studentId}_${academicYearId}` (deterministic).

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentId` | string | yes | |
| `academicYearId` | string | yes | References `academicYears` document ID |
| `academicYear` | string | yes | Denormalised year string e.g. `"2025-26"` |
| `schoolId` | string | yes | |
| `classId` | string | yes | References `classes` docId |
| `classLabel` | string | yes | |
| `feeStructureId` | null | yes | Always null (multiple fixed structures) |
| `feeLineItems` | array | yes | Snapshot of `FeeLineItem[]` at profile creation time |
| `variableFeeIds` | string[] | yes | IDs of applied variable fee structures |
| `schedule` | string | yes | `"monthly"` or `"quarterly"` |
| `grossAnnualFee` | number | yes | Sum before adjustments |
| `feeAdjustments` | array | yes | Array of `FeeAdjustment[]` |
| `totalAdjustmentAmount` | number | yes | Sum of `computedAmount` across adjustments |
| `netAnnualFee` | number | yes | `grossAnnualFee - totalAdjustmentAmount`, min 0 |
| `openingOutstanding` | number | yes | Carry-forward dues from prior year. 0 after installments generated |
| `openingCredit` | number | yes | Credit from prior year. 0 after installments generated |
| `openingPaid` | number | yes | Running total of opening balance payments |
| `installmentsGenerated` | boolean | yes | `false` until `createInstallments()` called |
| `revisionCount` | number | yes | Number of applied revisions |
| `lastRevisedAt` | Timestamp/null | no | |
| `status` | string | yes | `"draft"`, `"active"`, `"closed"` |
| `promotedFromProfileId` | string/null | no | Prior-year profile ID if promoted |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | yes | |
| `createdBy` | string | no | Admin UID |

### FeeLineItem embedded object

| Field | Type | Notes |
|---|---|---|
| `feeStructureId` | string | References `feeStructures` |
| `label` | string | Snapshot of label at profile creation |
| `amount` | number | Per-cycle INR |
| `type` | string | `"fixed"` or `"variable"` |
| `isOneTime` | boolean | |
| `chargedDuringHolidays` | boolean | |
| `allocationPriority` | number | |

### FeeAdjustment embedded object

| Field | Type | Notes |
|---|---|---|
| `type` | string | `AdjustmentType` enum value |
| `label` | string | |
| `calculationType` | string | `"percentage"` or `"fixed_amount"` |
| `value` | number | Percentage value (0-100) or fixed INR amount |
| `scope` | string | `"total_fee"` or `"specific_components"` |
| `targetComponentIds` | string[] | feeStructureIds if scope is SPECIFIC_COMPONENTS |
| `maxAmount` | number/null | Cap for percentage adjustments |
| `computedAmount` | number | Server-derived; caller value is discarded |

---

## `feeInstallments` (V2)

One document per installment period per profile. Doc ID: `${profileId}_${period}`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `feeProfileId` | string | yes | References `studentFeeProfiles` |
| `studentId` | string | yes | |
| `schoolId` | string | yes | |
| `academicYear` | string | yes | |
| `installmentNumber` | number | yes | 1-based sequential |
| `period` | string | yes | `"YYYY-MM"` or `"Q{n}-YYYY-YY"` |
| `periodLabel` | string | yes | Human-readable |
| `dueDate` | Timestamp | yes | Due date for this installment |
| `isHolidayMonth` | boolean | yes | |
| `lineItems` | array | yes | `FeeLineItem[]` for this period |
| `grossAmount` | number | yes | Sum of line item amounts |
| `discountAmount` | number | yes | Adjustment applied (from FeeRevisionEngine) |
| `netAmount` | number | yes | `grossAmount - discountAmount` |
| `totalAllocated` | number | yes | INR already allocated from payments |
| `openingOutstanding` | number | yes | Carry-forward dues applied to this installment |
| `balance` | number | yes | Remaining `netAmount - totalAllocated` |
| `status` | string | yes | `"upcoming"`, `"due"`, `"partial"`, `"overdue"`, `"paid"`, `"cancelled"`, `"waived"` |
| `isLocked` | boolean | yes | Period closed |
| `cancelledAt` | Timestamp/null | no | |
| `cancellationReason` | string/null | no | |
| `waivedBy` | string/null | no | |
| `waivedAt` | Timestamp/null | no | |
| `waiverReason` | string/null | no | |
| `lastRevisionId` | string/null | no | |
| `lastRevisedAt` | Timestamp/null | no | |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | yes | |

---

## `paymentAllocations` (V2)

One document per (payment, target) pair. Target is either an installment or the opening balance.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `paymentId` | string | yes | References `feePayments` |
| `feeProfileId` | string | yes | |
| `studentId` | string | yes | |
| `schoolId` | string | yes | |
| `academicYear` | string | yes | |
| `allocationStrategy` | string | yes | `"proportional"`, `"priority_order"`, `"explicit"` |
| `allocationTarget` | string | yes | `"installment"` or `"opening_balance"` |
| `installmentId` | string/null | yes | Doc ID of `feeInstallments`; null if opening balance |
| `period` | string/null | yes | Period string; null if opening balance |
| `periodLabel` | string | yes | |
| `allocatedAmount` | number | yes | INR allocated |
| `componentAllocations` | array | yes | `ComponentAlloc[]` |
| `createdAt` | Timestamp | yes | |

### ComponentAlloc embedded object

| Field | Type | Notes |
|---|---|---|
| `feeStructureId` | string | |
| `label` | string | |
| `allocatedAmount` | number | |

---

## `feeRevisions` (V2)

One document per revision request per fee profile.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentId` | string | yes | |
| `profileId` | string | yes | References `studentFeeProfiles` |
| `schoolId` | string | no | |
| `academicYear` | string | yes | `"YYYY-YY"` |
| `status` | string | yes | `"draft"`, `"pending_approval"`, `"approved"`, `"rejected"`, `"applied"`, `"cancelled"` |
| `effectiveInstallment` | string | yes | Period from which changes apply e.g. `"2025-07"` |
| `reason` | string | yes | Non-empty justification |
| `requestedBy` | string | yes | Admin identifier |
| `requestedAt` | Timestamp | yes | |
| `approvedBy` | string/null | no | |
| `approvedAt` | Timestamp/null | no | |
| `appliedBy` | string/null | no | |
| `appliedAt` | Timestamp/null | no | |
| `cancelledBy` | string/null | no | |
| `cancelledAt` | Timestamp/null | no | |
| `cancellationReason` | string/null | no | |
| `rejectedBy` | string/null | no | |
| `rejectedAt` | Timestamp/null | no | |
| `rejectionNote` | string/null | no | |
| `changes` | array | yes | `RevisionChangeEntry[]` |

### RevisionChangeEntry embedded object

| Field | Type | Notes |
|---|---|---|
| `changeType` | string | `RevisionChangeType` enum |
| (additional fields vary by changeType) | | |

---

## `promotionBatches`

One document per bulk promotion/graduation operation.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schoolId` | string | yes | |
| `fromAcademicYear` | string | yes | `"YYYY-YY"` |
| `toAcademicYear` | string | yes | `"YYYY-YY"` |
| `fromClassId` | string | yes | Source class docId |
| `toClassId` | string/null | yes | Destination class docId; null for GRADUATION |
| `promotionType` | string | yes | `"class_promotion"` or `"graduation"` |
| `status` | string | yes | `"draft"`, `"running"`, `"completed"`, `"partial_success"`, `"failed"`, `"cancelled"` |
| `carryFeeBalance` | boolean | yes | Whether to carry unpaid balance to new year |
| `carryVariableFees` | boolean | yes | Whether to carry variable fee assignments |
| `totalStudents` | number | yes | |
| `completedStudents` | number | yes | |
| `failedStudents` | number | yes | |
| `skippedStudents` | number | yes | |
| `requestedBy` | string | yes | Admin UID |
| `requestedAt` | Timestamp | yes | |
| `completedBy` | string/null | no | |
| `completedAt` | Timestamp/null | no | |
| `remarks` | string/null | no | |
| `promotionPlanSnapshot` | object | yes | `{ academicYear, carryFeeBalance, carryVariableFees, selectedStudentCount }` |

---

## `studentPromotions`

One document per student per promotion batch.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `batchId` | string | yes | References `promotionBatches` |
| `studentId` | string | yes | |
| `schoolId` | string | yes | |
| `fromClassId` | string | yes | Source class docId |
| `toClassId` | string/null | yes | Destination class; null for GRADUATION |
| `promotionType` | string | yes | `"class_promotion"` or `"graduation"` |
| `status` | string | yes | `"draft"`, `"pending"`, `"completed"`, `"failed"`, `"skipped"`, `"cancelled"` |
| `promotionResult` | string/null | no | `"promoted"`, `"graduated"`, `"repeated"`, `"transferred"`, `"left_school"`, `"skipped"` |
| `oldFeeProfileId` | string/null | no | Profile to close |
| `newFeeProfileId` | string/null | no | Draft profile created for new year |
| `openingOutstanding` | number | no | Balance carried forward |
| `openingCredit` | number | no | Credit carried forward |
| `promotionPlan` | object | no | Engine output: `{ newFeeProfile, promotionResult, warnings, errors }` |
| `promotionId` | string | no | Same as Firestore doc ID (denormalised for convenience) |
| `errorMessage` | string/null | no | |
| `warnings` | array | no | `[{ code, message }]` |
| `completedAt` | Timestamp/null | no | |
| `createdAt` | Timestamp | yes | |
| `updatedAt` | Timestamp | no | |

---

## Composite Indexes (from `firestore.indexes.json`)

| Collection | Fields | Order |
|---|---|---|
| `feeInstallments` | `feeProfileId` ASC, `installmentNumber` ASC | |
| `feeInstallments` | `feeProfileId` ASC, `dueDate` ASC | |
| `feeInstallments` | `studentId` ASC, `academicYear` ASC | |
| `studentFeeProfiles` | `schoolId` ASC, `academicYear` ASC | |
| `studentFeeProfiles` | `studentId` ASC, `academicYear` ASC | |
| `feePayments` | `studentId` ASC, `createdAt` DESC | |
| `feePayments` | `schoolId` ASC, `createdAt` DESC | |
| `paymentAllocations` | `installmentId` ASC, `createdAt` ASC | |
| `paymentAllocations` | `paymentId` ASC, `createdAt` ASC | |
| `feeRevisions` | `feeProfileId` ASC, `createdAt` DESC | |
| `feeRevisions` | `schoolId` ASC, `createdAt` DESC | |
| `feeRevisions` | `studentId` ASC, `createdAt` DESC | |
| `academicYears` | `schoolId` ASC, `status` ASC | |
| `feeStructures` | `schoolId` ASC, `type` ASC | |
| `feeStructures` | `schoolId` ASC, `classId` ASC, `type` ASC | |
| `promotionBatches` | `schoolId` ASC, `createdAt` DESC | |
| `studentPromotions` | `batchId` ASC, `studentId` ASC | |
