import { PaymentStatus, PaymentMode } from "../constants/enums.js";

const RECEIPT_PATTERN = /^RCP-\d{8}-\d{4}$/;

/**
 * Validates an AllocationRef embedded object.
 *
 * @param {import('../types.js').AllocationRef} ref
 * @returns {import('../types.js').ValidationResult}
 */
export function validateAllocationRef(ref) {
  const errors = [];

  if (!["installment", "opening_balance"].includes(ref.target)) {
    errors.push("target must be 'installment' or 'opening_balance'");
  }
  if (ref.target === "installment" && !ref.installmentId) {
    errors.push("installmentId is required when target is 'installment'");
  }
  if (ref.target === "opening_balance" && ref.installmentId != null) {
    errors.push("installmentId must be null when target is 'opening_balance'");
  }
  if (!ref.periodLabel) {
    errors.push("periodLabel is required");
  }
  if (typeof ref.amount !== "number" || ref.amount <= 0) {
    errors.push("amount must be a positive number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates data intended for a feePayments_v2 document.
 * Also enforces the allocationSummary sum invariant.
 *
 * @param {Partial<import('../types.js').FeePayment>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeePayment(data) {
  const errors = [];

  if (!data.receiptNo) {
    errors.push("receiptNo is required");
  } else if (!RECEIPT_PATTERN.test(data.receiptNo)) {
    errors.push("receiptNo must match format RCP-YYYYMMDD-XXXX");
  }

  if (!data.studentId)    errors.push("studentId is required");
  if (!data.schoolId)     errors.push("schoolId is required");
  if (!data.academicYear) errors.push("academicYear is required");
  if (!data.createdBy)    errors.push("createdBy is required");
  if (!data.collectedBy)  errors.push("collectedBy is required");

  if (typeof data.amount !== "number" || data.amount <= 0) {
    errors.push("amount must be a positive number");
  }
  if (!data.paymentDate) {
    errors.push("paymentDate is required");
  }
  if (!Object.values(PaymentMode).includes(data.paymentMode)) {
    errors.push(`paymentMode must be one of: ${Object.values(PaymentMode).join(", ")}`);
  }

  if (!Array.isArray(data.allocationSummary)) {
    errors.push("allocationSummary must be an array");
  } else {
    if (data.allocationSummary.length === 0) {
      errors.push("allocationSummary must have at least one entry");
    }
    data.allocationSummary.forEach((ref, i) => {
      const result = validateAllocationRef(ref);
      result.errors.forEach((e) => errors.push(`allocationSummary[${i}]: ${e}`));
    });
    if (typeof data.amount === "number") {
      const allocSum = data.allocationSummary.reduce((s, r) => s + (r.amount || 0), 0);
      if (Math.abs(allocSum - data.amount) > 0.01) {
        errors.push(`sum of allocationSummary amounts (${allocSum}) must equal payment amount (${data.amount})`);
      }
    }
  }

  if (!Object.values(PaymentStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(PaymentStatus).join(", ")}`);
  }
  if (data.status === PaymentStatus.CANCELLED && !data.cancelledAt) {
    errors.push("cancelledAt is required when status is 'cancelled'");
  }
  if (data.status === PaymentStatus.CANCELLED && !data.cancelledBy) {
    errors.push("cancelledBy is required when status is 'cancelled'");
  }

  return { valid: errors.length === 0, errors };
}
