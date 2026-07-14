import { RevisionChangeType, RevisionStatus, RevisionType } from "../constants/enums.js";

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Validates the changeDetail object for a given changeType.
 * Returns an array of error strings (empty if valid).
 *
 * @param {string} changeType
 * @param {Object} detail
 * @returns {string[]}
 */
function validateChangeDetail(changeType, detail) {
  if (!detail || typeof detail !== "object") return ["changeDetail must be an object"];

  const errors = [];

  switch (changeType) {
    case RevisionChangeType.ADD_ITEM:
      if (!detail.feeStructureId) errors.push("feeStructureId is required");
      if (!detail.label)          errors.push("label is required");
      if (typeof detail.amount !== "number" || detail.amount < 0) errors.push("amount must be a non-negative number");
      if (!["fixed", "variable"].includes(detail.type)) errors.push("type must be 'fixed' or 'variable'");
      if (typeof detail.isOneTime !== "boolean") errors.push("isOneTime must be a boolean");
      break;

    case RevisionChangeType.REMOVE_ITEM:
      if (!detail.feeStructureId) errors.push("feeStructureId is required");
      if (!detail.label)          errors.push("label is required");
      break;

    case RevisionChangeType.ADJUST_AMOUNT:
      if (!detail.feeStructureId)              errors.push("feeStructureId is required");
      if (!detail.label)                       errors.push("label is required");
      if (typeof detail.oldAmount !== "number") errors.push("oldAmount must be a number");
      if (typeof detail.newAmount !== "number") errors.push("newAmount must be a number");
      if (typeof detail.oldAmount === "number" && typeof detail.newAmount === "number" && detail.oldAmount === detail.newAmount) {
        errors.push("newAmount must differ from oldAmount");
      }
      break;

    case RevisionChangeType.ADD_ADJUSTMENT:
      if (!detail.adjustment || typeof detail.adjustment !== "object") {
        errors.push("adjustment object is required");
      }
      break;

    case RevisionChangeType.MODIFY_ADJUSTMENT:
      if (!detail.adjustmentId) errors.push("adjustmentId is required");
      if (!detail.field)        errors.push("field is required");
      break;

    case RevisionChangeType.REMOVE_ADJUSTMENT:
      if (!detail.adjustmentId) errors.push("adjustmentId is required");
      if (!detail.label)        errors.push("label is required");
      if (!detail.type)         errors.push("type is required");
      break;

    case RevisionChangeType.CANCEL_INSTALLMENT:
      if (!detail.installmentId) errors.push("installmentId is required");
      if (!detail.period)        errors.push("period is required");
      if (!detail.periodLabel)   errors.push("periodLabel is required");
      break;
  }

  return errors;
}

// ─── Fee Revision Module validators ──────────────────────────────────────────

// Matches "YYYY-MM" (monthly) or "Q{1-4}-YYYY-YY" (quarterly)
const INSTALLMENT_PATTERN = /^(\d{4}-\d{2}|Q[1-4]-\d{4}-\d{2})$/;

/**
 * Validates one entry in a FeeRevisionDoc.changes[] array.
 * The entry must carry its own revisionType field (discriminator).
 * Returns an array of error strings (empty if valid).
 *
 * @param {import('../types.js').RevisionChangeEntry} entry
 * @param {number} index  - Position in changes[] for error prefixing
 * @returns {string[]}
 */
function validateRevisionChangeEntry(entry, index) {
  const prefix = `changes[${index}]`;

  if (!entry || typeof entry !== "object")
    return [`${prefix} must be an object`];

  if (!Object.values(RevisionType).includes(entry.revisionType))
    return [`${prefix}.revisionType must be one of: ${Object.values(RevisionType).join(", ")}`];

  const errors = [];

  switch (entry.revisionType) {
    case RevisionType.ADD_VARIABLE_FEE:
    case RevisionType.REMOVE_VARIABLE_FEE:
      if (!entry.feeStructureId) errors.push(`${prefix}.feeStructureId is required`);
      if (!["add", "remove"].includes(entry.action))
        errors.push(`${prefix}.action must be 'add' or 'remove'`);
      break;

    case RevisionType.ADD_FIXED_FEE:
    case RevisionType.REMOVE_FIXED_FEE:
      if (!entry.feeStructureId) errors.push(`${prefix}.feeStructureId is required`);
      if (!entry.classId)        errors.push(`${prefix}.classId is required`);
      if (!["add", "remove"].includes(entry.action))
        errors.push(`${prefix}.action must be 'add' or 'remove'`);
      break;

    case RevisionType.SCHOLARSHIP:
    case RevisionType.WAIVER:
      if (entry.percentage == null && entry.fixedAmount == null)
        errors.push(`${prefix}: one of percentage or fixedAmount is required`);
      if (entry.percentage != null && entry.fixedAmount != null)
        errors.push(`${prefix}: percentage and fixedAmount are mutually exclusive`);
      if (entry.percentage != null &&
          (typeof entry.percentage !== "number" || entry.percentage < 0 || entry.percentage > 100))
        errors.push(`${prefix}.percentage must be a number between 0 and 100`);
      if (entry.fixedAmount != null &&
          (typeof entry.fixedAmount !== "number" || entry.fixedAmount <= 0))
        errors.push(`${prefix}.fixedAmount must be a positive number`);
      if (!["total_fee", "specific_components"].includes(entry.scope))
        errors.push(`${prefix}.scope must be 'total_fee' or 'specific_components'`);
      break;

    case RevisionType.FINE:
      if (typeof entry.amount !== "number" || entry.amount <= 0)
        errors.push(`${prefix}.amount must be a positive number`);
      if (!entry.reason?.trim())
        errors.push(`${prefix}.reason is required`);
      break;

    case RevisionType.FEE_CORRECTION:
      if (!entry.feeStructureId)      errors.push(`${prefix}.feeStructureId is required`);
      if (entry.previousValue == null) errors.push(`${prefix}.previousValue is required`);
      if (entry.newValue == null)      errors.push(`${prefix}.newValue is required`);
      break;
  }

  return errors;
}

/**
 * Validates data for a FeeRevisionDoc (Fee Revision module schema).
 * Validates required fields, enum values, effectiveInstallment format, and
 * every entry in the changes[] array.
 * Does NOT validate business rules (e.g. whether the profile is active).
 *
 * @param {Partial<import('../types.js').FeeRevisionDoc>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeRevisionDoc(data) {
  const errors = [];

  if (!data.studentId)    errors.push("studentId is required");
  if (!data.profileId)    errors.push("profileId is required");
  if (!data.academicYear) errors.push("academicYear is required");
  if (!data.requestedBy)  errors.push("requestedBy is required");

  if (!data.reason || data.reason.trim().length === 0)
    errors.push("reason must be a non-empty string");

  if (data.status && !Object.values(RevisionStatus).includes(data.status))
    errors.push(`status must be one of: ${Object.values(RevisionStatus).join(", ")}`);

  if (!data.effectiveInstallment) {
    errors.push("effectiveInstallment is required");
  } else if (!INSTALLMENT_PATTERN.test(data.effectiveInstallment)) {
    errors.push("effectiveInstallment must be 'YYYY-MM' (monthly) or 'Q{n}-YYYY-YY' (quarterly)");
  }

  if (!Array.isArray(data.changes) || data.changes.length === 0) {
    errors.push("changes must be a non-empty array");
  } else {
    data.changes.forEach((entry, i) => {
      validateRevisionChangeEntry(entry, i).forEach((e) => errors.push(e));
    });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Original validator (unchanged) ──────────────────────────────────────────

/**
 * Validates data intended for a feeRevisions document.
 *
 * @param {Partial<import('../types.js').FeeRevision>} data
 * @returns {import('../types.js').ValidationResult}
 */
export function validateFeeRevision(data) {
  const errors = [];

  if (!data.profileId)    errors.push("profileId is required");
  if (!data.studentId)    errors.push("studentId is required");
  if (!data.schoolId)     errors.push("schoolId is required");
  if (!data.academicYear) errors.push("academicYear is required");
  if (!data.revisedBy)    errors.push("revisedBy is required");

  if (!data.reason || data.reason.trim().length === 0) {
    errors.push("reason must be a non-empty string");
  }

  if (!Object.values(RevisionChangeType).includes(data.changeType)) {
    errors.push(`changeType must be one of: ${Object.values(RevisionChangeType).join(", ")}`);
  }

  if (data.changeType) {
    const detailErrors = validateChangeDetail(data.changeType, data.changeDetail);
    detailErrors.forEach((e) => errors.push(`changeDetail.${e}`));
  }

  if (!data.affectsPeriodFrom) {
    errors.push("affectsPeriodFrom is required");
  } else if (!PERIOD_PATTERN.test(data.affectsPeriodFrom)) {
    errors.push("affectsPeriodFrom must be in YYYY-MM format");
  }

  if (!Array.isArray(data.installmentsUpdated)) {
    errors.push("installmentsUpdated must be an array");
  }
  if (!Array.isArray(data.installmentsCancelled)) {
    errors.push("installmentsCancelled must be an array");
  }

  if (data.revisionStatus && !Object.values(RevisionStatus).includes(data.revisionStatus)) {
    errors.push(`revisionStatus must be one of: ${Object.values(RevisionStatus).join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
