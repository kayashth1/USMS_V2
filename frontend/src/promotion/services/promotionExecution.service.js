/**
 * PromotionExecutionService — Student Promotion module
 *
 * Orchestrates batch execution: loads data, runs the engine per student,
 * persists results via persistPromotionPlan, and reports progress.
 *
 * What this module does:
 *   - Pre-loads all data needed for execution (students, fee profiles,
 *     fee structures, destination academic year) before the loop starts
 *   - Executes promotions sequentially to enable live progress updates
 *   - Delegates computation to promotionEngine (pure)
 *   - Delegates Firestore writes to persistPromotionPlan (atomic transaction)
 *
 * What this module never does:
 *   - Modify the engine, persistence, validators, or Firestore schemas
 *   - Read live balances — all financial data comes from the stored snapshot
 *     inside each StudentPromotion (openingOutstanding, openingCredit, etc.)
 */

import {
  collection, doc, getDoc, getDocs, runTransaction, query, where,
  documentId, serverTimestamp, increment,
} from "firebase/firestore";
import { db } from "@/config/firebase.js";

import { PROMOTION_COLLECTIONS } from "../constants/collections.js";
import { PromotionType, PromotionStatus, BatchStatus } from "../constants/enums.js";
import {
  getBatch, getPromotionsByBatch,
  buildPromotionPlan, buildGraduationPlan,
  persistPromotionPlan, deriveBatchStatus,
} from "../index.js";
import {
  getProfile,
  getFixedFeeStructuresForClass,
  getVariableFeeStructuresOrdered,
  getAcademicYearsBySchool,
} from "@/fees-v2";

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Loads student documents by IDs in Firestore-safe chunks of 30.
 * Returns a map of { [studentId]: studentDoc }.
 */
async function _loadStudentMap(studentIds) {
  if (!studentIds.length) return {};

  const chunks = [];
  for (let i = 0; i < studentIds.length; i += 30) {
    chunks.push(studentIds.slice(i, i + 30));
  }

  const map = {};
  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(
        query(collection(db, "students"), where(documentId(), "in", chunk))
      );
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
    })
  );
  return map;
}

/**
 * Loads fee profiles for a list of StudentPromotion records.
 * Uses the stored oldFeeProfileId — never recomputes from live data.
 * Returns a map of { [promotionId]: feeProfile | null }.
 */
async function _loadFeeProfileMap(studentPromotions) {
  const map = {};
  await Promise.all(
    studentPromotions.map(async (sp) => {
      if (!sp.oldFeeProfileId) {
        map[sp.promotionId] = null;
        return;
      }
      try {
        map[sp.promotionId] = await getProfile(sp.oldFeeProfileId);
      } catch {
        map[sp.promotionId] = null;
      }
    })
  );
  return map;
}

// ─── resetForRetry ────────────────────────────────────────────────────────────

/**
 * Resets a FAILED StudentPromotion back to DRAFT so it can be retried.
 *
 * Runs as a Firestore transaction:
 *   - Resets StudentPromotion: status → DRAFT, clears result fields
 *   - Decrements failedStudents on the batch
 *   - Re-derives and writes BatchStatus
 *
 * Throws if the record is not currently FAILED.
 *
 * @param {string} promotionId
 * @param {string} batchId
 * @returns {Promise<void>}
 */
export async function resetForRetry(promotionId, batchId) {
  if (!promotionId) throw new Error("promotionId is required");
  if (!batchId)     throw new Error("batchId is required");

  const promotionRef = doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, promotionId);
  const batchRef     = doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES,  batchId);

  await runTransaction(db, async (tx) => {
    const [promotionSnap, batchSnap] = await Promise.all([
      tx.get(promotionRef),
      tx.get(batchRef),
    ]);

    if (!promotionSnap.exists()) {
      throw new Error(`StudentPromotion "${promotionId}" not found`);
    }
    if (!batchSnap.exists()) {
      throw new Error(`PromotionBatch "${batchId}" not found`);
    }

    const freshStatus = promotionSnap.data().status;
    if (freshStatus !== PromotionStatus.FAILED) {
      throw new Error(
        `Cannot reset StudentPromotion "${promotionId}" with status ` +
        `"${freshStatus}" — only FAILED records can be retried.`
      );
    }

    const freshBatch   = batchSnap.data();
    const newFailed    = Math.max(0, (freshBatch.failedStudents ?? 0) - 1);
    const newCompleted = freshBatch.completedStudents ?? 0;
    const newSkipped   = freshBatch.skippedStudents   ?? 0;
    const total        = freshBatch.totalStudents      ?? 0;
    const newStatus    = deriveBatchStatus(newCompleted, newFailed, newSkipped, total);

    tx.update(promotionRef, {
      status:          PromotionStatus.DRAFT,
      promotionResult: null,
      newFeeProfileId: null,
      errorMessage:    null,
      promotionPlan:   null,
      warnings:        [],
      completedBy:     null,
      completedAt:     null,
    });

    tx.update(batchRef, {
      failedStudents: newFailed,
      status:         newStatus,
    });
  });
}

// ─── executePromotion ─────────────────────────────────────────────────────────

/**
 * Runs the engine for a single StudentPromotion and persists the result.
 * Uses the stored financial snapshot — never reads live balances.
 *
 * @param {Object} batch              PromotionBatch document
 * @param {Object} studentPromotion   StudentPromotion document
 * @param {Object} context
 * @param {Object} context.studentMap         { [studentId]: studentDoc }
 * @param {Object} context.feeProfileMap      { [promotionId]: feeProfile | null }
 * @param {Array}  context.destFeeStructures  fee structures for destination class
 * @param {Object} context.destAcademicYear   AcademicYear object for toAcademicYear
 * @param {string} executedBy                 Admin UID
 * @returns {Promise<{ newFeeProfileId: string|null, batchStatus: string }>}
 */
export async function executePromotion(batch, studentPromotion, context, executedBy) {
  const { studentMap, feeProfileMap, destFeeStructures, destAcademicYear, destClassLabel = "" } = context;

  const isGraduation = batch.promotionType === PromotionType.GRADUATION;
  const student      = studentMap[studentPromotion.studentId] ?? null;
  const oldFeeProfile = feeProfileMap[studentPromotion.promotionId] ?? null;

  let plan;
  try {
    if (isGraduation) {
      plan = buildGraduationPlan(batch, studentPromotion);
    } else {
      plan = buildPromotionPlan(
        batch,
        studentPromotion,
        student,
        oldFeeProfile,
        destFeeStructures,
        destAcademicYear,
        destClassLabel,
      );
    }
  } catch (err) {
    plan = {
      errors:          [{ code: "ENGINE_ERROR", message: err.message ?? "Engine error" }],
      warnings:        [],
      promotionResult: null,
      newFeeProfile:   null,
    };
  }

  return persistPromotionPlan(batch, studentPromotion, plan, executedBy);
}

// ─── executeBatch ─────────────────────────────────────────────────────────────

/**
 * Executes all DRAFT and PENDING StudentPromotion records in a batch.
 *
 * Pre-loads all required data (students, fee profiles, destination fee
 * structures, destination academic year) before the sequential loop.
 *
 * Progress callback signature:
 *   onProgress({ completed, failed, skipped, total, current: StudentPromotion | null })
 *
 * @param {string} batchId
 * @param {string} executedBy
 * @param {Object} [options]
 * @param {Function} [options.onProgress]
 * @returns {Promise<{ completed: number, failed: number, skipped: number, total: number }>}
 */
export async function executeBatch(batchId, executedBy, { onProgress } = {}) {
  if (!batchId)    throw new Error("batchId is required");
  if (!executedBy) throw new Error("executedBy is required");

  // ── Load batch and all student promotions ─────────────────────────────────
  const batch      = await getBatch(batchId);
  if (!batch) throw new Error(`PromotionBatch "${batchId}" not found`);

  const allPromotions = await getPromotionsByBatch(batchId);
  const pending = allPromotions.filter(
    (sp) => sp.status === PromotionStatus.DRAFT || sp.status === PromotionStatus.PENDING
  );

  if (pending.length === 0) {
    return { completed: 0, failed: 0, skipped: 0, total: 0 };
  }

  // ── Pre-load reference data ───────────────────────────────────────────────
  const studentIds = [...new Set(pending.map((sp) => sp.studentId))];

  const [studentMap, feeProfileMap] = await Promise.all([
    _loadStudentMap(studentIds),
    _loadFeeProfileMap(pending),
  ]);

  // Destination fee structures (CLASS_PROMOTION only)
  let destFeeStructures = [];
  if (batch.promotionType === PromotionType.CLASS_PROMOTION && batch.toClassId) {
    const schoolId = batch.schoolId;
    const [fixed, variable] = await Promise.all([
      getFixedFeeStructuresForClass(schoolId, batch.toClassId),
      getVariableFeeStructuresOrdered(schoolId),
    ]);
    destFeeStructures = [...fixed, ...variable];
  }

  // Destination academic year
  let destAcademicYear = null;
  if (batch.promotionType === PromotionType.CLASS_PROMOTION) {
    const academicYears = await getAcademicYearsBySchool(batch.schoolId);
    destAcademicYear = academicYears.find((ay) => ay.year === batch.toAcademicYear) ?? null;
  }

  // Destination class label — needed so promoted fee profiles are structurally
  // identical to profiles created via createDraftProfile() (which requires classLabel).
  let destClassLabel = "";
  if (batch.promotionType === PromotionType.CLASS_PROMOTION && batch.toClassId) {
    try {
      const classSnap = await getDoc(doc(db, "classes", batch.toClassId));
      if (classSnap.exists()) {
        const cls = classSnap.data();
        destClassLabel = `Grade ${cls.grade} – ${cls.section}`;
      }
    } catch {
      // Non-critical: profile will still be created; classLabel will be empty string.
    }
  }

  const context = { studentMap, feeProfileMap, destFeeStructures, destAcademicYear, destClassLabel };

  // ── Sequential execution with progress reporting ──────────────────────────
  let completed = 0;
  let failed    = 0;
  let skipped   = 0;
  const total   = pending.length;

  onProgress?.({ completed, failed, skipped, total, current: null });

  for (const sp of pending) {
    onProgress?.({ completed, failed, skipped, total, current: sp });
    try {
      await executePromotion(batch, sp, context, executedBy);
      completed++;
    } catch {
      failed++;
    }
    onProgress?.({ completed, failed, skipped, total, current: null });
  }

  return { completed, failed, skipped, total };
}

// ─── retryFailed ─────────────────────────────────────────────────────────────

/**
 * Resets specified FAILED StudentPromotions to DRAFT, then executes them.
 * If no promotionIds are provided, retries ALL failed records in the batch.
 *
 * @param {string}   batchId
 * @param {string[]} [promotionIds]  IDs of FAILED StudentPromotions to retry
 * @param {string}   executedBy
 * @param {Object}   [options]
 * @param {Function} [options.onProgress]
 * @returns {Promise<{ completed: number, failed: number, skipped: number, total: number }>}
 */
export async function retryFailed(batchId, promotionIds, executedBy, { onProgress } = {}) {
  if (!batchId)    throw new Error("batchId is required");
  if (!executedBy) throw new Error("executedBy is required");

  // Determine which records to retry
  let targets = promotionIds;
  if (!targets || targets.length === 0) {
    const allPromotions = await getPromotionsByBatch(batchId);
    targets = allPromotions
      .filter((sp) => sp.status === PromotionStatus.FAILED)
      .map((sp) => sp.promotionId);
  }

  if (targets.length === 0) {
    return { completed: 0, failed: 0, skipped: 0, total: 0 };
  }

  // Reset all targets to DRAFT sequentially (transactions must not race)
  for (const promotionId of targets) {
    await resetForRetry(promotionId, batchId);
  }

  // Now execute the batch (picks up the newly-reset DRAFT records)
  return executeBatch(batchId, executedBy, { onProgress });
}
