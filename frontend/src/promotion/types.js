/**
 * JSDoc type definitions for the Student Promotion module.
 *
 * These @typedefs mirror the approved Firestore document schemas exactly.
 * No runtime code lives here — import this file in JSDoc @type annotations
 * for IDE type hints. The `export {}` at the bottom makes this a module.
 */

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} errors
 */

// ─── PromotionPlanSnapshot ────────────────────────────────────────────────────

/**
 * Immutable snapshot of the promotion configuration captured when the batch is
 * created. Written once; never mutated by the execution layer.
 * The execution layer may store additional fields beyond the four listed here.
 *
 * @typedef {Object} PromotionPlanSnapshot
 *
 * @property {string} academicYear
 *   The target academic year this promotion runs into. Format: "YYYY-YY".
 *   Denormalised from PromotionBatch.toAcademicYear for audit readability.
 *
 * @property {boolean} carryFeeBalance
 *   Snapshot of the batch-level carryFeeBalance flag at the time of creation.
 *
 * @property {boolean} carryVariableFees
 *   Snapshot of the batch-level carryVariableFees flag at the time of creation.
 *
 * @property {number} selectedStudentCount
 *   Number of students selected for this promotion run at planning time.
 *   May differ from totalStudents if students are added or removed before
 *   execution begins.
 */

// ─── PromotionBatch ───────────────────────────────────────────────────────────

/**
 * Represents one bulk promotion operation for a class cohort.
 * Written once when the batch is created; counters are updated incrementally
 * as individual StudentPromotion records are processed.
 *
 * @typedef {Object} PromotionBatch
 *
 * @property {string} batchId
 *   Firestore document ID. Set by the service after creation.
 *
 * @property {string} schoolId
 *   Owning school. Denormalised on every document for independent queries.
 *
 * @property {string} fromAcademicYear
 *   Academic year students are promoted FROM. Format: "YYYY-YY" (e.g. "2025-26").
 *
 * @property {string} toAcademicYear
 *   Academic year students are promoted TO. Format: "YYYY-YY" (e.g. "2026-27").
 *
 * @property {string} fromClassId
 *   Firestore ID of the class students are moving FROM.
 *
 * @property {string} toClassId
 *   Firestore ID of the class students are moving TO.
 *   For GRADUATION promotions this may be a sentinel / null class.
 *
 * @property {import('./constants/enums.js').PromotionType[keyof import('./constants/enums.js').PromotionType]} promotionType
 *
 * @property {import('./constants/enums.js').BatchStatus[keyof import('./constants/enums.js').BatchStatus]} status
 *
 * @property {boolean} carryFeeBalance
 *   When true, each student's outstanding fee balance is carried forward as
 *   openingOutstanding on the new-year fee profile.
 *
 * @property {boolean} carryVariableFees
 *   When true, each student's current variable fee structure IDs are copied into
 *   carriedVariableFeeIds on the StudentPromotion record for use when the new
 *   fee profile is created.
 *
 * @property {number} totalStudents
 *   Count of StudentPromotion records created inside this batch.
 *
 * @property {number} completedStudents
 *   Incremented each time a StudentPromotion reaches COMPLETED status.
 *
 * @property {number} failedStudents
 *   Incremented each time a StudentPromotion reaches FAILED status.
 *
 * @property {number} skippedStudents
 *   Incremented each time a StudentPromotion reaches SKIPPED status.
 *
 * @property {string} requestedBy
 *   Admin identifier (UID or school ID) who created the batch.
 *
 * @property {import('firebase/firestore').Timestamp} requestedAt
 *
 * @property {string|null} completedBy
 *   Set when the batch reaches a terminal status (COMPLETED, PARTIAL_SUCCESS,
 *   FAILED, CANCELLED).
 *
 * @property {import('firebase/firestore').Timestamp|null} completedAt
 *
 * @property {string|null} remarks
 *   Optional free-text notes from the admin.
 *
 * @property {PromotionPlanSnapshot} promotionPlanSnapshot
 *   Immutable snapshot of the promotion configuration at batch creation time.
 *   Written once by the service; never updated by the execution layer.
 */

// ─── StudentPromotion ─────────────────────────────────────────────────────────

/**
 * One promotion record for a single student inside a PromotionBatch.
 * Created in bulk when the batch is drafted; processed one by one during execution.
 *
 * @typedef {Object} StudentPromotion
 *
 * @property {string} promotionId
 *   Firestore document ID. Set by the service after creation.
 *
 * @property {string} batchId
 *   Parent PromotionBatch document ID.
 *
 * @property {string} schoolId
 *   Denormalised from the parent batch for independent queries.
 *
 * @property {string} studentId
 *   Firestore ID of the student being promoted.
 *
 * @property {string} fromAcademicYear   - "YYYY-YY"
 * @property {string} toAcademicYear     - "YYYY-YY"
 * @property {string} fromClassId
 * @property {string} toClassId
 *
 * @property {import('./constants/enums.js').PromotionType[keyof import('./constants/enums.js').PromotionType]}    promotionType
 * @property {import('./constants/enums.js').PromotionStatus[keyof import('./constants/enums.js').PromotionStatus]} status
 * @property {import('./constants/enums.js').PromotionResult[keyof import('./constants/enums.js').PromotionResult]|null} promotionResult
 *   The business outcome of this promotion. null until the execution layer
 *   resolves the record (COMPLETED, FAILED, or SKIPPED). PromotionStatus tracks
 *   execution progress; PromotionResult records what actually happened to the student.
 *
 * @property {number} openingOutstanding
 *   Outstanding fee balance to carry forward as openingOutstanding on the new
 *   fee profile. Sourced from the student's current-year fee profile at batch
 *   creation time. 0 when carryFeeBalance is false or there is no balance.
 *
 * @property {number} openingCredit
 *   Overpaid / credit balance to carry forward. 0 when none.
 *
 * @property {string[]} carriedVariableFeeIds
 *   Variable fee structure IDs to enroll the student in for the new year.
 *   Empty array when carryVariableFees is false or the student has none.
 *
 * @property {string|null} oldFeeProfileId
 *   The StudentFeeProfile ID from the source academic year (fromAcademicYear).
 *   Captured at batch creation time as the source of openingOutstanding,
 *   openingCredit, and carriedVariableFeeIds. null when the student has no
 *   active fee profile in the source year.
 *
 * @property {string|null} newFeeProfileId
 *   Populated once a new StudentFeeProfile is created for the student in the
 *   target academic year. null until then.
 *
 * @property {string|null} errorMessage
 *   Human-readable error description when status is FAILED. null otherwise.
 *
 * @property {string} requestedBy
 * @property {import('firebase/firestore').Timestamp} requestedAt
 * @property {string|null} completedBy
 * @property {import('firebase/firestore').Timestamp|null} completedAt
 */

export {};
