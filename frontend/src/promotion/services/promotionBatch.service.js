/**
 * PromotionBatchService — Student Promotion module
 *
 * Manages the promotionBatches collection.
 *
 * Batch lifecycle:
 *   createBatch()  → status: "draft"
 *   updateBatch()  → mutable while DRAFT
 *   (execution layer triggers RUNNING → COMPLETED / PARTIAL_SUCCESS / FAILED)
 *   cancelBatch()  → status: "cancelled"  (valid from DRAFT or RUNNING)
 *
 * Counter fields (totalStudents, completedStudents, failedStudents,
 * skippedStudents) are maintained by the StudentPromotion service as
 * individual records are processed — not by this service.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { PROMOTION_COLLECTIONS } from "../constants/collections.js";
import { BatchStatus, PromotionType } from "../constants/enums.js";
import { validatePromotionBatch } from "../validation/promotionBatch.validate.js";

const col = () => collection(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES);

function _assertId(id) {
  if (!id || typeof id !== "string") throw new Error("id is required");
}

function _toBatch(snap) {
  return { batchId: snap.id, ...snap.data() };
}

/**
 * Creates a new PromotionBatch with status DRAFT.
 *
 * @param {Object} params
 * @param {string} params.schoolId
 * @param {string} params.fromAcademicYear  - "YYYY-YY"
 * @param {string} params.toAcademicYear    - "YYYY-YY"
 * @param {string} params.fromClassId
 * @param {string} [params.toClassId]       - required unless GRADUATION
 * @param {string} params.promotionType
 * @param {boolean} [params.carryFeeBalance]   - default false
 * @param {boolean} [params.carryVariableFees] - default false
 * @param {string}  params.requestedBy
 * @param {string}  [params.remarks]
 * @param {number}  [params.totalStudents]  - set at creation when count is known
 * @returns {Promise<string>}  Created batch document ID
 */
export async function createBatch({
  schoolId, fromAcademicYear, toAcademicYear,
  fromClassId, toClassId, promotionType,
  carryFeeBalance, carryVariableFees,
  requestedBy, remarks, totalStudents,
}) {
  if (!schoolId)         throw new Error("schoolId is required");
  if (!fromAcademicYear) throw new Error("fromAcademicYear is required");
  if (!toAcademicYear)   throw new Error("toAcademicYear is required");
  if (!fromClassId)      throw new Error("fromClassId is required");
  if (!promotionType)    throw new Error("promotionType is required");
  if (!requestedBy)      throw new Error("requestedBy is required");
  if (promotionType === PromotionType.CLASS_PROMOTION && !toClassId) {
    throw new Error("toClassId is required for CLASS_PROMOTION");
  }

  const count = totalStudents ?? 0;
  const now = serverTimestamp();

  const ref = await addDoc(col(), {
    schoolId,
    fromAcademicYear,
    toAcademicYear,
    fromClassId,
    toClassId:         toClassId ?? null,
    promotionType,
    status:            BatchStatus.DRAFT,
    carryFeeBalance:   carryFeeBalance   ?? false,
    carryVariableFees: carryVariableFees ?? false,
    totalStudents:     count,
    completedStudents: 0,
    failedStudents:    0,
    skippedStudents:   0,
    requestedBy,
    requestedAt:  now,
    completedBy:  null,
    completedAt:  null,
    remarks:      remarks ?? null,
    promotionPlanSnapshot: {
      academicYear:         toAcademicYear,
      carryFeeBalance:      carryFeeBalance   ?? false,
      carryVariableFees:    carryVariableFees ?? false,
      selectedStudentCount: count,
    },
  });

  return ref.id;
}

/**
 * Updates mutable fields on a DRAFT batch.
 *
 * @param {string} batchId
 * @param {Object} updates  - flat field map; nested fields use dot-notation keys
 * @returns {Promise<void>}
 */
export async function updateBatch(batchId, updates) {
  _assertId(batchId);
  const ref  = doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES, batchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Batch not found");
  if (snap.data().status !== BatchStatus.DRAFT) {
    throw new Error("Only DRAFT batches can be updated");
  }
  await updateDoc(ref, updates);
}

/**
 * Returns a single PromotionBatch by its document ID.
 *
 * @param {string} batchId
 * @returns {Promise<import('../types.js').PromotionBatch|null>}
 */
export async function getBatch(batchId) {
  _assertId(batchId);
  const snap = await getDoc(doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES, batchId));
  return snap.exists() ? _toBatch(snap) : null;
}

/**
 * Returns all PromotionBatches for a school, sorted newest first.
 *
 * @param {string} schoolId
 * @param {Object} [filters]
 * @param {string} [filters.fromAcademicYear]
 * @param {string} [filters.status]
 * @returns {Promise<import('../types.js').PromotionBatch[]>}
 */
export async function getBatches(schoolId, filters = {}) {
  if (!schoolId) throw new Error("schoolId is required");

  let q = query(col(), where("schoolId", "==", schoolId));

  if (filters.fromAcademicYear) {
    q = query(q, where("fromAcademicYear", "==", filters.fromAcademicYear));
  }
  if (filters.status) {
    q = query(q, where("status", "==", filters.status));
  }

  const snap = await getDocs(q);

  return snap.docs
    .map(_toBatch)
    .sort((a, b) => {
      const ta = a.requestedAt?.toMillis?.() ?? 0;
      const tb = b.requestedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

/**
 * Cancels a batch that has not yet completed.
 * Valid from DRAFT or RUNNING status.
 *
 * @param {string} batchId
 * @param {string} cancelledBy
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function cancelBatch(batchId, cancelledBy, reason) {
  _assertId(batchId);
  if (!cancelledBy) throw new Error("cancelledBy is required");

  const ref  = doc(db, PROMOTION_COLLECTIONS.PROMOTION_BATCHES, batchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Batch not found");

  const { status } = snap.data();
  if (status !== BatchStatus.DRAFT && status !== BatchStatus.RUNNING) {
    throw new Error(`Cannot cancel a batch with status "${status}"`);
  }

  await updateDoc(ref, {
    status:      BatchStatus.CANCELLED,
    completedBy: cancelledBy,
    completedAt: serverTimestamp(),
    ...(reason ? { remarks: reason } : {}),
  });
}
