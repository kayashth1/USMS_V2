/**
 * FeeStructureService (V2 extension) — Fee Management V2
 *
 * Operates on the existing feeStructures collection shared with the old fee module.
 * This service adds V2-specific methods (allocationPriority, isActive soft-delete,
 * ordered queries) while leaving the old fees.service.js and its functions untouched.
 *
 * The old functions (getFixedFeeStructures, addFeeStructure, etc.) continue to work
 * exactly as before because they target the same Firestore collection.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import { FeeStructureType } from "../constants/enums.js";

const col = () => collection(db, COLLECTIONS.FEE_STRUCTURES);

/**
 * Creates a new fee structure with the V2 allocationPriority field.
 * Safe to call alongside the old addFeeStructure() — writes to the same collection.
 *
 * @param {Object} params
 * @param {string} params.schoolId
 * @param {"fixed"|"variable"} params.type
 * @param {string|null} params.classId           - Required when type is "fixed"
 * @param {string|null} params.classLabel
 * @param {string} params.label
 * @param {number} params.amount                 - Per-cycle INR; ≥ 0
 * @param {boolean} [params.isOneTime]           - Default false
 * @param {boolean} [params.chargedDuringHolidays] - Default true
 * @param {number} [params.allocationPriority]   - Default 999
 * @returns {Promise<string>}                     Created document ID
 */
export async function createFeeStructure({
  schoolId, type, classId, classLabel, label,
  amount, isOneTime, chargedDuringHolidays, allocationPriority,
}) {
  if (!schoolId) throw new Error("schoolId is required");
  if (!label?.trim()) throw new Error("label is required");
  if (!["fixed", "variable"].includes(type)) throw new Error("type must be 'fixed' or 'variable'");
  if (type === "fixed" && !classId) throw new Error("classId is required for fixed fee structures");
  if (typeof amount !== "number" || amount < 0) throw new Error("amount must be a non-negative number");

  const ref = await addDoc(col(), {
    schoolId,
    type,
    classId:               type === "fixed" ? classId   : null,
    classLabel:            type === "fixed" ? classLabel : null,
    label:                 label.trim(),
    amount:                Number(amount),
    isOneTime:             isOneTime             ?? false,
    chargedDuringHolidays: chargedDuringHolidays ?? true,
    allocationPriority:    allocationPriority    ?? 999,
    isActive:              true,
    createdAt:             serverTimestamp(),
    updatedAt:             serverTimestamp(),
  });
  return ref.id;
}

export async function updateFeeStructure(id, updates) {
  if (!id) throw new Error("id is required");
  await updateDoc(doc(db, COLLECTIONS.FEE_STRUCTURES, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deactivateFeeStructure(id) {
  if (!id) throw new Error("id is required");
  await updateDoc(doc(db, COLLECTIONS.FEE_STRUCTURES, id), {
    isActive:  false,
    updatedAt: serverTimestamp(),
  });
}

export async function updateAllocationPriority(id, priority) {
  if (!id) throw new Error("id is required");
  await updateDoc(doc(db, COLLECTIONS.FEE_STRUCTURES, id), {
    allocationPriority: priority,
    updatedAt:          serverTimestamp(),
  });
}

export async function getFixedFeeStructuresForClass(schoolId, classId) {
  if (!schoolId || !classId) return [];
  const snap = await getDocs(query(
    col(),
    where("schoolId", "==", schoolId),
    where("classId",  "==", classId),
    where("type",     "==", FeeStructureType.FIXED),
    where("isActive", "==", true)
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.allocationPriority ?? 999) - (b.allocationPriority ?? 999));
}

export async function getVariableFeeStructuresOrdered(schoolId) {
  if (!schoolId) return [];
  const snap = await getDocs(query(
    col(),
    where("schoolId", "==", schoolId),
    where("type",     "==", FeeStructureType.VARIABLE),
    where("isActive", "==", true)
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.allocationPriority ?? 999) - (b.allocationPriority ?? 999));
}

export async function getAllFeeStructuresOrdered(schoolId) {
  if (!schoolId) return [];
  const snap = await getDocs(query(
    col(),
    where("schoolId", "==", schoolId),
    where("isActive", "==", true)
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.allocationPriority ?? 999) - (b.allocationPriority ?? 999));
}

export async function getFeeStructureById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.FEE_STRUCTURES, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
