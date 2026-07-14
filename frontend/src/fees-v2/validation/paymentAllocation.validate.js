import { AllocationTarget, AllocationStrategy } from "../constants/enums.js";

/**
 * Validates a ComponentAlloc embedded object.
 *
 * @param {import('../types.js').ComponentAlloc} comp
 * @returns {import('../types.js').ValidationResult}
 */
export function validateComponentAlloc(comp) {
  const errors = [];

  if (!comp.feeStructureId) {
    errors.push("feeStructureId is required");
  }
  if (!comp.label) {
    errors.push("label is required");
  }
  if (typeof comp.allocatedAmount !== "number" || comp.allocatedAmount <= 0) {
    errors.push("allocatedAmount must be a positive number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates data intended for a paymentAllocations document.
 * Enforces cross-field invariants for allocationTarget and componentAllocations sum.
 *
 * @param {Partial<import('../types.js').PaymentAllocation>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validatePaymentAllocation(data) {
  const errors = [];

  if (!data.paymentId)    errors.push("paymentId is required");
  if (!data.studentId)    errors.push("studentId is required");
  if (!data.schoolId)     errors.push("schoolId is required");
  if (!data.academicYear) errors.push("academicYear is required");

  if (!Object.values(AllocationTarget).includes(data.allocationTarget)) {
    errors.push(`allocationTarget must be one of: ${Object.values(AllocationTarget).join(", ")}`);
  }

  if (data.allocationTarget === AllocationTarget.INSTALLMENT) {
    if (!data.installmentId) errors.push("installmentId is required when allocationTarget is 'installment'");
    if (!data.period)        errors.push("period is required when allocationTarget is 'installment'");
  }

  if (data.allocationTarget === AllocationTarget.OPENING_BALANCE) {
    if (data.installmentId != null) errors.push("installmentId must be null when allocationTarget is 'opening_balance'");
    if (data.period != null)        errors.push("period must be null when allocationTarget is 'opening_balance'");
  }

  if (typeof data.amount !== "number" || data.amount <= 0) {
    errors.push("amount must be a positive number");
  }

  if (!Object.values(AllocationStrategy).includes(data.allocationStrategy)) {
    errors.push(`allocationStrategy must be one of: ${Object.values(AllocationStrategy).join(", ")}`);
  }

  if (!Array.isArray(data.componentAllocations)) {
    errors.push("componentAllocations must be an array");
  } else {
    if (data.allocationTarget === AllocationTarget.OPENING_BALANCE && data.componentAllocations.length > 0) {
      errors.push("componentAllocations must be empty when allocationTarget is 'opening_balance'");
    }

    data.componentAllocations.forEach((comp, i) => {
      const result = validateComponentAlloc(comp);
      result.errors.forEach((e) => errors.push(`componentAllocations[${i}]: ${e}`));
    });

    if (
      data.allocationTarget === AllocationTarget.INSTALLMENT &&
      data.componentAllocations.length > 0 &&
      typeof data.amount === "number"
    ) {
      const compSum = data.componentAllocations.reduce((s, c) => s + (c.allocatedAmount || 0), 0);
      if (Math.abs(compSum - data.amount) > 0.01) {
        errors.push(`sum of componentAllocations.allocatedAmount (${compSum}) must equal amount (${data.amount})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
