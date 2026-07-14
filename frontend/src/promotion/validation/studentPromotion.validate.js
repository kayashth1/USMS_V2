import { PromotionType, PromotionStatus, PromotionResult } from "../constants/enums.js";

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{2}$/;

function isYearSuffixConsistent(year) {
  const [startStr, suffix] = year.split("-");
  const startYear = parseInt(startStr, 10);
  if (isNaN(startYear)) return false;
  return String(startYear + 1).slice(-2) === suffix;
}

/**
 * Validates data intended for a StudentPromotion document.
 *
 * Checks:
 *   - Required fields (batchId, schoolId, studentId, requestedBy,
 *     fromClassId, toClassId, fromAcademicYear, toAcademicYear, promotionType)
 *   - Academic year format ("YYYY-YY") and suffix consistency
 *   - promotionType and status enum membership
 *   - promotionResult enum membership when present (null is allowed)
 *
 * Does NOT validate business rules (e.g. whether the student exists in the
 * given class, whether the batch is in a valid state, or fee profile eligibility).
 *
 * @param {Partial<import('../types.js').StudentPromotion>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateStudentPromotion(data) {
  const errors = [];

  if (!data.batchId)     errors.push("batchId is required");
  if (!data.schoolId)    errors.push("schoolId is required");
  if (!data.studentId)   errors.push("studentId is required");
  if (!data.requestedBy) errors.push("requestedBy is required");
  if (!data.fromClassId) errors.push("fromClassId is required");
  if (!data.toClassId)   errors.push("toClassId is required");

  // fromAcademicYear
  if (!data.fromAcademicYear) {
    errors.push("fromAcademicYear is required");
  } else if (!ACADEMIC_YEAR_PATTERN.test(data.fromAcademicYear)) {
    errors.push("fromAcademicYear must be in YYYY-YY format (e.g. '2025-26')");
  } else if (!isYearSuffixConsistent(data.fromAcademicYear)) {
    errors.push(
      "fromAcademicYear suffix must be the last two digits of the following " +
      "calendar year (e.g. '2025-26', not '2025-27')"
    );
  }

  // toAcademicYear
  if (!data.toAcademicYear) {
    errors.push("toAcademicYear is required");
  } else if (!ACADEMIC_YEAR_PATTERN.test(data.toAcademicYear)) {
    errors.push("toAcademicYear must be in YYYY-YY format (e.g. '2026-27')");
  } else if (!isYearSuffixConsistent(data.toAcademicYear)) {
    errors.push(
      "toAcademicYear suffix must be the last two digits of the following " +
      "calendar year (e.g. '2026-27', not '2026-28')"
    );
  }

  // promotionType
  if (!data.promotionType) {
    errors.push("promotionType is required");
  } else if (!Object.values(PromotionType).includes(data.promotionType)) {
    errors.push(`promotionType must be one of: ${Object.values(PromotionType).join(", ")}`);
  }

  // status — optional on input; only validate when present
  if (data.status !== undefined && !Object.values(PromotionStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(PromotionStatus).join(", ")}`);
  }

  // promotionResult — optional (null until execution resolves the record);
  // when present and non-null, must be a PromotionResult value
  if (data.promotionResult !== undefined &&
      data.promotionResult !== null &&
      !Object.values(PromotionResult).includes(data.promotionResult)) {
    errors.push(`promotionResult must be null or one of: ${Object.values(PromotionResult).join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
