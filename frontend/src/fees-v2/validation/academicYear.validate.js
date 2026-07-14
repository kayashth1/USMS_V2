import { AcademicYearStatus } from "../constants/enums.js";

const YEAR_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Checks that the suffix in "YYYY-YY" matches the year following the start year.
 * e.g. "2026-27" → startYear 2026, endYear 2027, suffix "27" ✓
 *      "2026-28" → suffix "28" ≠ "27" ✗
 *
 * @param {string} year
 * @returns {boolean}
 */
function isYearSuffixConsistent(year) {
  const [startStr, suffix] = year.split("-");
  const startYear = parseInt(startStr, 10);
  if (isNaN(startYear)) return false;
  const expectedSuffix = String(startYear + 1).slice(-2);
  return suffix === expectedSuffix;
}

/**
 * Normalises a value that may be a Firestore Timestamp or a JS Date to a Date.
 *
 * @param {import('firebase/firestore').Timestamp|Date|*} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * Validates data intended for an academicYears document.
 * Does NOT check uniqueness (schoolId + year) — that is enforced by the service layer.
 *
 * @param {Partial<import('../types.js').AcademicYear>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateAcademicYear(data) {
  const errors = [];

  // schoolId
  if (!data.schoolId || typeof data.schoolId !== "string") {
    errors.push("schoolId is required");
  }

  // year format and consistency
  if (!data.year) {
    errors.push("year is required");
  } else if (!YEAR_PATTERN.test(data.year)) {
    errors.push("year must be in YYYY-YY format (e.g. 2026-27)");
  } else if (!isYearSuffixConsistent(data.year)) {
    errors.push(
      "year suffix must be the last two digits of the following calendar year " +
      "(e.g. 2026-27, not 2026-28)"
    );
  }

  // startDate / endDate presence
  if (!data.startDate) {
    errors.push("startDate is required");
  }
  if (!data.endDate) {
    errors.push("endDate is required");
  }

  // startDate must be strictly before endDate
  if (data.startDate && data.endDate) {
    const start = toDate(data.startDate);
    const end   = toDate(data.endDate);
    if (start && end && start >= end) {
      errors.push("startDate must be before endDate");
    }
  }

  // status — only validate when explicitly provided (not required on create input)
  if (data.status !== undefined && !Object.values(AcademicYearStatus).includes(data.status)) {
    errors.push(`status must be one of: ${Object.values(AcademicYearStatus).join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
