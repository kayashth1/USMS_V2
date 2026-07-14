/**
 * Firestore collection name constants for the Student Promotion module.
 * Kept here so any rename only requires a single change.
 *
 * Both collections are net-new — no legacy equivalents exist in the old schema.
 *   promotionBatches   — one document per bulk promotion operation
 *   studentPromotions  — one document per student inside a batch
 */
export const PROMOTION_COLLECTIONS = Object.freeze({
  PROMOTION_BATCHES:  "promotionBatches",
  STUDENT_PROMOTIONS: "studentPromotions",
});
