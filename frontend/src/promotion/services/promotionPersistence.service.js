/**
 * PromotionPersistenceService — Student Promotion module
 *
 * Persists an already-computed PromotionPlan to Firestore.
 * This module is the ONLY place that writes promotion results to the database.
 *
 * All writes for a single student execute inside ONE atomic Firestore transaction.
 * No partial writes. Either every document commits, or nothing does.
 *
 * What this module does:
 *   - Reads the batch and StudentPromotion for concurrency guards
 *   - Creates a draft StudentFeeProfile for CLASS_PROMOTION plans
 *   - Stores the complete PromotionPlan as an immutable audit snapshot
 *   - Derives and writes BatchStatus on every call
 *
 * What this module never does:
 *   - Recalculate anything (PromotionPlan is used exactly as received)
 *   - Update Student.currentClassId, currentAcademicYear, or status
 *   - Activate the new fee profile or generate installments
 *   - Make decisions about student lifecycle (that belongs to the Rollover module)
 *
 * Transaction write order (Firestore Web SDK: all reads must precede writes):
 *   Reads:  batchRef → promotionRef → [profileRef for CLASS_PROMOTION only]
 *   Writes: [profileRef.set] → promotionRef.update → batchRef.update
 *
 * Three execution paths:
 *
 *   CLASS_PROMOTION (plan.errors empty):
 *     tx.set    studentFeeProfiles/{profileId}   ← plan.newFeeProfile verbatim
 *     tx.update studentPromotions/{promotionId}  ← COMPLETED + newFeeProfileId
 *                                                   + promotionPlan snapshot
 *     tx.update promotionBatches/{batchId}       ← counters + derived status
 *
 *   GRADUATION (plan.errors empty):
 *     tx.update studentPromotions/{promotionId}  ← COMPLETED + GRADUATED
 *                                                   + promotionPlan snapshot
 *     tx.update promotionBatches/{batchId}       ← counters + derived status
 *     NOTE: The Student document is NOT touched.
 *           Student lifecycle (alumni status, class change) is handled by the
 *           Academic Year Rollover module, not here.
 *
 *   FAILED (plan.errors non-empty):
 *     tx.update studentPromotions/{promotionId}  ← FAILED + errorMessage
 *                                                   + promotionPlan snapshot
 *     tx.update promotionBatches/{batchId}       ← counters + derived status
 */

import {
  doc, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase.js";
import { PROMOTION_COLLECTIONS } from "../constants/collections.js";
import { COLLECTIONS } from "../../fees-v2/constants/collections.js";
import {
  PromotionType, PromotionStatus, PromotionResult, BatchStatus,
} from "../constants/enums.js";

// ─── Private utilities ────────────────────────────────────────────────────────

function _assertId(id, label = "id") {
  if (!id || typeof id !== "string") throw new Error(`${label} is required`);
}

/**
 * Deterministic fee profile document ID.
 * Matches the scheme in StudentFeeProfileService — the same ID guarantees that
 * the uniqueness guard inside the transaction catches duplicates without a query.
 */
function _profileDocId(studentId, academicYearId) {
  return `${studentId}_${academicYearId}`;
}

/**
 * Serialises a PromotionPlan into a Firestore-safe plain object.
 *
 * The engine may produce `undefined` for fields whose enum value does not exist
 * (e.g. `promotionResult` for FAILED plans where `PromotionResult.FAILED` is
 * not defined in the enum). Firestore rejects documents containing `undefined`,
 * so every `undefined` is normalised to `null` before storage.
 *
 * JSON round-trip is safe here: the engine output is a pure POJO with no
 * Firebase FieldValue sentinels, no Timestamps, and no circular references.
 */
function _sanitizePlan(plan) {
  return JSON.parse(JSON.stringify(plan, (_key, value) =>
    value === undefined ? null : value
  ));
}

// ─── Internal transaction write helpers ───────────────────────────────────────
// Each helper enqueues ONLY tx.set() or tx.update() calls.
// None of them call tx.get(). All Phase 1 reads finish before these run.

/**
 * Enqueues tx.set() to create a new draft StudentFeeProfile.
 * Writes plan.newFeeProfile verbatim — no fields are recomputed.
 * Adds createdAt and updatedAt server timestamps.
 */
function _createDraftFeeProfile(tx, profileRef, plan, now) {
  tx.set(profileRef, {
    ...plan.newFeeProfile,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Enqueues tx.update() to mark a StudentPromotion COMPLETED for CLASS_PROMOTION.
 *
 * Fields written:
 *   status           → COMPLETED
 *   promotionResult  → PROMOTED
 *   newFeeProfileId  → deterministic profile doc ID
 *   promotionPlan    → complete engine output (immutable audit snapshot)
 *   warnings         → from plan (also embedded in promotionPlan; stored top-level
 *                       for cheap query access without fetching the full snapshot)
 *   completedBy / At → audit trail
 */
function _persistPromotion(tx, promotionRef, plan, newFeeProfileId, planSnapshot, persistedBy, now) {
  tx.update(promotionRef, {
    status:          PromotionStatus.COMPLETED,
    promotionResult: PromotionResult.PROMOTED,
    newFeeProfileId,
    promotionPlan:   planSnapshot,
    warnings:        plan.warnings ?? [],
    completedBy:     persistedBy,
    completedAt:     now,
    updatedAt:       now,
  });
}

/**
 * Enqueues tx.update() to mark a StudentPromotion COMPLETED for GRADUATION.
 *
 * The Student document is NOT touched here. Updating the student's class,
 * status, and academic year is the responsibility of the Academic Year Rollover
 * module, which runs after all promotions in the batch are persisted.
 *
 * Fields written:
 *   status           → COMPLETED
 *   promotionResult  → GRADUATED
 *   newFeeProfileId  → null  (graduates receive no new fee profile)
 *   promotionPlan    → complete engine output (immutable audit snapshot)
 *   warnings         → from plan
 *   completedBy / At → audit trail
 */
function _persistGraduation(tx, promotionRef, plan, planSnapshot, persistedBy, now) {
  tx.update(promotionRef, {
    status:          PromotionStatus.COMPLETED,
    promotionResult: PromotionResult.GRADUATED,
    newFeeProfileId: null,
    promotionPlan:   planSnapshot,
    warnings:        plan.warnings ?? [],
    completedBy:     persistedBy,
    completedAt:     now,
    updatedAt:       now,
  });
}

/**
 * Enqueues tx.update() to mark a StudentPromotion FAILED.
 *
 * promotionResult is explicitly null — a FAILED execution has no business outcome.
 * The first engine error message is stored top-level for quick display; the full
 * errors[] array is preserved inside promotionPlan.
 *
 * Fields written:
 *   status           → FAILED
 *   promotionResult  → null
 *   newFeeProfileId  → null
 *   errorMessage     → plan.errors[0].message (top-level for display)
 *   promotionPlan    → complete engine output including all errors and warnings
 *   warnings         → from plan
 *   completedBy / At → audit trail
 */
function _persistFailedPromotion(tx, promotionRef, plan, planSnapshot, persistedBy, now) {
  const errorMessage = plan.errors?.[0]?.message ?? "Promotion failed";
  tx.update(promotionRef, {
    status:          PromotionStatus.FAILED,
    promotionResult: null,
    newFeeProfileId: null,
    errorMessage,
    promotionPlan:   planSnapshot,
    warnings:        plan.warnings ?? [],
    completedBy:     persistedBy,
    completedAt:     now,
    updatedAt:       now,
  });
}

/**
 * Enqueues tx.update() on the PromotionBatch to atomically increment counters
 * and derive the new BatchStatus from the updated totals.
 *
 * completedBy / completedAt are stamped the first time the batch reaches a
 * terminal status (COMPLETED, PARTIAL_SUCCESS, FAILED). Subsequent calls that
 * keep the batch terminal do not overwrite them.
 *
 * @param {"completed"|"failed"|"skipped"} outcome
 */
function _updateBatchCounters(tx, batchRef, freshBatch, outcome, persistedBy, now) {
  const newCompleted = (freshBatch.completedStudents ?? 0) + (outcome === "completed" ? 1 : 0);
  const newFailed    = (freshBatch.failedStudents    ?? 0) + (outcome === "failed"    ? 1 : 0);
  const newSkipped   = (freshBatch.skippedStudents   ?? 0) + (outcome === "skipped"   ? 1 : 0);
  const total        = freshBatch.totalStudents ?? 0;

  const newStatus = deriveBatchStatus(newCompleted, newFailed, newSkipped, total);

  const update = {
    completedStudents: newCompleted,
    failedStudents:    newFailed,
    skippedStudents:   newSkipped,
    status:            newStatus,
    updatedAt:         now,
  };

  const isTerminal =
    newStatus === BatchStatus.COMPLETED       ||
    newStatus === BatchStatus.PARTIAL_SUCCESS ||
    newStatus === BatchStatus.FAILED;

  if (isTerminal && !freshBatch.completedAt) {
    update.completedBy = persistedBy;
    update.completedAt = now;
  }

  tx.update(batchRef, update);
}

// ─── Pure export (also used by the execution layer) ──────────────────────────

/**
 * Derives BatchStatus from the current counter snapshot.
 * Pure — no Firestore, no async. Exported for unit testing and the execution
 * layer (e.g. to predict the batch outcome before committing).
 *
 * Rules:
 *   processed < totalStudents          → RUNNING
 *   all processed, no failures         → COMPLETED
 *   all processed, all failed          → FAILED
 *   all processed, mixed results       → PARTIAL_SUCCESS
 *
 * Skipped students count as "processed" but never as failures.
 * CANCELLED is not derived here — it is set explicitly by cancelBatch().
 *
 * @param {number} completedStudents
 * @param {number} failedStudents
 * @param {number} skippedStudents
 * @param {number} totalStudents
 * @returns {string} BatchStatus value
 */
export function deriveBatchStatus(completedStudents, failedStudents, skippedStudents, totalStudents) {
  const processed = completedStudents + failedStudents + skippedStudents;
  if (processed < totalStudents)        return BatchStatus.RUNNING;
  if (failedStudents === 0)             return BatchStatus.COMPLETED;
  if (failedStudents === totalStudents) return BatchStatus.FAILED;
  return BatchStatus.PARTIAL_SUCCESS;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Persists an already-computed PromotionPlan to Firestore in one atomic
 * Firestore transaction.
 *
 * Typical caller flow:
 *   1. plan   = buildPromotionPlan(batch, studentPromotion, student,
 *                                  oldFeeProfile, destFeeStructures, academicYear)
 *   2. result = await persistPromotionPlan(batch, studentPromotion, plan, adminUid)
 *
 * The PromotionPlan is stored verbatim as `promotionPlan` inside the
 * StudentPromotion document. This snapshot is the permanent audit record —
 * it must not be recomputed or reconstructed at a later point.
 *
 * Pre-conditions (checked before the transaction opens):
 *   - batch.batchId, studentPromotion.promotionId, studentPromotion.studentId,
 *     and persistedBy must be non-empty strings.
 *   - plan must be the object produced by buildPromotionPlan().
 *
 * Transaction phases:
 *   Phase 1 — reads (all tx.get() before any write):
 *     a. batchRef      → fresh counter snapshot; existence guard
 *     b. promotionRef  → concurrency guard: must be DRAFT or PENDING
 *     c. profileRef    → uniqueness guard: must NOT exist (CLASS_PROMOTION only)
 *   Phase 2 — writes (no further reads):
 *     FAILED plan:
 *       d. tx.update promotionRef  → FAILED + errorMessage + plan snapshot
 *       e. tx.update batchRef      → failedStudents++ + derived status
 *     CLASS_PROMOTION:
 *       d. tx.set    profileRef    → draft fee profile (plan.newFeeProfile)
 *       e. tx.update promotionRef  → COMPLETED + newFeeProfileId + plan snapshot
 *       f. tx.update batchRef      → completedStudents++ + derived status
 *     GRADUATION:
 *       d. tx.update promotionRef  → COMPLETED + GRADUATED + plan snapshot
 *       e. tx.update batchRef      → completedStudents++ + derived status
 *
 * @param {import('../types.js').PromotionBatch}          batch
 * @param {import('../types.js').StudentPromotion}         studentPromotion
 * @param {import('../promotionEngine.js').PromotionPlan}  plan
 * @param {string}                                         persistedBy  Admin UID
 *
 * @returns {Promise<{ newFeeProfileId: string|null, batchStatus: string }>}
 *
 * @throws {Error} if PromotionBatch is not found
 * @throws {Error} if StudentPromotion is not found or is no longer processable
 * @throws {Error} if a duplicate fee profile is detected (CLASS_PROMOTION)
 */
export async function persistPromotionPlan(batch, studentPromotion, plan, persistedBy) {

  // ── Pre-flight checks (outside transaction — no I/O) ──────────────────────
  _assertId(batch.batchId,                "batch.batchId");
  _assertId(studentPromotion.promotionId, "studentPromotion.promotionId");
  _assertId(studentPromotion.studentId,   "studentPromotion.studentId");
  _assertId(persistedBy,                  "persistedBy");
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("plan is required and must be a PromotionPlan object");
  }

  const hasFailed    = Array.isArray(plan.errors) && plan.errors.length > 0;
  const isGraduation = batch.promotionType === PromotionType.GRADUATION;

  // Sanitise undefined → null so Firestore accepts the snapshot.
  // The engine sets promotionResult to PromotionResult.FAILED for error plans,
  // but that key is absent from the PromotionResult enum, making it undefined.
  const planSnapshot = _sanitizePlan(plan);

  // ── Build document refs (outside transaction — no I/O) ───────────────────
  const batchRef     = doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES,  batch.batchId);
  const promotionRef = doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, studentPromotion.promotionId);

  // Only needed for CLASS_PROMOTION success: uniqueness guard + new doc creation
  let profileRef = null;
  if (!hasFailed && !isGraduation) {
    profileRef = doc(
      db,
      COLLECTIONS.STUDENT_FEE_PROFILES,
      _profileDocId(studentPromotion.studentId, plan.newFeeProfile.academicYearId),
    );
  }

  // Captured inside the transaction body; safe to read after commit
  let resolvedProfileId   = null;
  let resolvedBatchStatus = null;

  await runTransaction(db, async (tx) => {

    // ── Phase 1: Reads ────────────────────────────────────────────────────────
    // All tx.get() must complete before any tx.set() or tx.update().
    const batchSnapP     = tx.get(batchRef);
    const promotionSnapP = tx.get(promotionRef);
    const profileSnapP   = profileRef ? tx.get(profileRef) : Promise.resolve(null);

    const [batchSnap, promotionSnap, profileSnap] = await Promise.all([
      batchSnapP, promotionSnapP, profileSnapP,
    ]);

    // (a) Batch existence guard
    if (!batchSnap.exists()) {
      throw new Error(`PromotionBatch "${batch.batchId}" not found. Aborting.`);
    }
    const freshBatch = { batchId: batchSnap.id, ...batchSnap.data() };

    // (b) StudentPromotion concurrency guard
    if (!promotionSnap.exists()) {
      throw new Error(
        `StudentPromotion "${studentPromotion.promotionId}" not found. Aborting.`
      );
    }
    const freshStatus = promotionSnap.data().status;
    if (freshStatus !== PromotionStatus.DRAFT && freshStatus !== PromotionStatus.PENDING) {
      throw new Error(
        `StudentPromotion "${studentPromotion.promotionId}" has status ` +
        `"${freshStatus}" — expected "${PromotionStatus.DRAFT}" or ` +
        `"${PromotionStatus.PENDING}". ` +
        `The record may have already been processed concurrently.`
      );
    }

    // (c) Fee profile uniqueness guard (CLASS_PROMOTION only)
    if (profileSnap !== null && profileSnap.exists()) {
      throw new Error(
        `Fee profile "${profileRef.id}" already exists for student ` +
        `"${studentPromotion.studentId}" in academic year ` +
        `"${plan.newFeeProfile?.academicYear}". ` +
        `Aborting to prevent a duplicate profile.`
      );
    }

    // ── Phase 2: Writes ───────────────────────────────────────────────────────
    // All reads complete. No tx.get() after this point.
    const now = serverTimestamp();

    if (hasFailed) {
      _persistFailedPromotion(tx, promotionRef, plan, planSnapshot, persistedBy, now);
      _updateBatchCounters(tx, batchRef, freshBatch, "failed", persistedBy, now);
    } else if (isGraduation) {
      _persistGraduation(tx, promotionRef, plan, planSnapshot, persistedBy, now);
      _updateBatchCounters(tx, batchRef, freshBatch, "completed", persistedBy, now);
    } else {
      _createDraftFeeProfile(tx, profileRef, plan, now);
      _persistPromotion(tx, promotionRef, plan, profileRef.id, planSnapshot, persistedBy, now);
      _updateBatchCounters(tx, batchRef, freshBatch, "completed", persistedBy, now);
    }

    // Mirror the same counter arithmetic as _updateBatchCounters so callers
    // get an accurate batchStatus in the return value without a second read.
    resolvedProfileId   = profileRef?.id ?? null;
    resolvedBatchStatus = deriveBatchStatus(
      (freshBatch.completedStudents ?? 0) + (hasFailed ? 0 : 1),
      (freshBatch.failedStudents    ?? 0) + (hasFailed ? 1 : 0),
      (freshBatch.skippedStudents   ?? 0),
      (freshBatch.totalStudents     ?? 0),
    );
  });

  return { newFeeProfileId: resolvedProfileId, batchStatus: resolvedBatchStatus };
}
