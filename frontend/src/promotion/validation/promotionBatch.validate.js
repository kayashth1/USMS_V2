import { PromotionType, BatchStatus } from "../constants/enums.js";

// Academic year: "YYYY-YY" — e.g. "2026-27"
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Returns true when the two-digit suffix equals the last two digits of the year
 * immediately following the start year.
 * "2026-27" → startYear 2026, expectedSuffix "27" ✓
 * "2026-28" → expectedSuffix "27" ≠ "28" ✗
 *
 * @param {string} year
 * @returns {boolean}
 */
function isYearSuffixConsistent(year) {
  const [startStr, suffix] = year.split("-");
  const startYear = parseInt(startStr, 10);
  if (isNaN(startYear)) return false;
  return String(startYear + 1).slice(-2) === suffix;
}

/**
 * Validates data intended for a PromotionBatch document.
 *
 * Checks:
 *   - Required fields (schoolId, requestedBy, fromClassId, toClassId,
 *     fromAcademicYear, toAcademicYear, promotionType)
 *   - Academic year format ("YYYY-YY") and suffix consistency
 *   - promotionType and status enum membership
 *   - carryFeeBalance / carryVariableFees are booleans when present
 *   - promotionPlanSnapshot shape when present:
 *       academicYear (YYYY-YY format + suffix consistency)
 *       carryFeeBalance and carryVariableFees are booleans
 *       selectedStudentCount is a non-negative integer
 *
 * Does NOT validate business rules (e.g. year ordering, class existence,
 * whether the target year is active).
 *
 * @param {Partial<import('../types.js').PromotionBatch>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validatePromotionBatch(data) {
  const errors = [];

  if (!data.schoolId)    errors.push("schoolId is required");
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
  if (data.status !== undefined && !Object.values(BatchStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(BatchStatus).join(", ")}`);
  }

  // Boolean carry flags — only validate type when present
  if (data.carryFeeBalance !== undefined && typeof data.carryFeeBalance !== "boolean") {
    errors.push("carryFeeBalance must be a boolean");
  }
  if (data.carryVariableFees !== undefined && typeof data.carryVariableFees !== "boolean") {
    errors.push("carryVariableFees must be a boolean");
  }

  // promotionPlanSnapshot — validate shape when present
  if (data.promotionPlanSnapshot !== undefined) {
    const snap = data.promotionPlanSnapshot;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
      errors.push("promotionPlanSnapshot must be an object");
    } else {
      if (!snap.academicYear) {
        errors.push("promotionPlanSnapshot.academicYear is required");
      } else if (!ACADEMIC_YEAR_PATTERN.test(snap.academicYear)) {
        errors.push("promotionPlanSnapshot.academicYear must be in YYYY-YY format (e.g. '2026-27')");
      } else if (!isYearSuffixConsistent(snap.academicYear)) {
        errors.push(
          "promotionPlanSnapshot.academicYear suffix must be the last two digits of the " +
          "following calendar year (e.g. '2026-27', not '2026-28')"
        );
      }

      if (typeof snap.carryFeeBalance !== "boolean") {
        errors.push("promotionPlanSnapshot.carryFeeBalance must be a boolean");
      }
      if (typeof snap.carryVariableFees !== "boolean") {
        errors.push("promotionPlanSnapshot.carryVariableFees must be a boolean");
      }
      if (
        typeof snap.selectedStudentCount !== "number" ||
        !Number.isInteger(snap.selectedStudentCount) ||
        snap.selectedStudentCount < 0
      ) {
        errors.push("promotionPlanSnapshot.selectedStudentCount must be a non-negative integer");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
