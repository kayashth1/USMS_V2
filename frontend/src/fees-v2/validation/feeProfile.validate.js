import { ProfileStatus, FeeSchedule, AdjustmentType, AdjustmentScope, AdjustmentCalculationType } from "../constants/enums.js";

/**
 * Validates a FeeLineItem embedded object.
 *
 * @param {import('../types.js').FeeLineItem} item
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeLineItem(item) {
  const errors = [];

  if (!item.feeStructureId) {
    errors.push("feeStructureId is required");
  }
  if (!item.label) {
    errors.push("label is required");
  }
  if (typeof item.amount !== "number" || item.amount < 0) {
    errors.push("amount must be a non-negative number");
  }
  if (!["fixed", "variable"].includes(item.type)) {
    errors.push("type must be 'fixed' or 'variable'");
  }
  if (typeof item.isOneTime !== "boolean") {
    errors.push("isOneTime must be a boolean");
  }
  if (typeof item.chargedDuringHolidays !== "boolean") {
    errors.push("chargedDuringHolidays must be a boolean");
  }
  if (typeof item.allocationPriority !== "number") {
    errors.push("allocationPriority must be a number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a FeeAdjustment embedded object.
 *
 * @param {import('../types.js').FeeAdjustment} adj
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeAdjustment(adj) {
  const errors = [];

  if (!adj.id) {
    errors.push("id is required");
  }
  if (!Object.values(AdjustmentType).includes(adj.type)) {
    errors.push(`type must be one of: ${Object.values(AdjustmentType).join(", ")}`);
  }
  if (!adj.label) {
    errors.push("label is required");
  }
  if (!Object.values(AdjustmentScope).includes(adj.scope)) {
    errors.push(`scope must be one of: ${Object.values(AdjustmentScope).join(", ")}`);
  }
  if (!Array.isArray(adj.targetComponentIds)) {
    errors.push("targetComponentIds must be an array");
  }
  if (!Object.values(AdjustmentCalculationType).includes(adj.calculationType)) {
    errors.push(`calculationType must be one of: ${Object.values(AdjustmentCalculationType).join(", ")}`);
  }
  if (typeof adj.value !== "number" || adj.value < 0) {
    errors.push("value must be a non-negative number");
  }
  if (adj.calculationType === "percentage" && typeof adj.value === "number" && adj.value > 100) {
    errors.push("value must not exceed 100 when calculationType is 'percentage'");
  }
  if (typeof adj.computedAmount !== "number" || adj.computedAmount < 0) {
    errors.push("computedAmount must be a non-negative number");
  }
  if (!adj.reason || adj.reason.trim().length === 0) {
    errors.push("reason must be a non-empty string");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates data intended for a studentFeeProfiles document.
 *
 * @param {Partial<import('../types.js').StudentFeeProfile>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeProfile(data) {
  const errors = [];

  if (!data.studentId)      errors.push("studentId is required");
  if (!data.academicYearId) errors.push("academicYearId is required");
  if (!data.academicYear)   errors.push("academicYear is required");
  if (!data.schoolId)       errors.push("schoolId is required");
  if (!data.classId)        errors.push("classId is required");
  if (!data.classLabel)     errors.push("classLabel is required");

  if (!Object.values(FeeSchedule).includes(data.schedule)) {
    errors.push(`schedule must be one of: ${Object.values(FeeSchedule).join(", ")}`);
  }

  if (!Array.isArray(data.feeLineItems)) {
    errors.push("feeLineItems must be an array");
  } else {
    data.feeLineItems.forEach((item, i) => {
      const result = validateFeeLineItem(item);
      result.errors.forEach((e) => errors.push(`feeLineItems[${i}]: ${e}`));
    });
  }

  if (!Array.isArray(data.feeAdjustments)) {
    errors.push("feeAdjustments must be an array");
  } else {
    data.feeAdjustments.forEach((adj, i) => {
      const result = validateFeeAdjustment(adj);
      result.errors.forEach((e) => errors.push(`feeAdjustments[${i}]: ${e}`));
    });
  }

  if (!Array.isArray(data.variableFeeIds)) {
    errors.push("variableFeeIds must be an array");
  }

  if (typeof data.grossAnnualFee !== "number" || data.grossAnnualFee < 0) {
    errors.push("grossAnnualFee must be a non-negative number");
  }
  if (typeof data.totalAdjustmentAmount !== "number" || data.totalAdjustmentAmount < 0) {
    errors.push("totalAdjustmentAmount must be a non-negative number");
  }
  if (typeof data.netAnnualFee !== "number" || data.netAnnualFee < 0) {
    errors.push("netAnnualFee must be a non-negative number");
  }
  if (typeof data.openingOutstanding !== "number" || data.openingOutstanding < 0) {
    errors.push("openingOutstanding must be a non-negative number");
  }
  if (typeof data.openingCredit !== "number" || data.openingCredit < 0) {
    errors.push("openingCredit must be a non-negative number");
  }
  if (typeof data.openingPaid !== "number" || data.openingPaid < 0) {
    errors.push("openingPaid must be a non-negative number");
  }
  if (typeof data.openingPaid === "number" && typeof data.openingOutstanding === "number" && data.openingPaid > data.openingOutstanding) {
    errors.push("openingPaid must not exceed openingOutstanding");
  }

  if (!Object.values(ProfileStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(ProfileStatus).join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
