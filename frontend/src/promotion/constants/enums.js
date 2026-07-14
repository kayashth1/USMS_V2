/**
 * Enums and status constants for the Student Promotion module.
 * All objects are frozen to prevent accidental mutation.
 */

/**
 * The type of promotion:
 *   CLASS_PROMOTION → student advances to the next class within the school
 *   GRADUATION      → student completes their final year and leaves the school
 */
export const PromotionType = Object.freeze({
  CLASS_PROMOTION: "class_promotion",
  GRADUATION:      "graduation",
});

/**
 * Lifecycle of a single StudentPromotion document:
 *   DRAFT     → created inside a batch; not yet processed
 *   PENDING   → queued or actively being processed by a running batch
 *   COMPLETED → student successfully promoted
 *   FAILED    → promotion attempted but encountered an error
 *   SKIPPED   → intentionally excluded from the promotion run
 *   CANCELLED → batch was cancelled before this record was processed
 */
export const PromotionStatus = Object.freeze({
  DRAFT:     "draft",
  PENDING:   "pending",
  COMPLETED: "completed",
  FAILED:    "failed",
  SKIPPED:   "skipped",
  CANCELLED: "cancelled",
});

/**
 * The business outcome of a single StudentPromotion record.
 * Set by the execution layer when processing completes.
 * Independent of PromotionStatus, which tracks execution state.
 *
 *   PROMOTED    → student moved to the next class in the same school
 *   GRADUATED   → student completed the final year and left the school
 *   REPEATED    → student stays in the same class for another year
 *   TRANSFERRED → student moved to a different school during promotion
 *   LEFT_SCHOOL → student left before promotion could be completed
 *   SKIPPED     → student intentionally excluded; no outcome recorded
 */
export const PromotionResult = Object.freeze({
  PROMOTED:    "promoted",
  GRADUATED:   "graduated",
  REPEATED:    "repeated",
  TRANSFERRED: "transferred",
  LEFT_SCHOOL: "left_school",
  SKIPPED:     "skipped",
});

/**
 * Lifecycle of a PromotionBatch document:
 *   DRAFT           → batch configured and staged; not yet executed
 *   RUNNING         → actively processing student promotion records
 *   COMPLETED       → all students processed successfully
 *   PARTIAL_SUCCESS → run finished with a mix of completed, failed, and/or skipped
 *   FAILED          → run finished with all or most students failed
 *   CANCELLED       → batch cancelled before or during execution
 */
export const BatchStatus = Object.freeze({
  DRAFT:           "draft",
  RUNNING:         "running",
  COMPLETED:       "completed",
  PARTIAL_SUCCESS: "partial_success",
  FAILED:          "failed",
  CANCELLED:       "cancelled",
});
