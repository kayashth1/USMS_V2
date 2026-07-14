/**
 * PromotionEngine — Student Promotion module
 *
 * Pure computation module. No Firestore. No Firebase. No async. No side effects.
 *
 * Given a PromotionBatch, a StudentPromotion, the student's current fee profile,
 * and the destination class fee structures, produces a PromotionPlan that
 * describes exactly what would happen if the promotion were executed.
 * Nothing is persisted — the persistence layer reads the plan and performs
 * the actual Firestore writes.
 *
 * The same inputs always produce the same output (referentially transparent).
 *
 * Main entry point:
 *   buildPromotionPlan(batch, studentPromotion, student, oldFeeProfile,
 *                      destFeeStructures, academicYear)
 *
 * Computation pipeline (CLASS_PROMOTION):
 *   1. validateDestinationFeeStructures → at least one active structure required
 *   2. carryBalances     → openingOutstanding / openingCredit (or zeros + warning)
 *   3. carryVariableFees → filtered subset of carriedVariableFeeIds + warnings
 *   4. carryAdjustments  → recurring-only subset of feeAdjustments + warnings
 *   5. buildDraftFeeProfile → new profile from destination structures + carried data
 *   6. Return PromotionPlan { ..., promotionResult: PROMOTED }
 *
 * GRADUATION short-circuits at step 0 — no fee profile is produced.
 *
 * Invariants:
 *   - Revision history is never inspected; oldFeeProfile is the latest snapshot
 *   - Only fee adjustments with isRecurring === true are carried forward
 *   - Non-recurring adjustments (one-off waivers, fines) are dropped with a warning
 *   - Variable fees not present as active in destFeeStructures are dropped with a warning
 *   - openingOutstanding / openingCredit are sourced from the StudentPromotion
 *     snapshot captured at batch creation time, not recomputed from installments
 *   - computedAmount on carried adjustments is taken as-is from the snapshot;
 *     the persistence layer must recompute it for percentage-based adjustments
 *     when the new profile's grossAnnualFee differs from the old one
 */

import { PromotionType, PromotionResult } from "./constants/enums.js";

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} PromotionError
 * @property {string} code
 * @property {string} message
 * @property {Object} [context]
 */

/**
 * @typedef {Object} PromotionWarning
 * @property {string} code
 * @property {string} message
 * @property {Object} [context]
 */

/**
 * A draft StudentFeeProfile produced by the engine.
 * No Firestore IDs or server timestamps — those are set by the persistence layer.
 *
 * @typedef {Object} DraftFeeProfile
 * @property {string}   studentId
 * @property {string}   schoolId
 * @property {string}   academicYearId
 * @property {string}   academicYear           - "YYYY-YY"
 * @property {string}   classId
 * @property {string}   status                 - always "draft"
 * @property {string}   schedule               - "monthly" | "quarterly"
 * @property {Object[]} feeLineItems
 * @property {Object[]} feeAdjustments         - recurring adjustments from old profile
 * @property {string[]} variableFeeIds
 * @property {number}   grossAnnualFee
 * @property {number}   totalAdjustmentAmount
 * @property {number}   netAnnualFee
 * @property {number}   openingOutstanding
 * @property {number}   openingCredit
 * @property {boolean}  installmentsGenerated  - always false
 * @property {number}   revisionCount          - always 0
 * @property {null}     lastRevisedAt
 * @property {null}     lastRevisionId
 * @property {null}     lastRevisionType
 * @property {null}     lastRevisionAt
 */

/**
 * @typedef {Object} PromotionPlan
 * @property {string}               promotionId
 * @property {string}               studentId
 * @property {string}               promotionType
 * @property {string}               promotionResult
 * @property {string|null}          oldFeeProfileId
 * @property {DraftFeeProfile|null} newFeeProfile    - null for GRADUATION and FAILED
 * @property {number}               openingOutstanding
 * @property {number}               openingCredit
 * @property {string[]}             variableFeeIds
 * @property {PromotionError[]}     errors
 * @property {PromotionWarning[]}   warnings          - non-blocking diagnostic notes
 */

// ─── Error / Warning codes ────────────────────────────────────────────────────

export const PromotionEngineErrorCodes = Object.freeze({
  /** Destination class has no active fee structures — promotion cannot proceed. */
  NO_ACTIVE_FEE_STRUCTURES: "NO_ACTIVE_FEE_STRUCTURES",
});

export const PromotionEngineWarningCodes = Object.freeze({
  /** A carried variable fee ID was not found in destFeeStructures. */
  VARIABLE_FEE_DROPPED_NOT_IN_DEST:     "VARIABLE_FEE_DROPPED_NOT_IN_DEST",
  /** A carried variable fee ID was found in destFeeStructures but is inactive. */
  VARIABLE_FEE_DROPPED_INACTIVE:        "VARIABLE_FEE_DROPPED_INACTIVE",
  /** A fee adjustment was not carried because isRecurring is not true. */
  ADJUSTMENT_NOT_CARRIED_NON_RECURRING: "ADJUSTMENT_NOT_CARRIED_NON_RECURRING",
  /** carryFeeBalance is disabled and the student had a non-zero balance. */
  BALANCE_NOT_CARRIED_DISABLED:         "BALANCE_NOT_CARRIED_DISABLED",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks that at least one active fee structure exists for the destination class.
 * A structure is considered active when `isActive` is not explicitly false
 * (treats missing field as active for backward compatibility).
 *
 * @param {Object[]} destFeeStructures
 * @returns {{ valid: boolean, error: PromotionError|null }}
 */
export function validateDestinationFeeStructures(destFeeStructures) {
  const active = (destFeeStructures ?? []).filter(s => s.isActive !== false);
  if (active.length === 0) {
    return {
      valid: false,
      error: {
        code:    PromotionEngineErrorCodes.NO_ACTIVE_FEE_STRUCTURES,
        message: "No active fee structures exist for the destination class. Promotion cannot proceed.",
        context: { suppliedCount: (destFeeStructures ?? []).length },
      },
    };
  }
  return { valid: true, error: null };
}

/**
 * Determines the opening outstanding and credit balances to carry into the new
 * fee profile.
 *
 * Sources from the StudentPromotion snapshot (captured at batch creation time
 * from installment totals — not from oldFeeProfile.openingOutstanding, which
 * only holds the PRIOR year's carry-in).
 *
 * Emits BALANCE_NOT_CARRIED_DISABLED when the student has a non-zero balance
 * but carryFeeBalance is off — the admin should be aware of the lost carry.
 *
 * @param {import('./types.js').PromotionBatch}   batch
 * @param {import('./types.js').StudentPromotion} studentPromotion
 * @param {Object|null}                           oldFeeProfile
 * @returns {{ openingOutstanding: number, openingCredit: number, warnings: PromotionWarning[] }}
 */
export function carryBalances(batch, studentPromotion, oldFeeProfile) {
  const outstanding = studentPromotion.openingOutstanding ?? 0;
  const credit      = studentPromotion.openingCredit      ?? 0;
  const warnings    = [];

  if (!batch.carryFeeBalance || !oldFeeProfile) {
    if (!batch.carryFeeBalance && (outstanding > 0 || credit > 0)) {
      warnings.push({
        code:    PromotionEngineWarningCodes.BALANCE_NOT_CARRIED_DISABLED,
        message: "Opening balance not carried: carryFeeBalance is disabled for this batch.",
        context: { openingOutstanding: outstanding, openingCredit: credit },
      });
    }
    return { openingOutstanding: 0, openingCredit: 0, warnings };
  }

  return { openingOutstanding: outstanding, openingCredit: credit, warnings };
}

/**
 * Determines which variable fee structure IDs to carry into the new fee profile.
 *
 * Starting point: `studentPromotion.carriedVariableFeeIds` (pre-captured at batch
 * creation time from oldFeeProfile.variableFeeIds).
 *
 * Each candidate ID is checked against destFeeStructures:
 *   - Not found in destFeeStructures       → dropped + VARIABLE_FEE_DROPPED_NOT_IN_DEST
 *   - Found but isActive === false         → dropped + VARIABLE_FEE_DROPPED_INACTIVE
 *   - Found and active                     → carried
 *
 * Returns { ids: [], warnings: [] } when carryVariableFees is false or
 * oldFeeProfile is absent.
 *
 * @param {import('./types.js').PromotionBatch}   batch
 * @param {import('./types.js').StudentPromotion} studentPromotion
 * @param {Object|null}                           oldFeeProfile
 * @param {Object[]}                              destFeeStructures
 * @returns {{ ids: string[], warnings: PromotionWarning[] }}
 */
export function carryVariableFees(batch, studentPromotion, oldFeeProfile, destFeeStructures) {
  if (!batch.carryVariableFees || !oldFeeProfile) {
    return { ids: [], warnings: [] };
  }

  const candidateIds = studentPromotion.carriedVariableFeeIds ?? [];
  if (candidateIds.length === 0) return { ids: [], warnings: [] };

  // Build id → structure map for all variable entries in destFeeStructures
  // (includes both active and inactive so we can distinguish the two drop reasons)
  const destVariableMap = new Map(
    (destFeeStructures ?? [])
      .filter(s => s.type === "variable")
      .map(s => [s.id, s])
  );

  const ids      = [];
  const warnings = [];

  for (const id of candidateIds) {
    const structure = destVariableMap.get(id);
    if (!structure) {
      warnings.push({
        code:    PromotionEngineWarningCodes.VARIABLE_FEE_DROPPED_NOT_IN_DEST,
        message: `Variable fee "${id}" not carried: no matching fee structure found for the destination class.`,
        context: { feeStructureId: id },
      });
    } else if (structure.isActive === false) {
      warnings.push({
        code:    PromotionEngineWarningCodes.VARIABLE_FEE_DROPPED_INACTIVE,
        message: `Variable fee "${structure.label ?? id}" not carried: fee structure is inactive.`,
        context: { feeStructureId: id, label: structure.label ?? null },
      });
    } else {
      ids.push(id);
    }
  }

  return { ids, warnings };
}

/**
 * Filters fee adjustments from the old profile to carry forward only those
 * marked `isRecurring === true`.
 *
 * Non-recurring adjustments (one-off scholarships, individual waivers, fines)
 * are dropped with a warning per dropped entry — they must be re-applied in
 * the new year via fee revisions.
 *
 * Note: `computedAmount` is carried as-is from the snapshot. The persistence
 * layer should recompute it for percentage-based adjustments when the new
 * profile's grossAnnualFee differs from the old one.
 *
 * @param {Object|null} oldFeeProfile
 * @returns {{ adjustments: Object[], warnings: PromotionWarning[] }}
 */
export function carryAdjustments(oldFeeProfile) {
  if (!oldFeeProfile) return { adjustments: [], warnings: [] };

  const source      = oldFeeProfile.feeAdjustments ?? [];
  const adjustments = [];
  const warnings    = [];

  for (const adj of source) {
    if (adj.isRecurring === true) {
      adjustments.push(adj);
    } else {
      warnings.push({
        code:    PromotionEngineWarningCodes.ADJUSTMENT_NOT_CARRIED_NON_RECURRING,
        message: `Adjustment "${adj.label ?? adj.adjustmentId ?? "unknown"}" not carried: not marked as recurring.`,
        context: {
          adjustmentId: adj.adjustmentId ?? null,
          type:         adj.type         ?? null,
          label:        adj.label        ?? null,
        },
      });
    }
  }

  return { adjustments, warnings };
}

/**
 * Computes the gross annual fee for a list of fee line items.
 * One-time items contribute their amount once regardless of schedule.
 * Recurring items are multiplied by the number of billing periods in the year.
 *
 * @param {Object[]} feeLineItems
 * @param {number}   periods  - 12 for monthly, 4 for quarterly
 * @returns {number}
 */
function computeGrossAnnualFee(feeLineItems, periods) {
  return feeLineItems.reduce((sum, item) => {
    return sum + (item.isOneTime ? item.amount : item.amount * periods);
  }, 0);
}

/**
 * Builds a draft StudentFeeProfile for a CLASS_PROMOTION.
 *
 * Fee line items:
 *   - All active FIXED structures from destFeeStructures are always included.
 *   - An active VARIABLE structure from destFeeStructures is included only when
 *     its ID appears in variableFeeIds (the filtered carry-forward list).
 *
 * Fee adjustments:
 *   - Only the recurring adjustments returned by carryAdjustments() are included.
 *   - totalAdjustmentAmount is the sum of their computedAmount fields.
 *   - netAnnualFee = grossAnnualFee − totalAdjustmentAmount.
 *
 * @param {import('./types.js').PromotionBatch}   batch
 * @param {import('./types.js').StudentPromotion} studentPromotion
 * @param {Object}                                student
 * @param {Object|null}                           oldFeeProfile
 * @param {Object[]}                              destFeeStructures
 * @param {Object}                                academicYear
 * @param {number}                                openingOutstanding
 * @param {number}                                openingCredit
 * @param {string[]}                              variableFeeIds
 * @param {Object[]}                              feeAdjustments   - from carryAdjustments()
 * @param {string}                                [classLabel]     - human-readable destination class label
 * @returns {DraftFeeProfile}
 */
export function buildDraftFeeProfile(
  batch, studentPromotion, student, oldFeeProfile,
  destFeeStructures, academicYear,
  openingOutstanding, openingCredit, variableFeeIds, feeAdjustments,
  classLabel = ""
) {
  const carriedVariableSet = new Set(variableFeeIds);
  const carried            = feeAdjustments ?? [];

  const feeLineItems = (destFeeStructures ?? [])
    .filter(s => {
      if (s.isActive === false) return false;
      if (s.type === "fixed")    return true;
      if (s.type === "variable") return carriedVariableSet.has(s.id);
      return false;
    })
    .map(s => ({
      feeStructureId:        s.id,
      label:                 s.label,
      amount:                s.amount,
      type:                  s.type,
      isOneTime:             s.isOneTime             ?? false,
      chargedDuringHolidays: s.chargedDuringHolidays ?? true,
      allocationPriority:    s.allocationPriority    ?? 999,
    }));

  const schedule              = oldFeeProfile?.schedule ?? "monthly";
  const periods               = schedule === "quarterly" ? 4 : 12;
  const grossAnnualFee        = computeGrossAnnualFee(feeLineItems, periods);
  const totalAdjustmentAmount = carried.reduce((sum, adj) => sum + (adj.computedAmount ?? 0), 0);
  const netAnnualFee          = grossAnnualFee - totalAdjustmentAmount;

  return {
    studentId:             studentPromotion.studentId,
    schoolId:              batch.schoolId,
    academicYearId:        academicYear.id,
    academicYear:          batch.toAcademicYear,
    classId:               batch.toClassId,
    classLabel,
    feeStructureId:        null,
    status:                "draft",
    schedule,
    feeLineItems,
    variableFeeIds,
    feeAdjustments:        carried,
    grossAnnualFee,
    totalAdjustmentAmount,
    netAnnualFee,
    openingOutstanding,
    openingCredit,
    openingPaid:           0,
    installmentsGenerated: false,
    revisionCount:         0,
    lastRevisedAt:         null,
    promotedFromProfileId: studentPromotion.oldFeeProfileId ?? null,
    lastRevisionId:        null,
    lastRevisionType:      null,
    lastRevisionAt:        null,
  };
}

/**
 * Builds the PromotionPlan for a GRADUATION promotion.
 * No fee profile is created — graduated students leave the school.
 *
 * @param {import('./types.js').PromotionBatch}   batch
 * @param {import('./types.js').StudentPromotion} studentPromotion
 * @returns {PromotionPlan}
 */
export function buildGraduationPlan(batch, studentPromotion) {
  return {
    promotionId:        studentPromotion.promotionId,
    studentId:          studentPromotion.studentId,
    promotionType:      PromotionType.GRADUATION,
    promotionResult:    PromotionResult.GRADUATED,
    oldFeeProfileId:    studentPromotion.oldFeeProfileId ?? null,
    newFeeProfile:      null,
    openingOutstanding: 0,
    openingCredit:      0,
    variableFeeIds:     [],
    errors:             [],
    warnings:           [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a PromotionPlan for a single student.
 * Pure — no Firestore, no async, no side effects.
 *
 * @param {import('./types.js').PromotionBatch}   batch
 * @param {import('./types.js').StudentPromotion} studentPromotion
 * @param {Object}                                student            - Student Firestore doc
 * @param {Object|null}                           oldFeeProfile      - StudentFeeProfile or null
 * @param {Object[]}                              destFeeStructures  - Fee structures for destination
 * @param {Object}                                academicYear       - Target AcademicYear doc
 * @param {string}                                [classLabel]       - Destination class label e.g. "Grade 10 – A"
 * @returns {PromotionPlan}
 */
export function buildPromotionPlan(
  batch, studentPromotion, student, oldFeeProfile, destFeeStructures, academicYear,
  classLabel = ""
) {
  // GRADUATION → no fee profile; short-circuit immediately
  if (batch.promotionType === PromotionType.GRADUATION) {
    return buildGraduationPlan(batch, studentPromotion);
  }

  // CLASS_PROMOTION requires at least one active fee structure for the destination
  const { valid, error } = validateDestinationFeeStructures(destFeeStructures);
  if (!valid) {
    return {
      promotionId:        studentPromotion.promotionId,
      studentId:          studentPromotion.studentId,
      promotionType:      batch.promotionType,
      promotionResult:    PromotionResult.FAILED,
      oldFeeProfileId:    studentPromotion.oldFeeProfileId ?? null,
      newFeeProfile:      null,
      openingOutstanding: 0,
      openingCredit:      0,
      variableFeeIds:     [],
      errors:             [error],
      warnings:           [],
    };
  }

  const allWarnings = [];

  const { openingOutstanding, openingCredit, warnings: balanceWarnings } =
    carryBalances(batch, studentPromotion, oldFeeProfile);
  allWarnings.push(...balanceWarnings);

  const { ids: variableFeeIds, warnings: variableWarnings } =
    carryVariableFees(batch, studentPromotion, oldFeeProfile, destFeeStructures);
  allWarnings.push(...variableWarnings);

  const { adjustments: feeAdjustments, warnings: adjustmentWarnings } =
    carryAdjustments(oldFeeProfile);
  allWarnings.push(...adjustmentWarnings);

  const newFeeProfile = buildDraftFeeProfile(
    batch, studentPromotion, student, oldFeeProfile,
    destFeeStructures, academicYear,
    openingOutstanding, openingCredit, variableFeeIds, feeAdjustments,
    classLabel
  );

  return {
    promotionId:     studentPromotion.promotionId,
    studentId:       studentPromotion.studentId,
    promotionType:   batch.promotionType,
    promotionResult: PromotionResult.PROMOTED,
    oldFeeProfileId: studentPromotion.oldFeeProfileId ?? null,
    newFeeProfile,
    openingOutstanding,
    openingCredit,
    variableFeeIds,
    errors:          [],
    warnings:        allWarnings,
  };
}
