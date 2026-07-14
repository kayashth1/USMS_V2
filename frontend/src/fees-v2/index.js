/**
 * Fee Management V2 — Public API
 *
 * Barrel export for the entire V2 fee module.
 * Import everything the old fee module uses from its own path (fees.service.js).
 * Import everything V2 from here.
 *
 * Example:
 *   import { AcademicYearStatus, COLLECTIONS } from "@/fees-v2";
 *   import { createAcademicYear } from "@/fees-v2";
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  AcademicYearStatus,
  ProfileStatus,
  InstallmentStatus,
  PaymentStatus,
  RevisionStatus,
  RevisionChangeType,
  RevisionType,
  AdjustmentType,
  AdjustmentScope,
  AdjustmentCalculationType,
  FeeStructureType,
  FeeSchedule,
  PaymentMode,
  AllocationTarget,
  AllocationStrategy,
} from "./constants/enums.js";

export { COLLECTIONS } from "./constants/collections.js";

// ─── Validation ───────────────────────────────────────────────────────────────
export { validateAcademicYear } from "./validation/academicYear.validate.js";

export {
  validateFeeProfile,
  validateFeeLineItem,
  validateFeeAdjustment,
} from "./validation/feeProfile.validate.js";

export { validateFeeInstallment } from "./validation/feeInstallment.validate.js";

export { validateSchedule } from "./validation/scheduleValidator.js";

export {
  validateFeePayment,
  validateAllocationRef,
} from "./validation/feePayment.validate.js";

export {
  validatePaymentAllocation,
  validateComponentAlloc,
} from "./validation/paymentAllocation.validate.js";

export {
  validateFeeRevision,
  validateFeeRevisionDoc,
} from "./validation/feeRevision.validate.js";

export {
  validatePayment,
  validateProfile,
  validateInstallments,
  validateMode,
  validateAmount,
  calculateOutstanding,
} from "./validation/paymentValidator.js";

// ─── Services ─────────────────────────────────────────────────────────────────
export {
  createAcademicYear,
  updateAcademicYear,
  activateAcademicYear,
  closeAcademicYear,
  deleteAcademicYear,
  getActiveAcademicYear,
  getAcademicYearsBySchool,
  getAcademicYearById,
} from "./services/academicYear.service.js";

export {
  createDraftProfile,
  updateDraftProfile,
  activateProfile,
  closeProfile,
  getProfile,
  getProfileByStudentAndYear,
  getProfilesBySchoolAndYear,
  deleteDraftProfile,
} from "./services/feeProfile.service.js";

export {
  createInstallments,
  updateInstallment,
  getInstallments,
  getInstallmentsByStudentAndYear,
  getOutstandingInstallments,
  cancelInstallment,
  lockPeriodInstallments,
  waiverInstallmentsForBatch,
} from "./services/feeInstallment.service.js";

export {
  createPayment,
  getPayment,
  getPaymentByReceiptNo,
  getPaymentsByStudent,
  getPaymentsBySchool,
} from "./services/feePayment.service.js";

export {
  cancelPayment,
  loadPayment,
  markPaymentCancelled,
  markAllocationsReversed,
  reverseOpeningBalance,
  reverseInstallments,
} from "./services/paymentCancellation.service.js";

export {
  createAllocation,
  deleteAllocation,
  getAllocationsByInstallment,
  getAllocationsByPayment,
  computeComponentAllocations,
} from "./services/paymentAllocation.service.js";

export {
  createRevision,
  approveRevision,
  rejectRevision,
  applyRevision,
  getRevisionsByProfile,
  getRevisionById,
  getRevisionsBySchool,
  updateDraftRevision,
  submitRevision,
  cancelRevision,
  getRevision,
  getRevisionsByStudent,
} from "./services/feeRevision.service.js";

export {
  loadRevision,
  loadProfile,
  applyRevisionPlan,
} from "./services/feeRevisionPersistence.service.js";

export {
  createFeeStructure,
  updateFeeStructure,
  deactivateFeeStructure,
  updateAllocationPriority,
  getFixedFeeStructuresForClass,
  getVariableFeeStructuresOrdered,
  getAllFeeStructuresOrdered,
  getFeeStructureById,
} from "./services/feeStructure.service.js";

// ─── Revision engine (pure — no Firestore) ───────────────────────────────────
export {
  computeRevisionPlan,
  findAffectedInstallments,
  applyChange,
  applyVariableFee,
  applyFixedFee,
  applyScholarship,
  applyWaiver,
  applyFine,
  applyCorrection,
  recalculateInstallment,
  buildRevisionPlan,
} from "./feeRevisionEngine.js";

// ─── Schedule engine (pure — no Firestore) ────────────────────────────────────
export {
  generateSchedule,
  generatePeriods,
  generateMonthlyPeriods,
  generateQuarterlyPeriods,
  generateLineItemsForPeriod,
  calculateGrossAmount,
  applyAdjustments,
  calculateNetAmount,
  generateDueDate,
  resolveDueDate,
  isPeriodEligible,
} from "./feeScheduleGenerator.js";

// ─── Allocation engine (pure — no Firestore) ──────────────────────────────────
export {
  buildAllocationPlan,
  sortInstallments,
  allocateOpeningBalance,
  allocateInstallment,
  allocateComponentsByPriority,
} from "./paymentAllocationEngine.js";

// ─── Receipt utilities ────────────────────────────────────────────────────────
export {
  formatReceiptNo,
  createReceiptNumberGenerator,
  defaultReceiptGenerator,
} from "./utils/receiptNumber.js";

// ─── Receipt generator (pure — no Firestore) ──────────────────────────────────
export {
  buildReceipt,
  buildHeader,
  buildStudentSection,
  buildPaymentInfo,
  buildAllocationTable,
  buildTotals,
} from "./receiptGenerator.js";
