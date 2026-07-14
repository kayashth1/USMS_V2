/**
 * StudentPromotionService — Student Promotion module
 *
 * Manages the studentPromotions collection.
 *
 * One StudentPromotion document is created per student when a PromotionBatch
 * is drafted. Records transition through status during batch execution:
 *
 *   createPromotion()   → status: "draft"   (created inside a batch)
 *   completePromotion() → status: "completed"
 *   failPromotion()     → status: "failed"
 *   skipPromotion()     → status: "skipped"
 *
 * Terminal status transitions also increment the corresponding counter on the
 * parent PromotionBatch document (completedStudents / failedStudents / skippedStudents).
 *
 * Student documents, Academic Year documents, and Fee Profiles are NOT modified
 * by this service — those changes are the responsibility of the execution layer.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, increment,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { PROMOTION_COLLECTIONS } from "../constants/collections.js";
import { PromotionStatus, PromotionType } from "../constants/enums.js";
import { validateStudentPromotion } from "../validation/studentPromotion.validate.js";

const col     = () => collection(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS);
const batchRef = (id) => doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES, id);

function _assertId(id) {
  if (!id || typeof id !== "string") throw new Error("id is required");
}

function _toPromotion(snap) {
  return { promotionId: snap.id, ...snap.data() };
}

/**
 * Creates a StudentPromotion record with status DRAFT inside a given batch.
 *
 * @param {Object} params
 * @param {string}   params.batchId
 * @param {string}   params.schoolId
 * @param {string}   params.studentId
 * @param {string}   params.fromAcademicYear  - "YYYY-YY"
 * @param {string}   params.toAcademicYear    - "YYYY-YY"
 * @param {string}   params.fromClassId
 * @param {string}   [params.toClassId]
 * @param {string}   params.promotionType
 * @param {number}   [params.openingOutstanding]    - default 0
 * @param {number}   [params.openingCredit]         - default 0
 * @param {string[]} [params.carriedVariableFeeIds] - default []
 * @param {string|null} [params.oldFeeProfileId]   - default null
 * @param {string}   params.requestedBy
 * @returns {Promise<string>}  Created StudentPromotion document ID
 */
export async function createPromotion({
  batchId, schoolId, studentId,
  fromAcademicYear, toAcademicYear,
  fromClassId, toClassId, promotionType,
  openingOutstanding, openingCredit,
  carriedVariableFeeIds,
  oldFeeProfileId,
  requestedBy,
}) {
  if (!batchId)    throw new Error("batchId is required");
  if (!schoolId)   throw new Error("schoolId is required");
  if (!studentId)  throw new Error("studentId is required");
  if (!requestedBy) throw new Error("requestedBy is required");

  const now = serverTimestamp();

  const ref = await addDoc(col(), {
    batchId,
    schoolId,
    studentId,
    fromAcademicYear,
    toAcademicYear,
    fromClassId,
    toClassId:              toClassId              ?? null,
    promotionType,
    status:                 PromotionStatus.DRAFT,
    promotionResult:        null,
    openingOutstanding:     openingOutstanding     ?? 0,
    openingCredit:          openingCredit          ?? 0,
    carriedVariableFeeIds:  carriedVariableFeeIds  ?? [],
    oldFeeProfileId:        oldFeeProfileId        ?? null,
    newFeeProfileId:        null,
    errorMessage:           null,
    requestedBy,
    requestedAt:            now,
    completedBy:            null,
    completedAt:            null,
  });

  return ref.id;
}

/**
 * Marks a StudentPromotion as COMPLETED.
 * Increments completedStudents on the parent PromotionBatch.
 *
 * @param {string}      promotionId
 * @param {Object}      result
 * @param {string}      result.completedBy
 * @param {string|null} [result.newFeeProfileId]
 * @returns {Promise<void>}
 */
export async function completePromotion(promotionId, { completedBy, newFeeProfileId }) {
  _assertId(promotionId);
  if (!completedBy) throw new Error("completedBy is required");

  const ref  = doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, promotionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("StudentPromotion not found");

  const { batchId } = snap.data();
  const now = serverTimestamp();

  await updateDoc(ref, {
    status:         PromotionStatus.COMPLETED,
    completedBy,
    completedAt:    now,
    newFeeProfileId: newFeeProfileId ?? null,
  });

  await updateDoc(batchRef(batchId), {
    completedStudents: increment(1),
  });
}

/**
 * Marks a StudentPromotion as FAILED.
 * Increments failedStudents on the parent PromotionBatch.
 *
 * @param {string} promotionId
 * @param {string} errorMessage
 * @param {string} failedBy
 * @returns {Promise<void>}
 */
export async function failPromotion(promotionId, errorMessage, failedBy) {
  _assertId(promotionId);
  if (!failedBy) throw new Error("failedBy is required");

  const ref  = doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, promotionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("StudentPromotion not found");

  const { batchId } = snap.data();
  const now = serverTimestamp();

  await updateDoc(ref, {
    status:       PromotionStatus.FAILED,
    errorMessage: errorMessage ?? "Unknown error",
    completedBy:  failedBy,
    completedAt:  now,
  });

  await updateDoc(batchRef(batchId), {
    failedStudents: increment(1),
  });
}

/**
 * Marks a StudentPromotion as SKIPPED.
 * Increments skippedStudents on the parent PromotionBatch.
 *
 * @param {string} promotionId
 * @param {string} skippedBy
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function skipPromotion(promotionId, skippedBy, reason) {
  _assertId(promotionId);
  if (!skippedBy) throw new Error("skippedBy is required");

  const ref  = doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, promotionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("StudentPromotion not found");

  const { batchId } = snap.data();
  const now = serverTimestamp();

  await updateDoc(ref, {
    status:       PromotionStatus.SKIPPED,
    errorMessage: reason ?? null,
    completedBy:  skippedBy,
    completedAt:  now,
  });

  await updateDoc(batchRef(batchId), {
    skippedStudents: increment(1),
  });
}

/**
 * Returns a single StudentPromotion by its document ID.
 *
 * @param {string} promotionId
 * @returns {Promise<import('../types.js').StudentPromotion|null>}
 */
export async function getPromotion(promotionId) {
  _assertId(promotionId);
  const snap = await getDoc(doc(db, PROMOTION_COLLECTIONS.STUDENT_PROMOTIONS, promotionId));
  return snap.exists() ? _toPromotion(snap) : null;
}

/**
 * Returns all StudentPromotion records for a given batch, sorted by studentId.
 *
 * @param {string} batchId
 * @returns {Promise<import('../types.js').StudentPromotion[]>}
 */
export async function getPromotionsByBatch(batchId) {
  _assertId(batchId);

  const snap = await getDocs(
    query(col(), where("batchId", "==", batchId))
  );

  return snap.docs
    .map(_toPromotion)
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
}
