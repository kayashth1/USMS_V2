/**
 * Student Promotion module — Public API
 *
 * Barrel export for the Student Promotion V1 module.
 * Import everything from here; never import directly from sub-paths.
 *
 * Example:
 *   import { PromotionType, BatchStatus } from "@/promotion";
 *   import { createBatch, getPromotionsByBatch } from "@/promotion";
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  PromotionType,
  PromotionStatus,
  PromotionResult,
  BatchStatus,
} from "./constants/enums.js";

export { PROMOTION_COLLECTIONS } from "./constants/collections.js";

// ─── Validation ───────────────────────────────────────────────────────────────
export { validatePromotionBatch }   from "./validation/promotionBatch.validate.js";
export { validateStudentPromotion } from "./validation/studentPromotion.validate.js";

// ─── Promotion Batch service ──────────────────────────────────────────────────
export {
  createBatch,
  updateBatch,
  getBatch,
  getBatches,
  cancelBatch,
} from "./services/promotionBatch.service.js";

// ─── Student Promotion service ────────────────────────────────────────────────
export {
  createPromotion,
  completePromotion,
  failPromotion,
  skipPromotion,
  getPromotion,
  getPromotionsByBatch,
} from "./services/studentPromotion.service.js";

// ─── Promotion persistence ────────────────────────────────────────────────────
export {
  persistPromotionPlan,
  deriveBatchStatus,
} from "./services/promotionPersistence.service.js";

// ─── Promotion execution ──────────────────────────────────────────────────────
export {
  resetForRetry,
  executePromotion,
  executeBatch,
  retryFailed,
} from "./services/promotionExecution.service.js";

// ─── Balance utilities (single source of truth for outstanding/credit) ────────
export { computeStudentBalances } from "./utils/promotionBalanceUtils.js";

// ─── Promotion engine (pure — no Firestore) ───────────────────────────────────
export {
  buildPromotionPlan,
  buildGraduationPlan,
  buildDraftFeeProfile,
  carryBalances,
  carryVariableFees,
  carryAdjustments,
  validateDestinationFeeStructures,
  PromotionEngineErrorCodes,
  PromotionEngineWarningCodes,
} from "./promotionEngine.js";
