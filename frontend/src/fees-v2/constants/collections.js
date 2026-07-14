/**
 * Firestore collection name constants for the Fee Management V2 system.
 *
 * feePayments is the production collection name for V2 payment transactions.
 * The old fee module writes a different document schema to the same collection
 * name during the migration period. Coexistence is managed at the code level
 * (separate service files), not by permanently renaming the collection.
 *
 * feeStructures is the existing shared collection. V2 extends it with the
 * allocationPriority field; the collection name is unchanged.
 *
 * All other V2 collections (academicYears, studentFeeProfiles, feeInstallments,
 * paymentAllocations, feeRevisions) are net-new with no legacy equivalent.
 */
export const COLLECTIONS = Object.freeze({
  ACADEMIC_YEARS:       "academicYears",
  STUDENT_FEE_PROFILES: "studentFeeProfiles",
  FEE_INSTALLMENTS:     "feeInstallments",
  FEE_PAYMENTS:         "feePayments",
  PAYMENT_ALLOCATIONS:  "paymentAllocations",
  FEE_REVISIONS:        "feeRevisions",
  FEE_STRUCTURES:       "feeStructures",
});
