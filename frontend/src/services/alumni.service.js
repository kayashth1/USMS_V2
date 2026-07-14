/**
 * Alumni Service — READ-ONLY
 *
 * Queries students who have graduated under either the legacy graduation
 * system (isGraduated: true) or the new Rollover system (status: "alumni").
 * Records are normalised into a consistent shape before being returned.
 *
 * No writes are performed anywhere in this service.
 */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "@/fees-v2/constants/collections.js";
import { PaymentStatus } from "@/fees-v2/constants/enums.js";

const STUDENTS = "students";

// ─── Normalise ────────────────────────────────────────────────────────────────

/**
 * Normalises a raw student document into a consistent Alumni shape that
 * works for both the legacy (isGraduated) and new (status:"alumni") systems.
 */
function _normalise(raw) {
  return {
    id:    raw.id,

    // Identity
    name:          raw.name         ?? raw.fullName ?? "—",
    admissionId:   raw.admissionId  ?? raw.admissionNumber ?? "—",
    rollNo:        raw.rollNo       ?? raw.roll ?? "—",
    gender:        raw.gender       ?? null,
    photo:         raw.photo        ?? raw.photoURL ?? null,

    // Contact
    phone:         raw.phone        ?? raw.contact ?? "—",
    email:         raw.email        ?? "—",
    address:       raw.address      ?? null,
    parentName:    raw.parentName   ?? raw.fatherName ?? "—",
    parentPhone:   raw.parentPhone  ?? raw.parentContact ?? null,

    // Academic — new system takes priority
    admissionDate:          raw.admissionDate   ?? null,
    graduatedAt:            raw.graduatedAt     ?? null,
    graduatedClassId:       raw.graduatedClassId     ?? raw.finalClassId    ?? null,
    graduatedClassLabel:    raw.graduatedClassLabel  ?? raw.finalClassLabel ?? "—",
    graduatedAcademicYear:  raw.graduatedAcademicYear ?? raw.academicYear   ?? "—",

    // Promotion history (legacy array on student doc)
    promotionHistory: Array.isArray(raw.promotionHistory) ? raw.promotionHistory : [],

    // Metadata
    schoolId: raw.schoolId,
  };
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

function _mergeResults(...arrays) {
  const seen = new Set();
  return arrays.flat().filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

// ─── 1. getAlumni ─────────────────────────────────────────────────────────────

/**
 * Returns all alumni for a school, sorted newest graduation year first.
 * Queries both legacy (isGraduated) and new (status:"alumni") records.
 *
 * @param {string} schoolId
 * @returns {Promise<Array>}
 */
export async function getAlumni(schoolId) {
  if (!schoolId) return [];

  const [legacySnap, newSnap] = await Promise.all([
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId",    "==", schoolId),
      where("isGraduated", "==", true),
    )),
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId", "==", schoolId),
      where("status",   "==", "alumni"),
    )),
  ]);

  const legacy = legacySnap.docs.map((d) => _normalise({ id: d.id, ...d.data() }));
  const neo    = newSnap.docs.map((d)    => _normalise({ id: d.id, ...d.data() }));

  return _mergeResults(legacy, neo).sort(
    (a, b) => (b.graduatedAcademicYear ?? "").localeCompare(a.graduatedAcademicYear ?? "")
  );
}

// Keep the legacy export so any existing callers don't break.
export const getAlumniBySchool = getAlumni;

// ─── 2. getAlumniByYear ───────────────────────────────────────────────────────

/**
 * Returns alumni who graduated in a specific academic year string (e.g. "2024-25").
 *
 * @param {string} schoolId
 * @param {string} year  - "YYYY-YY"
 * @returns {Promise<Array>}
 */
export async function getAlumniByYear(schoolId, year) {
  if (!schoolId || !year) return [];

  const [legacySnap, newSnap] = await Promise.all([
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId",    "==", schoolId),
      where("isGraduated", "==", true),
      where("academicYear","==", year),
    )),
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId",              "==", schoolId),
      where("status",                "==", "alumni"),
      where("graduatedAcademicYear", "==", year),
    )),
  ]);

  const legacy = legacySnap.docs.map((d) => _normalise({ id: d.id, ...d.data() }));
  const neo    = newSnap.docs.map((d)    => _normalise({ id: d.id, ...d.data() }));
  return _mergeResults(legacy, neo);
}

// ─── 3. getAlumniByClass ──────────────────────────────────────────────────────

/**
 * Returns alumni who graduated from a specific class.
 *
 * @param {string} schoolId
 * @param {string} classId
 * @returns {Promise<Array>}
 */
export async function getAlumniByClass(schoolId, classId) {
  if (!schoolId || !classId) return [];

  const [legacySnap, newSnap] = await Promise.all([
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId",    "==", schoolId),
      where("isGraduated", "==", true),
      where("finalClassId","==", classId),
    )),
    getDocs(query(
      collection(db, STUDENTS),
      where("schoolId",         "==", schoolId),
      where("status",           "==", "alumni"),
      where("graduatedClassId", "==", classId),
    )),
  ]);

  const legacy = legacySnap.docs.map((d) => _normalise({ id: d.id, ...d.data() }));
  const neo    = newSnap.docs.map((d)    => _normalise({ id: d.id, ...d.data() }));
  return _mergeResults(legacy, neo);
}

// ─── 4. searchAlumni ─────────────────────────────────────────────────────────

/**
 * Client-side search over a pre-loaded alumni list.
 * Matches against name, admissionId, and phone.
 *
 * @param {Array}  alumniList   - result of getAlumni()
 * @param {string} searchQuery
 * @returns {Array}
 */
export function searchAlumni(alumniList, searchQuery) {
  if (!searchQuery?.trim()) return alumniList;
  const q = searchQuery.toLowerCase().trim();
  return alumniList.filter((a) =>
    a.name?.toLowerCase().includes(q) ||
    a.admissionId?.toLowerCase().includes(q) ||
    a.phone?.toLowerCase().includes(q)
  );
}

// ─── 5. getAlumniProfile ─────────────────────────────────────────────────────

/**
 * Returns the full profile for one alumni student, including all fee profiles,
 * payments for the graduation year, and promotion history.
 *
 * @param {string} studentId
 * @returns {Promise<{
 *   student:      Object,
 *   feeProfiles:  Object[],
 *   payments:     Object[],
 * }>}
 */
export async function getAlumniProfile(studentId) {
  if (!studentId) throw new Error("studentId is required");

  // Load student doc
  const studentSnap = await getDoc(doc(db, STUDENTS, studentId));
  if (!studentSnap.exists()) throw new Error("Student not found");

  const raw     = { id: studentSnap.id, ...studentSnap.data() };
  const student = _normalise(raw);

  // Load all fee profiles for this student (across all years)
  const profilesSnap = await getDocs(query(
    collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
    where("studentId", "==", studentId),
  ));
  const feeProfiles = profilesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.academicYear ?? "").localeCompare(a.academicYear ?? ""));

  // Load payments for the graduation year (if known)
  let payments = [];
  const gradYear = student.graduatedAcademicYear;
  if (gradYear && gradYear !== "—") {
    try {
      const paymentsSnap = await getDocs(query(
        collection(db, COLLECTIONS.FEE_PAYMENTS),
        where("studentId",    "==", studentId),
        where("academicYear", "==", gradYear),
        where("status",       "==", PaymentStatus.CONFIRMED),
        orderBy("paymentDate", "desc"),
      ));
      payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      payments = [];
    }
  }

  return { student, feeProfiles, payments };
}
