/**
 * Enums and status constants for the Fee Management V2 system.
 * All objects are frozen to prevent accidental mutation.
 */

/**
 * Academic year lifecycle:
 *   INACTIVE → created; not yet the working year
 *   ACTIVE   → current working year (only one per school at a time)
 *   INACTIVE → was active; deactivated when a different year was activated;
 *              awaiting formal close
 *   CLOSED   → formally closed after year-end procedures (terminal)
 *
 * Transitions:
 *   INACTIVE → ACTIVE   via activateAcademicYear()
 *   ACTIVE   → INACTIVE automatically when another year is activated
 *   ACTIVE/INACTIVE → CLOSED via closeAcademicYear() (with validation)
 */
export const AcademicYearStatus = Object.freeze({
  ACTIVE:   "active",
  INACTIVE: "inactive",
  CLOSED:   "closed",
});

/**
 * Student fee profile lifecycle:
 *   DRAFT  → profile created; fee items and adjustments being configured;
 *            installments not yet generated
 *   ACTIVE → installments generated; profile is live; payments are accepted
 *   CLOSED → student promoted or profile retired at year end (terminal)
 */
export const ProfileStatus = Object.freeze({
  DRAFT:  "draft",
  ACTIVE: "active",
  CLOSED: "closed",
});

export const InstallmentStatus = Object.freeze({
  UPCOMING:  "upcoming",
  DUE:       "due",
  PARTIAL:   "partial",
  OVERDUE:   "overdue",
  PAID:      "paid",
  CANCELLED: "cancelled",
  WAIVED:    "waived",
});

export const PaymentStatus = Object.freeze({
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
});

/**
 * Revision approval workflow status.
 *
 * Lifecycle:
 *   PENDING  → created, awaiting review
 *   APPROVED → authorised by a reviewer; installments NOT yet modified
 *   REJECTED → declined; profile and installments remain unchanged
 *   APPLIED  → changes propagated to installments and profile; document is immutable
 *
 * APPROVED and APPLIED are intentionally distinct: a revision may be approved
 * (authorised) but not yet applied (written to installments). This allows a
 * review gate before any financial data is mutated.
 *
 * Extended lifecycle (Fee Revision module):
 *   DRAFT            → saved but not yet submitted; still editable
 *   PENDING_APPROVAL → submitted, awaiting reviewer action
 *   CANCELLED        → withdrawn before approval; no financial effect
 */
export const RevisionStatus = Object.freeze({
  DRAFT:            "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED:         "approved",
  REJECTED:         "rejected",
  APPLIED:          "applied",
  CANCELLED:        "cancelled",
});

export const RevisionChangeType = Object.freeze({
  ADD_ITEM:           "add_item",
  REMOVE_ITEM:        "remove_item",
  ADJUST_AMOUNT:      "adjust_amount",
  ADD_ADJUSTMENT:     "add_adjustment",
  MODIFY_ADJUSTMENT:  "modify_adjustment",
  REMOVE_ADJUSTMENT:  "remove_adjustment",
  CANCEL_INSTALLMENT: "cancel_installment",
});

/**
 * High-level semantic classification of what a Fee Revision changes.
 * Used on FeeRevisionDoc.revisionType.
 *
 * Distinct from RevisionChangeType, which describes the low-level Firestore
 * operation applied to installments during applyRevision(). A single revisionType
 * may map to one or more RevisionChangeType operations internally.
 *
 * Type → expected changeDetails shape:
 *   ADD_VARIABLE_FEE / REMOVE_VARIABLE_FEE → VariableFeeChangeDetail
 *   ADD_FIXED_FEE    / REMOVE_FIXED_FEE    → FixedFeeChangeDetail
 *   SCHOLARSHIP                            → ScholarshipChangeDetail
 *   WAIVER                                 → WaiverChangeDetail
 *   FINE                                   → FineChangeDetail
 *   FEE_CORRECTION                         → CorrectionChangeDetail
 */
export const RevisionType = Object.freeze({
  ADD_VARIABLE_FEE:    "add_variable_fee",
  REMOVE_VARIABLE_FEE: "remove_variable_fee",
  ADD_FIXED_FEE:       "add_fixed_fee",
  REMOVE_FIXED_FEE:    "remove_fixed_fee",
  SCHOLARSHIP:         "scholarship",
  WAIVER:              "waiver",
  FINE:                "fine",
  FEE_CORRECTION:      "fee_correction",
});

export const AdjustmentType = Object.freeze({
  SCHOLARSHIP:       "scholarship",
  CONCESSION:        "concession",
  SIBLING_DISCOUNT:  "sibling_discount",
  STAFF_BENEFIT:     "staff_benefit",
  GOVERNMENT_SCHEME: "government_scheme",
  WAIVER:            "waiver",
  OTHER:             "other",
});

export const AdjustmentScope = Object.freeze({
  TOTAL_FEE:           "total_fee",
  SPECIFIC_COMPONENTS: "specific_components",
});

export const AdjustmentCalculationType = Object.freeze({
  PERCENTAGE:   "percentage",
  FIXED_AMOUNT: "fixed_amount",
});

export const FeeStructureType = Object.freeze({
  FIXED:    "fixed",
  VARIABLE: "variable",
});

export const FeeSchedule = Object.freeze({
  MONTHLY:   "monthly",
  QUARTERLY: "quarterly",
});

export const PaymentMode = Object.freeze({
  CASH:   "cash",
  UPI:    "upi",
  CHEQUE: "cheque",
  DD:     "dd",
  ONLINE: "online",
});

export const AllocationTarget = Object.freeze({
  INSTALLMENT:     "installment",
  OPENING_BALANCE: "opening_balance",
});

export const AllocationStrategy = Object.freeze({
  PROPORTIONAL:   "proportional",
  PRIORITY_ORDER: "priority_order",
  EXPLICIT:       "explicit",
});
