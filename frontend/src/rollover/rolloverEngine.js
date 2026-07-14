/**
 * RolloverEngine — Academic Year Rollover module
 *
 * Pure computation module. No Firestore. No async. No timestamps. No IDs generated.
 * No side effects of any kind.
 *
 * Given the current and next AcademicYear documents, a completed PromotionBatch,
 * and the full list of its StudentPromotion records, produces a RolloverPlan that
 * describes every write needed to officially start the new academic year.
 *
 * The persistence layer reads this plan and performs the actual Firestore writes.
 * The same inputs always produce the same output (referentially transparent).
 *
 * Main entry point:
 *   buildRolloverPlan(currentAcademicYear, nextAcademicYear, batch, studentPromotions)
 *
 * Computation pipeline:
 *   1. Build yearTransition from the two AcademicYear document IDs
 *   2. For each StudentPromotion in the list:
 *        a. status !== COMPLETED             → skipped (add to skippedPromotionIds)
 *        b. promotionResult === PROMOTED     → CLASS_PROMOTION path
 *        c. promotionResult === GRADUATED    → GRADUATION path
 *        d. all other promotionResult values → skipped
 *   3. Compute summary counts
 *   4. Return RolloverPlan
 *
 * CLASS_PROMOTION path per student:
 *   StudentUpdate      (currentClassId, currentAcademicYear)
 *   ProfileActivation  (newFeeProfileId → ACTIVE)    — only when ID is present
 *   ProfileClosure     (oldFeeProfileId → CLOSED)    — only when ID is present
 *
 * GRADUATION path per student:
 *   GraduationUpdate   (status=alumni, graduatedAcademicYear, graduatedClassId)
 *   ProfileClosure     (oldFeeProfileId → CLOSED)    — only when ID is present
 *   No ProfileActivation — graduates receive no new fee profile
 *
 * Invariants:
 *   - Student.currentClassId and currentAcademicYear are set ONLY for PROMOTED students
 *   - Student.status="alumni" and graduated* fields are set ONLY for GRADUATED students
 *   - Graduated students do NOT get currentClassId / currentAcademicYear updates
 *   - ProfileActivation is produced ONLY when newFeeProfileId is a non-empty string
 *   - ProfileClosure   is produced ONLY when oldFeeProfileId  is a non-empty string
 *   - FAILED, SKIPPED, CANCELLED, REPEATED, TRANSFERRED, LEFT_SCHOOL → skipped
 *   - No timestamps in any output — persistence layer stamps them at write time
 *   - No new Firestore document IDs — all IDs come from the input documents
 */

import { PromotionStatus, PromotionResult } from "../promotion/constants/enums.js";

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} AcademicYearTransition
 * @property {string} activateYearId
 *   Firestore document ID of the next AcademicYear to set ACTIVE.
 * @property {string} deactivateYearId
 *   Firestore document ID of the current AcademicYear to CLOSE.
 */

/**
 * @typedef {Object} StudentUpdate
 * Produced for every PROMOTED student. Moves them into the new class and year.
 * Never produced for GRADUATED students.
 *
 * @property {string} studentId
 * @property {string} currentClassId         - toClassId from StudentPromotion
 * @property {string} currentAcademicYear    - nextAcademicYear.year ("YYYY-YY")
 */

/**
 * @typedef {Object} ProfileActivation
 * A draft StudentFeeProfile to be transitioned to ACTIVE status.
 * Produced only when StudentPromotion.newFeeProfileId is present.
 *
 * @property {string} profileId  - StudentFeeProfile Firestore document ID
 * @property {string} studentId  - owning student (for tracing and error reporting)
 */

/**
 * @typedef {Object} ProfileClosure
 * An ACTIVE StudentFeeProfile from the outgoing year to be CLOSED.
 * Produced for both PROMOTED and GRADUATED students when oldFeeProfileId is present.
 *
 * @property {string} profileId  - StudentFeeProfile Firestore document ID
 * @property {string} studentId  - owning student (for tracing and error reporting)
 */

/**
 * @typedef {Object} GraduationUpdate
 * Produced for every GRADUATED student.
 * Sets status = "alumni" and records which year and class they completed.
 *
 * Intentionally omits currentClassId and currentAcademicYear — graduates leave
 * the school and no longer belong to an active class.
 *
 * No `graduatedAt` timestamp — the persistence layer adds server timestamps.
 *
 * @property {string} studentId
 * @property {string} status                 - always "alumni"
 * @property {string} graduatedAcademicYear  - batch.fromAcademicYear
 * @property {string} graduatedClassId       - the student's fromClassId (completing class)
 */

/**
 * @typedef {Object} RolloverSummary
 * @property {number} totalPromotions    - total StudentPromotion records processed
 * @property {number} promoted           - students moved to the new class
 * @property {number} graduated          - students marked as alumni
 * @property {number} skipped            - records excluded (non-COMPLETED or unhandled result)
 * @property {number} profilesActivated  - draft profiles queued for activation
 * @property {number} profilesClosed     - active profiles queued for closure
 */

/**
 * @typedef {Object} RolloverPlan
 * @property {AcademicYearTransition} yearTransition
 * @property {StudentUpdate[]}        studentUpdates       - PROMOTED students to update
 * @property {ProfileActivation[]}    profileActivations   - draft profiles to activate
 * @property {ProfileClosure[]}       profileClosures      - active profiles to close
 * @property {GraduationUpdate[]}     graduationUpdates    - GRADUATED students to update
 * @property {string[]}               skippedPromotionIds  - promotion IDs excluded from rollover
 * @property {RolloverSummary}        summary
 */

// ─── Helper builders ──────────────────────────────────────────────────────────

/**
 * Builds a StudentUpdate for a CLASS_PROMOTION student.
 *
 * currentClassId   → the destination class the student was promoted into.
 * currentAcademicYear → the year string of the new year (e.g. "2026-27").
 *
 * This is the ONLY module that may produce writes to Student.currentClassId
 * and Student.currentAcademicYear.
 *
 * @param {import('../promotion/types.js').StudentPromotion} sp
 * @param {{ id: string, year: string }} nextAcademicYear
 * @returns {StudentUpdate}
 */
export function buildStudentUpdate(sp, nextAcademicYear) {
  return {
    studentId:           sp.studentId,
    currentClassId:      sp.toClassId,
    currentAcademicYear: nextAcademicYear.year,
  };
}

/**
 * Builds a ProfileActivation for the draft fee profile created during promotion.
 *
 * Activation transitions the profile from DRAFT to ACTIVE, which enables
 * installment generation and payment acceptance in the new academic year.
 *
 * Only called when StudentPromotion.newFeeProfileId is a non-empty string.
 *
 * @param {import('../promotion/types.js').StudentPromotion} sp
 * @returns {ProfileActivation}
 */
export function buildProfileActivation(sp) {
  return {
    profileId: sp.newFeeProfileId,
    studentId: sp.studentId,
  };
}

/**
 * Builds a ProfileClosure for the fee profile from the outgoing academic year.
 *
 * Closure transitions the profile from ACTIVE (or DRAFT) to CLOSED, which
 * prevents further payment posting against the old year's profile.
 *
 * Called for both PROMOTED and GRADUATED students when oldFeeProfileId exists.
 * Only called when StudentPromotion.oldFeeProfileId is a non-empty string.
 *
 * @param {import('../promotion/types.js').StudentPromotion} sp
 * @returns {ProfileClosure}
 */
export function buildProfileClosure(sp) {
  return {
    profileId: sp.oldFeeProfileId,
    studentId: sp.studentId,
  };
}

/**
 * Builds a GraduationUpdate for a GRADUATION student.
 *
 * This is the ONLY module that may produce writes to Student.status,
 * Student.graduatedAcademicYear, and Student.graduatedClassId.
 *
 * Uses the student's own fromClassId (not batch.fromClassId) so the record
 * remains accurate if the batch is ever used to process students from
 * different source classes in future variations.
 *
 * Intentionally omits currentClassId / currentAcademicYear — graduates leave
 * the school and should not be associated with an active class.
 *
 * @param {import('../promotion/types.js').StudentPromotion} sp
 * @param {import('../promotion/types.js').PromotionBatch}   batch
 * @returns {GraduationUpdate}
 */
export function buildGraduationUpdate(sp, batch) {
  return {
    studentId:             sp.studentId,
    status:                "alumni",
    graduatedAcademicYear: batch.fromAcademicYear,
    graduatedClassId:      sp.fromClassId,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Builds a RolloverPlan from a completed PromotionBatch and its StudentPromotion
 * records. Pure — no Firestore, no async, no side effects.
 *
 * Only StudentPromotion records that are:
 *   status === COMPLETED AND promotionResult === PROMOTED   → CLASS_PROMOTION path
 *   status === COMPLETED AND promotionResult === GRADUATED  → GRADUATION path
 * are included in the plan. Every other record goes to skippedPromotionIds.
 *
 * This function does NOT need to know about promotion type on the batch — it
 * routes on the individual StudentPromotion.promotionResult so that a single
 * mixed batch (if one ever arises) is handled correctly.
 *
 * @param {{ id: string, year: string }} currentAcademicYear
 *   The academic year being closed. `id` must be the Firestore document ID.
 *   `year` is the "YYYY-YY" string used on Student documents.
 *
 * @param {{ id: string, year: string }} nextAcademicYear
 *   The academic year being activated. Same shape as currentAcademicYear.
 *
 * @param {import('../promotion/types.js').PromotionBatch} batch
 *   The PromotionBatch for this rollover. Provides fromAcademicYear for
 *   graduation audit fields.
 *
 * @param {import('../promotion/types.js').StudentPromotion[]} studentPromotions
 *   All StudentPromotion records for the batch. Records that are not COMPLETED
 *   or have unhandled promotionResults are skipped gracefully — the engine
 *   never throws on unexpected input.
 *
 * @returns {RolloverPlan}
 */
export function buildRolloverPlan(
  currentAcademicYear, nextAcademicYear, batch, studentPromotions
) {
  const yearTransition = {
    activateYearId:   nextAcademicYear.id,
    deactivateYearId: currentAcademicYear.id,
  };

  const studentUpdates      = [];
  const profileActivations  = [];
  const profileClosures     = [];
  const graduationUpdates   = [];
  const skippedPromotionIds = [];

  for (const sp of (studentPromotions ?? [])) {

    // Only COMPLETED promotions produce writes — everything else is skipped.
    if (sp.status !== PromotionStatus.COMPLETED) {
      skippedPromotionIds.push(sp.promotionId);
      continue;
    }

    if (sp.promotionResult === PromotionResult.PROMOTED) {
      // ── CLASS_PROMOTION ────────────────────────────────────────────────────
      // Move the student into their new class and academic year.
      studentUpdates.push(buildStudentUpdate(sp, nextAcademicYear));

      // Activate the draft fee profile created during promotion.
      if (sp.newFeeProfileId) {
        profileActivations.push(buildProfileActivation(sp));
      }

      // Close the outgoing year's fee profile.
      if (sp.oldFeeProfileId) {
        profileClosures.push(buildProfileClosure(sp));
      }

    } else if (sp.promotionResult === PromotionResult.GRADUATED) {
      // ── GRADUATION ─────────────────────────────────────────────────────────
      // Mark the student as an alumnus. Do NOT update currentClassId or
      // currentAcademicYear — graduates leave the school.
      graduationUpdates.push(buildGraduationUpdate(sp, batch));

      // Close the outgoing year's fee profile.
      if (sp.oldFeeProfileId) {
        profileClosures.push(buildProfileClosure(sp));
      }
      // No ProfileActivation — GRADUATION never creates a new fee profile.

    } else {
      // REPEATED, TRANSFERRED, LEFT_SCHOOL, SKIPPED, null (FAILED engine output),
      // or any future result value not handled above — skip gracefully.
      skippedPromotionIds.push(sp.promotionId);
    }
  }

  const summary = {
    totalPromotions:   (studentPromotions ?? []).length,
    promoted:          studentUpdates.length,
    graduated:         graduationUpdates.length,
    skipped:           skippedPromotionIds.length,
    profilesActivated: profileActivations.length,
    profilesClosed:    profileClosures.length,
  };

  return {
    yearTransition,
    studentUpdates,
    profileActivations,
    profileClosures,
    graduationUpdates,
    skippedPromotionIds,
    summary,
  };
}
