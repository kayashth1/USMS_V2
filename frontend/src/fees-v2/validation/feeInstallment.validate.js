import { InstallmentStatus } from "../constants/enums.js";

/**
 * Validates data intended for a feeInstallments document.
 * Also enforces the balance invariant: balance === netAmount − totalAllocated.
 *
 * @param {Partial<import('../types.js').FeeInstallment>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeInstallment(data) {
  const errors = [];

  if (!data.feeProfileId)  errors.push("feeProfileId is required");
  if (!data.studentId)     errors.push("studentId is required");
  if (!data.schoolId)      errors.push("schoolId is required");
  if (!data.academicYear)  errors.push("academicYear is required");

  if (typeof data.installmentNumber !== "number" || !Number.isInteger(data.installmentNumber) || data.installmentNumber < 1) {
    errors.push("installmentNumber must be a positive integer");
  }

  if (!data.period) {
    errors.push("period is required");
  }
  if (!data.periodLabel) {
    errors.push("periodLabel is required");
  }
  if (!data.dueDate) {
    errors.push("dueDate is required");
  }
  if (typeof data.isHolidayMonth !== "boolean") {
    errors.push("isHolidayMonth must be a boolean");
  }

  if (!Array.isArray(data.lineItems)) {
    errors.push("lineItems must be an array");
  }

  if (typeof data.grossAmount !== "number" || data.grossAmount < 0) {
    errors.push("grossAmount must be a non-negative number");
  }
  if (typeof data.discountAmount !== "number" || data.discountAmount < 0) {
    errors.push("discountAmount must be a non-negative number");
  }
  if (typeof data.netAmount !== "number" || data.netAmount < 0) {
    errors.push("netAmount must be a non-negative number");
  }
  if (typeof data.totalAllocated !== "number" || data.totalAllocated < 0) {
    errors.push("totalAllocated must be a non-negative number");
  }
  if (typeof data.balance !== "number") {
    errors.push("balance must be a number");
  }

  if (
    typeof data.netAmount === "number" &&
    typeof data.totalAllocated === "number" &&
    typeof data.balance === "number"
  ) {
    const expectedBalance = Math.round((data.netAmount - data.totalAllocated) * 100) / 100;
    if (Math.abs(data.balance - expectedBalance) > 0.01) {
      errors.push(`balance (${data.balance}) must equal netAmount − totalAllocated (${expectedBalance})`);
    }
  }

  if (!Object.values(InstallmentStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(InstallmentStatus).join(", ")}`);
  }

  if (typeof data.isLocked !== "boolean") {
    errors.push("isLocked must be a boolean");
  }

  if (data.status === InstallmentStatus.CANCELLED && !data.cancelledAt) {
    errors.push("cancelledAt is required when status is 'cancelled'");
  }

  return { valid: errors.length === 0, errors };
}
