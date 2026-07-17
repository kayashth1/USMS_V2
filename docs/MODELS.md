# Data Models

TypeScript-style interfaces for all Firestore documents and key in-memory types. Field names match exactly what is written to Firestore. Optional fields (`?`) may be absent on older documents.

---

## Core Collections

### Student

Collection: `students`

```ts
interface Student {
  // Identity
  id:               string;   // Firestore doc ID (auto-generated or CF-assigned)
  schoolId:         string;
  name:             string;
  admissionId:      string;
  rollNumber?:      string | number;
  email?:           string;
  phone?:           string;
  guardianName?:    string;
  guardianPhone?:   string;
  address?:         string;
  dateOfBirth?:     Timestamp | string;
  gender?:          string;
  photo?:           string;   // Storage URL

  // Class placement
  classId:          string;   // Firestore doc ID of assigned class
  classLabel?:      string;   // e.g. "Grade 5 – A"
  currentClassId?:  string;   // Kept in sync with classId by rollover
  currentAcademicYear?: string; // e.g. "2025-26"

  // Status
  isActive:         boolean;
  status?:          "alumni";  // New rollover path graduates
  isGraduated?:     boolean;   // Legacy graduation path

  // Legacy graduation fields
  finalClassId?:    string;
  finalClassLabel?: string;
  academicYear?:    string;    // Year of graduation (legacy)

  // New graduation fields
  graduatedAcademicYear?: string;
  graduatedClassId?:      string;
  graduatedAt?:           Timestamp;

  // Promotion history
  promotionHistory?: Array<{
    classId:        string;
    classLabel:     string;
    academicYear:   string;
    promotedAt:     Timestamp;
  }>;

  // Timestamps
  createdAt:        Timestamp;
  updatedAt?:       Timestamp;
}
```

---

### Teacher

Collection: `teachers`

```ts
interface Teacher {
  id:           string;
  schoolId:     string;
  name:         string;
  email:        string;
  phone?:       string;
  subject?:     string;
  designation?: string;
  address?:     string;
  photo?:       string;
  isActive:     boolean;
  authUid?:     string;   // Firebase Auth UID
  createdAt:    Timestamp;
  updatedAt?:   Timestamp;
}
```

---

### Class

Collection: `classes`

```ts
interface Class {
  id:        string;   // Firestore doc ID (auto-assigned by addDoc, not computed)
  schoolId:  string;
  grade:     string | number;
  section:   string;
  isActive:  boolean;
  createdAt: Timestamp;
}
```

---

### Subject

Collection: `subjects`

```ts
interface Subject {
  id:        string;
  schoolId:  string;
  name:      string;
  isActive:  boolean;
  createdAt: Timestamp;
}
```

---

### ClassSubject

Collection: `classSubjects`

```ts
interface ClassSubject {
  id:        string;
  classId:   string;
  subjectId: string;
  schoolId:  string;
  createdAt: Timestamp;
}
```

---

### TeacherClassSubject

Collection: `teacherClassSubjects`

```ts
interface TeacherClassSubject {
  id:        string;
  teacherId: string;
  classId:   string;
  subjectId: string;
  schoolId:  string;
  createdAt: Timestamp;
}
```

---

### School

Collection: `schools`

```ts
interface School {
  id:              string;
  name:            string;
  address?:        string;
  phone?:          string;
  email?:          string;
  logo?:           string;
  isActive:        boolean;

  // Plan gating
  plan:            "free" | "premium";
  planExpiresAt?:  Timestamp | null;

  // Fee settings (used by legacy module)
  feeAcademicYear?:  string;   // e.g. "2025-26"
  feeSchedule?:      "monthly" | "quarterly";
  holidayMonths?:    number[]; // 1-indexed calendar months

  createdAt:       Timestamp;
  updatedAt?:      Timestamp;
}
```

---

### Principal

Collection: `principals`

```ts
interface Principal {
  id:        string;   // Firebase Auth UID
  schoolId:  string;
  name:      string;
  email:     string;
  isActive:  boolean;
  createdAt: Timestamp;
}
```

---

### SuperAdmin

Collection: `superadmins`

```ts
interface SuperAdmin {
  id:    string;   // Firebase Auth UID
  email: string;
  name?: string;
}
```

---

### Notice

Collection: `notices`

```ts
interface Notice {
  id:          string;
  schoolId:    string;
  title:       string;
  content:     string;
  audience:    "All" | "Students" | "Teachers";
  attachments?: Array<{
    name: string;
    url:  string;
    type: string;   // MIME type
    size: number;   // bytes
  }>;
  createdAt:   Timestamp;
  createdBy?:  string;
}
```

---

### TimePeriod

Collection: `timePeriods`

```ts
interface TimePeriod {
  id:        string;
  schoolId:  string;
  name:      string;   // e.g. "Period 1"
  from:      string;   // e.g. "08:00"
  to:        string;   // e.g. "08:45"
  order:     number;
  createdAt: Timestamp;
}
```

---

## Legacy Fee Collections

### StudentFeeYear

Collection: `studentFeeYears`

```ts
interface StudentFeeYear {
  id:               string;
  studentId:        string;
  schoolId:         string;
  academicYear:     string;
  schedule:         "monthly" | "quarterly";
  feeStructure:     Record<string, number>;  // { "Tuition Fee": 1000, ... }
  openingBalance?:  number;
  closingBalance?:  number;
  totalDue:         number;
  totalPaid:        number;
  isClosed:         boolean;
  createdAt:        Timestamp;
}
```

---

### FeePayment (Legacy)

Collection: `feePayments`

```ts
interface FeePaymentLegacy {
  id:              string;
  studentId:       string;
  schoolId:        string;
  academicYear:    string;
  period:          string;    // e.g. "Apr-2025" or "Q1-2025-26" or "opening-2025-26"
  sortIndex:       number;    // -1 for opening, 0–11 for Apr–Mar
  totalDue:        number;
  amountPaid:      number;
  outstanding:     number;
  carryForward:    number;
  status:          "paid" | "partial" | "pending";
  isClosed:        boolean;
  isBalanceTransfer?: boolean;
  paymentDate?:    Timestamp;
  paymentMode?:    string;
  notes?:          string;
  createdAt:       Timestamp;
  updatedAt?:      Timestamp;
}
```

---

## Fee Management V2 Collections

### AcademicYear

Collection: `academicYears`

```ts
type AcademicYearStatus = "active" | "inactive" | "closed";

interface AcademicYear {
  id:              string;
  schoolId:        string;
  year:            string;     // e.g. "2025-26"
  startDate:       Timestamp;
  endDate:         Timestamp;
  feeSchedule:     "monthly" | "quarterly";
  holidayMonths?:  number[];   // 1-indexed calendar months
  status:          AcademicYearStatus;
  createdAt:       Timestamp;
  updatedAt?:      Timestamp;
  // Populated by rollover:
  rolloverSummary?: {
    promoted:  number;
    graduated: number;
    failed:    number;
    skippedIds: string[];
  };
}
```

---

### FeeStructure

Collection: `feeStructures`

```ts
type FeeStructureType = "fixed" | "variable";

interface FeeStructure {
  id:                   string;
  schoolId:             string;
  name:                 string;
  type:                 FeeStructureType;
  amount:               number;
  classId?:             string;   // Only for type=="fixed"
  chargedDuringHolidays: boolean;
  isOneTime?:           boolean;
  isActive:             boolean;
  allocationPriority:   number;   // Lower number = allocated first
  createdAt:            Timestamp;
  updatedAt?:           Timestamp;
}
```

---

### FeeLineItem

Embedded array in `StudentFeeProfile.feeLineItems` and `FeeInstallment.lineItems`.

```ts
interface FeeLineItem {
  feeStructureId:  string;
  label:           string;
  amount:          number;       // Annual amount (in profile); period amount (in installment)
  isOneTime?:      boolean;
  chargedDuringHolidays: boolean;
  allocationPriority: number;
}
```

---

### FeeAdjustment

Embedded array in `StudentFeeProfile.feeAdjustments`.

```ts
type AdjustmentType = "scholarship" | "concession" | "sibling_discount" |
                      "staff_benefit" | "government_scheme" | "waiver" | "other";
type AdjustmentScope = "total_fee" | "specific_components";
type AdjustmentCalculationType = "percentage" | "fixed_amount";

interface FeeAdjustment {
  adjustmentId:       string;   // Client-generated UUID
  type:               AdjustmentType;
  label:              string;
  scope:              AdjustmentScope;
  calculationType:    AdjustmentCalculationType;
  value:              number;   // Percentage (0–100) or absolute INR
  computedAmount:     number;   // Always server-derived; never use caller-supplied value
  targetFeeIds?:      string[]; // When scope=="specific_components"
  notes?:             string;
  isCarried?:         boolean;  // True if carried from previous year
}
```

---

### StudentFeeProfile

Collection: `studentFeeProfiles`

Document ID: `${studentId}_${academicYearId}` (deterministic)

```ts
type ProfileStatus = "draft" | "active" | "closed";

interface StudentFeeProfile {
  id:                   string;
  studentId:            string;
  schoolId:             string;
  academicYearId:       string;
  academicYear:         string;  // e.g. "2025-26"
  classId:              string;
  classLabel?:          string;
  schedule:             "monthly" | "quarterly";

  // Fee composition
  feeLineItems:         FeeLineItem[];
  variableFeeIds:       string[];
  feeAdjustments:       FeeAdjustment[];
  grossAnnualFee:       number;
  totalAdjustmentAmount: number;
  netAnnualFee:         number;

  // Opening balance carry-forward
  openingOutstanding:   number;   // Prior-year debt (reset to 0 after installment generation)
  openingCredit:        number;   // Prior-year credit (reset to 0 after installment generation)
  openingPaid?:         number;   // Tracks how much of opening was paid (for cancellation reversal)

  // Status
  status:               ProfileStatus;
  installmentsGenerated: boolean;

  // Revision tracking
  revisionCount?:       number;
  lastRevisionId?:      string;
  lastRevisionType?:    string[];
  lastRevisionAt?:      Timestamp;
  lastRevisedAt?:       Timestamp;

  // Audit
  createdAt:            Timestamp;
  updatedAt?:           Timestamp;
}
```

---

### FeeInstallment

Collection: `feeInstallments`

Document ID: `${profileId}_${period}` (deterministic)

```ts
type InstallmentStatus =
  | "upcoming" | "due" | "partial" | "overdue"
  | "paid" | "cancelled" | "waived";

interface FeeInstallment {
  id:               string;
  profileId:        string;
  studentId:        string;
  schoolId:         string;
  academicYearId:   string;
  installmentNumber: number;

  // Period
  period:           string;   // "YYYY-MM" (monthly) or "Q{n}-YYYY-YY" (quarterly)
  periodLabel:      string;   // Human-readable

  // Amounts
  lineItems:        FeeLineItem[];
  grossAmount:      number;
  discountAmount:   number;
  netAmount:        number;
  balance:          number;
  totalAllocated:   number;

  // Dates
  dueDate:          Timestamp;
  status:           InstallmentStatus;
  isLocked?:        boolean;

  // Waiver fields
  waivedBy?:        string;
  waivedAt?:        Timestamp;
  waiverReason?:    string;

  // Timestamps
  createdAt:        Timestamp;
  updatedAt?:       Timestamp;
}
```

---

### FeePayment (V2)

Collection: `feePayments`

```ts
type PaymentStatus = "confirmed" | "cancelled";
type PaymentMode = "cash" | "upi" | "cheque" | "dd" | "online";

interface FeePaymentV2 {
  id:               string;
  schoolId:         string;
  studentId:        string;
  feeProfileId:     string;
  academicYearId:   string;
  receiptNo:        string;   // School-scoped sequential: e.g. "RCP-2025-06-0001"
  amount:           number;
  paymentMode:      PaymentMode;
  paymentDate:      Timestamp;
  collectedBy:      string;   // Admin UID
  notes?:           string;
  status:           PaymentStatus;

  // Allocation summary (embedded for fast receipt rendering)
  allocationSummary?: {
    openingBalanceAllocation: number;
    installmentAllocations:   Array<{
      installmentId:     string;
      installmentNumber: number;
      period:            string;
      periodLabel:       string;
      allocatedAmount:   number;
    }>;
    allocatedAmount:    number;
    unallocatedAmount:  number;
  };

  // Cancellation
  cancelledAt?:        Timestamp;
  cancelledBy?:        string;
  cancellationReason?: string;

  // Timestamps
  createdAt:           Timestamp;
  updatedAt?:          Timestamp;
}
```

---

### PaymentAllocation

Collection: `paymentAllocations`

```ts
type AllocationTarget = "installment" | "opening_balance";

interface PaymentAllocation {
  id:                   string;
  paymentId:            string;
  profileId:            string;
  studentId:            string;
  schoolId:             string;
  academicYearId:       string;
  allocationTarget:     AllocationTarget;
  installmentId?:       string;   // When target=="installment"
  installmentNumber?:   number;
  allocatedAmount:      number;   // Also stored as `amount` in legacy docs
  componentAllocations?: Array<{
    feeStructureId:  string;
    label:           string;
    allocatedAmount: number;
  }>;

  // Reversal (set when payment is cancelled)
  isReversed?:  boolean;
  reversedAt?:  Timestamp;

  createdAt:    Timestamp;
}
```

---

### FeeRevision

Collection: `feeRevisions`

```ts
type RevisionStatus =
  | "draft" | "pending_approval" | "approved" | "rejected" | "applied" | "cancelled";

type RevisionChangeType =
  | "add_item" | "remove_item" | "adjust_amount"
  | "add_adjustment" | "modify_adjustment" | "remove_adjustment" | "cancel_installment";

type RevisionType =
  | "add_variable_fee" | "remove_variable_fee"
  | "add_fixed_fee" | "remove_fixed_fee"
  | "scholarship" | "waiver" | "fine" | "fee_correction";

interface RevisionChange {
  changeType:         RevisionChangeType;
  revisionType:       RevisionType;
  feeStructureId?:    string;
  adjustmentId?:      string;
  newAmount?:         number;
  description?:       string;
}

interface FeeRevision {
  revisionId:           string;
  profileId:            string;
  studentId:            string;
  schoolId:             string;
  academicYearId:       string;
  reason:               string;
  effectiveInstallment: number;   // installmentNumber from which change applies
  changes:              RevisionChange[];
  status:               RevisionStatus;

  // Approval workflow
  submittedBy?:     string;
  submittedAt?:     Timestamp;
  approvedBy?:      string;
  approvedAt?:      Timestamp;
  rejectedBy?:      string;
  rejectedAt?:      Timestamp;
  rejectionReason?: string;
  cancelledBy?:     string;
  cancelledAt?:     Timestamp;
  appliedBy?:       string;
  appliedAt?:       Timestamp;

  createdAt:        Timestamp;
  updatedAt?:       Timestamp;
}
```

---

## Promotion Collections

### PromotionBatch

Collection: `promotionBatches`

```ts
type BatchStatus =
  | "draft" | "running" | "completed" | "partial_success" | "failed" | "cancelled";

type PromotionType = "class_promotion" | "graduation";

interface PromotionBatch {
  batchId:       string;
  schoolId:      string;
  promotionType: PromotionType;

  // Source / destination
  fromClassId:       string;
  toClassId?:        string;   // Absent for GRADUATION
  fromAcademicYear:  string;
  toAcademicYear:    string;

  // Carry options
  carryFeeBalance?:   boolean;
  carryVariableFees?: boolean;

  // Counters
  totalStudents:      number;
  completedStudents:  number;
  failedStudents:     number;
  skippedStudents:    number;

  // Embedded wizard snapshot (config captured at creation)
  promotionPlanSnapshot?: Record<string, unknown>;

  status:        BatchStatus;
  createdBy:     string;
  createdAt:     Timestamp;
  completedBy?:  string;
  completedAt?:  Timestamp;
  cancelledBy?:  string;
  cancelledAt?:  Timestamp;
  updatedAt?:    Timestamp;
}
```

---

### StudentPromotion

Collection: `studentPromotions`

```ts
type PromotionStatus = "draft" | "pending" | "completed" | "failed" | "skipped";
type PromotionResult = "promoted" | "graduated";

interface StudentPromotion {
  promotionId:           string;
  batchId:               string;
  schoolId:              string;
  studentId:             string;
  promotionType:         PromotionType;

  // Academic year
  fromAcademicYear:      string;
  toAcademicYear:        string;

  // Class
  fromClassId:           string;
  toClassId?:            string;

  // Fee carry data (snapshot at wizard time)
  openingOutstanding:    number;
  openingCredit:         number;
  carriedVariableFeeIds: string[];
  oldFeeProfileId?:      string | null;

  // Execution results
  status:                PromotionStatus;
  promotionResult?:      PromotionResult | null;
  newFeeProfileId?:      string | null;
  errorMessage?:         string | null;
  warnings?:             string[];

  // Immutable audit snapshot of PromotionPlan (written by persistPromotionPlan)
  promotionPlan?:        Record<string, unknown> | null;

  // Audit
  requestedBy:   string;
  requestedAt:   Timestamp;
  completedBy?:  string | null;
  completedAt?:  Timestamp | null;
}
```

---

## Pure Engine Types

### ScheduleEntry (feeScheduleGenerator.js output)

```ts
interface ScheduleEntry {
  installmentNumber: number;
  period:            string;
  periodLabel:       string;
  lineItems:         FeeLineItem[];
  grossAmount:       number;
  discountAmount:    number;
  netAmount:         number;
  balance:           number;
  dueDate:           Date;
  status:            "scheduled";
}
```

---

### AllocationPlan (paymentAllocationEngine.js output)

```ts
interface ComponentAllocation {
  feeStructureId:  string;
  label:           string;
  allocatedAmount: number;
}

interface InstallmentAllocation {
  installmentId:        string;
  installmentNumber:    number;
  period:               string;
  periodLabel:          string;
  allocatedAmount:      number;
  remainingBalance:     number;
  componentAllocations: ComponentAllocation[];
}

interface AllocationPlan {
  openingBalanceAllocation: number;
  installmentAllocations:   InstallmentAllocation[];
  allocatedAmount:          number;
  unallocatedAmount:        number;
}
```

---

### PromotionPlan (promotionEngine.js output)

```ts
interface PromotionPlan {
  errors:          Array<{ code: string; message: string }>;
  warnings:        string[];
  promotionResult: "promoted" | "graduated" | null;
  newFeeProfile:   Omit<StudentFeeProfile, "id" | "createdAt" | "updatedAt"> | null;
}
```

---

### RolloverPlan (rolloverEngine.js output)

```ts
type RolloverAction =
  | { type: "StudentUpdate";     studentPromotion: StudentPromotion }
  | { type: "ProfileActivation"; studentPromotion: StudentPromotion }
  | { type: "ProfileClosure";    studentPromotion: StudentPromotion }
  | { type: "GraduationUpdate";  studentPromotion: StudentPromotion };

interface RolloverPlan {
  currentAcademicYear:   AcademicYear;
  nextAcademicYear:      AcademicYear;
  actions:               RolloverAction[];
  skippedPromotionIds:   string[];
}
```

---

## localStorage Session Keys

```ts
interface SessionStorage {
  principalId:       string;   // Firebase Auth UID
  principalSchoolId: string;   // Firestore school doc ID
  principalName:     string;
  isSuperAdmin?:     "true";   // String "true" or absent
}
```
