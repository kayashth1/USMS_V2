/**
 * Academic Reports Service
 *
 * Read-only queries for all four academic report types.
 * No writes — never touches existing collections.
 *
 * Required composite indexes (create in Firebase Console if missing):
 *   promotionBatches:  schoolId ASC, fromAcademicYear ASC
 *   studentPromotions: schoolId ASC, fromAcademicYear ASC
 *   studentFeeProfiles: schoolId ASC, academicYear ASC  (likely exists from financial reports)
 */

import {
  collection, doc, getDoc, getDocs, query, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "@/fees-v2/constants/collections.js";
import { PROMOTION_COLLECTIONS } from "@/promotion";
import { getAlumni } from "@/services/alumni.service";

const { PROMOTION_BATCHES, STUDENT_PROMOTIONS } = PROMOTION_COLLECTIONS;

// ── Internal helpers ──────────────────────────────────────────────────────────

function _toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
}

function _studentName(s) {
  if (!s) return "—";
  const full = s.fullName ?? s.name ?? "";
  if (full.trim()) return full.trim();
  return [s.firstName, s.lastName].filter(Boolean).join(" ") || "—";
}

function _admissionId(s) {
  return s?.admissionId ?? s?.admissionNo ?? s?.enrollmentId ?? "—";
}

async function _fetchStudentMap(studentIds) {
  const unique = [...new Set(studentIds.filter(Boolean))];
  if (!unique.length) return {};
  const snaps = await Promise.all(unique.map(id => getDoc(doc(db, "students", id))));
  const map = {};
  snaps.forEach(s => { if (s.exists()) map[s.id] = { id: s.id, ...s.data() }; });
  return map;
}

// Firestore `in` supports max 30 items; chunk larger arrays.
function _chunk(arr, size = 30) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── 1. Promotion Report ───────────────────────────────────────────────────────

/**
 * Returns promotion batches for a school, optionally filtered, with each batch
 * containing its full student list.
 *
 * @param {string} schoolId
 * @param {{ academicYear?: string, batchStatus?: string, promotionType?: string }} filters
 * @returns {Promise<Object[]>} Batches sorted newest first, each with .students[]
 */
export async function getPromotionReport(schoolId, filters = {}) {
  const { academicYear, batchStatus, promotionType } = filters;

  // 1. Fetch matching batches
  const batchConstraints = [where("schoolId", "==", schoolId)];
  if (academicYear)  batchConstraints.push(where("fromAcademicYear", "==", academicYear));
  if (batchStatus)   batchConstraints.push(where("status",           "==", batchStatus));
  if (promotionType) batchConstraints.push(where("promotionType",    "==", promotionType));

  const batchSnap = await getDocs(query(collection(db, PROMOTION_BATCHES), ...batchConstraints));
  const batches   = batchSnap.docs.map(d => ({ batchId: d.id, ...d.data() }));

  if (!batches.length) return [];

  // 2. Fetch student promotions for all batches (chunked `in` queries)
  const batchIds  = batches.map(b => b.batchId);
  const chunks    = _chunk(batchIds);
  const promSnaps = await Promise.all(
    chunks.map(ids => getDocs(query(
      collection(db, STUDENT_PROMOTIONS),
      where("batchId", "in", ids),
    )))
  );

  const promotions    = promSnaps.flatMap(s => s.docs.map(d => ({ promotionId: d.id, ...d.data() })));
  const promsByBatch  = {};
  const allStudentIds = new Set();

  promotions.forEach(p => {
    (promsByBatch[p.batchId] ??= []).push(p);
    allStudentIds.add(p.studentId);
  });

  // 3. Fetch student names
  const studentMap = await _fetchStudentMap([...allStudentIds]);

  // 4. Build result
  return batches
    .sort((a, b) => (b.requestedAt?.toMillis?.() ?? 0) - (a.requestedAt?.toMillis?.() ?? 0))
    .map(batch => ({
      batchId:        batch.batchId,
      academicYear:   batch.fromAcademicYear   ?? "—",
      toAcademicYear: batch.toAcademicYear     ?? "—",
      fromClass:      batch.fromClassId         ?? "—",
      toClass:        batch.toClassId           ?? "—",
      promotionType:  batch.promotionType,
      status:         batch.status,
      promoted:       batch.completedStudents   ?? 0,
      failed:         batch.failedStudents      ?? 0,
      skipped:        batch.skippedStudents     ?? 0,
      total:          batch.totalStudents       ?? 0,
      requestedAt:    _toDate(batch.requestedAt),
      completedAt:    _toDate(batch.completedAt),
      requestedBy:    batch.requestedBy         ?? "—",
      students: (promsByBatch[batch.batchId] ?? []).map(sp => ({
        promotionId:     sp.promotionId,
        studentId:       sp.studentId,
        studentName:     _studentName(studentMap[sp.studentId]),
        admissionId:     _admissionId(studentMap[sp.studentId]),
        status:          sp.status,
        promotionResult: sp.promotionResult ?? null,
        completedAt:     _toDate(sp.completedAt),
        errorMessage:    sp.errorMessage ?? null,
      })),
    }));
}

// ── 2. Graduation Report ──────────────────────────────────────────────────────

/**
 * Returns all completed graduation records for a school/year.
 * "Outstanding at graduation" = openingOutstanding on the StudentPromotion record
 * (the balance computed and stored when the promotion was created).
 *
 * @param {string} schoolId
 * @param {string} academicYear  "YYYY-YY"
 * @returns {Promise<Object[]>}
 */
export async function getGraduationReport(schoolId, academicYear) {
  const snap = await getDocs(query(
    collection(db, STUDENT_PROMOTIONS),
    where("schoolId",          "==", schoolId),
    where("fromAcademicYear",  "==", academicYear),
  ));

  const promotions = snap.docs
    .map(d => ({ promotionId: d.id, ...d.data() }))
    .filter(p => p.promotionType === "graduation" && p.status === "completed");

  if (!promotions.length) return [];

  const studentMap = await _fetchStudentMap([...new Set(promotions.map(p => p.studentId))]);

  return promotions
    .sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0))
    .map(p => {
      const s = studentMap[p.studentId];
      return {
        promotionId:             p.promotionId,
        studentId:               p.studentId,
        studentName:             _studentName(s),
        admissionId:             _admissionId(s),
        academicYear:            p.fromAcademicYear,
        class:                   p.fromClassId ?? "—",
        graduationDate:          _toDate(p.completedAt),
        promotionResult:         p.promotionResult ?? "graduated",
        outstandingAtGraduation: p.openingOutstanding ?? 0,
      };
    });
}

// ── 3. Alumni Report ──────────────────────────────────────────────────────────

/**
 * Returns all alumni for a school.
 * Delegates to the existing alumni.service.js which handles both legacy
 * (isGraduated) and new (status:"alumni") records.
 *
 * Filtering by graduationYear / class / gender is done in the component
 * so the component can compute filter options from the full list.
 *
 * @param {string} schoolId
 * @returns {Promise<Object[]>}  Normalised alumni rows from alumni.service.js
 */
export async function getAlumniReport(schoolId) {
  return getAlumni(schoolId);
}

// ── 4. Class Strength Report ──────────────────────────────────────────────────

/**
 * Returns per-class student counts for a school/year.
 *
 * Counts:
 *   total     — profiles in that class for the year
 *   male/female — gender from current student doc
 *   active    — current student status is not "alumni" and isGraduated !== true
 *   alumni    — current student status is "alumni" or isGraduated === true
 *   promoted  — completed studentPromotion with promotionResult === "promoted"
 *   graduated — completed studentPromotion with promotionResult === "graduated"
 *
 * @param {string} schoolId
 * @param {string} academicYear
 * @returns {Promise<Object[]>}  One row per class, sorted by classLabel
 */
export async function getClassStrengthReport(schoolId, academicYear) {
  const [profileSnap, promotionSnap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
    )),
    getDocs(query(
      collection(db, STUDENT_PROMOTIONS),
      where("schoolId",         "==", schoolId),
      where("fromAcademicYear", "==", academicYear),
    )),
  ]);

  const profiles   = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const promotions = promotionSnap.docs
    .map(d => ({ promotionId: d.id, ...d.data() }))
    .filter(p => p.status === "completed");

  if (!profiles.length) return [];

  // Outcome map: studentId → promotionResult
  const outcomeByStudent = {};
  promotions.forEach(p => {
    if (p.promotionResult) outcomeByStudent[p.studentId] = p.promotionResult;
  });

  // Fetch student docs for gender + current status
  const studentIds = [...new Set(profiles.map(p => p.studentId))];
  const studentMap = await _fetchStudentMap(studentIds);

  // Group by class
  const classMap = {};
  profiles.forEach(profile => {
    const key = profile.classId ?? "_unknown_";
    if (!classMap[key]) {
      classMap[key] = {
        classId:    profile.classId    ?? "—",
        classLabel: profile.classLabel ?? profile.classId ?? "—",
        total:    0,
        male:     0,
        female:   0,
        active:   0,
        alumni:   0,
        promoted: 0,
        graduated:0,
      };
    }

    const cls     = classMap[key];
    const student = studentMap[profile.studentId];
    const outcome = outcomeByStudent[profile.studentId];

    cls.total++;

    const gender = (student?.gender ?? "").toLowerCase();
    if (gender === "male")   cls.male++;
    if (gender === "female") cls.female++;

    const isAlumni = student?.status === "alumni" || student?.isGraduated === true;
    if (isAlumni) cls.alumni++;
    else          cls.active++;

    if (outcome === "promoted")  cls.promoted++;
    if (outcome === "graduated") cls.graduated++;
  });

  return Object.values(classMap)
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true }));
}
