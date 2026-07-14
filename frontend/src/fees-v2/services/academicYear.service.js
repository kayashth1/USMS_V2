/**
 * AcademicYearService — Fee Management V2
 *
 * Manages the academicYears collection. Each document is one financial year
 * for one school. Exactly one year per school may be ACTIVE at a time.
 *
 * Status lifecycle:
 *   INACTIVE → activateAcademicYear() → ACTIVE
 *   ACTIVE   → (another year activated) → INACTIVE
 *   INACTIVE → activateAcademicYear() → ACTIVE  (re-activation is allowed)
 *   ACTIVE/INACTIVE → closeAcademicYear() → CLOSED  (with pre-flight validation)
 *
 * Returned shape for operations that can fail for business reasons:
 *   { success: true }
 *   { success: false, errors: string[] }
 */

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import { AcademicYearStatus, ProfileStatus, RevisionStatus } from "../constants/enums.js";
import { validateAcademicYear } from "../validation/academicYear.validate.js";

// ─── Private helpers ──────────────────────────────────────────────────────────

const col = () => collection(db, COLLECTIONS.ACADEMIC_YEARS);

function _assertId(id) {
  if (!id || typeof id !== "string") throw new Error("id is required");
}

function _assertSchoolId(schoolId) {
  if (!schoolId || typeof schoolId !== "string") throw new Error("schoolId is required");
}

function _toAcademicYear(snap) {
  return { id: snap.id, ...snap.data() };
}

/**
 * Builds a validation Error that also carries the full errors array as a
 * property so callers can surface all messages, not just the first.
 *
 * @param {string[]} errors
 * @returns {Error}
 */
function _validationError(errors) {
  const err = new Error(errors[0]);
  err.validationErrors = errors;
  return err;
}

// ─── 1. Create Academic Year ──────────────────────────────────────────────────

/**
 * Creates a new academic year in INACTIVE status.
 * An inactive year has no effect on billing until explicitly activated.
 *
 * Validation:
 *   - schoolId required
 *   - year required, format YYYY-YY, suffix consistent (2026-27 not 2026-28)
 *   - startDate required, must be before endDate
 *   - year must be unique per school
 *
 * @param {Object} params
 * @param {string} params.schoolId
 * @param {string} params.year        - "YYYY-YY", e.g. "2026-27"
 * @param {import('firebase/firestore').Timestamp|Date} params.startDate
 * @param {import('firebase/firestore').Timestamp|Date} params.endDate
 * @param {string} [params.createdBy] - Admin UID
 * @returns {Promise<string>}           Created document ID
 * @throws {Error} with .validationErrors[] on validation failure
 * @throws {Error} if the year already exists for this school
 */
export async function createAcademicYear({ schoolId, year, startDate, endDate, createdBy }) {
  // Input validation
  const validation = validateAcademicYear({ schoolId, year, startDate, endDate });
  if (!validation.valid) throw _validationError(validation.errors);

  // Uniqueness check: schoolId + year — composite index: schoolId ASC, year ASC
  const duplicate = await getDocs(
    query(col(), where("schoolId", "==", schoolId), where("year", "==", year))
  );
  if (!duplicate.empty) {
    throw new Error(`Academic year "${year}" already exists for this school`);
  }

  const now = serverTimestamp();
  const ref = await addDoc(col(), {
    schoolId,
    year,
    startDate,
    endDate,
    status:      AcademicYearStatus.INACTIVE,
    activatedAt: null,
    activatedBy: null,
    closedAt:    null,
    closedBy:    null,
    createdAt:   now,
    updatedAt:   now,
    ...(createdBy ? { createdBy } : {}),
  });

  return ref.id;
}

// ─── 2. Get Active Academic Year ──────────────────────────────────────────────

/**
 * Returns the single ACTIVE academic year for a school, or null.
 * Composite index required: schoolId ASC, status ASC.
 *
 * @param {string} schoolId
 * @returns {Promise<import('../types.js').AcademicYear|null>}
 */
export async function getActiveAcademicYear(schoolId) {
  _assertSchoolId(schoolId);

  const snap = await getDocs(
    query(
      col(),
      where("schoolId", "==", schoolId),
      where("status",   "==", AcademicYearStatus.ACTIVE),
      limit(1)
    )
  );

  return snap.empty ? null : _toAcademicYear(snap.docs[0]);
}

// ─── 3. Get All Academic Years ────────────────────────────────────────────────

/**
 * Returns all academic years for a school, newest first (by year string descending).
 * Composite index required: schoolId ASC, year DESC.
 *
 * @param {string} schoolId
 * @returns {Promise<import('../types.js').AcademicYear[]>}
 */
export async function getAcademicYearsBySchool(schoolId) {
  _assertSchoolId(schoolId);

  // orderBy removed — composite index not guaranteed in all deployments; sort client-side
  const snap = await getDocs(
    query(col(), where("schoolId", "==", schoolId))
  );

  return snap.docs
    .map(_toAcademicYear)
    .sort((a, b) => b.year.localeCompare(a.year));
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

/**
 * Returns an academic year by its document ID, or null if not found.
 *
 * @param {string} id
 * @returns {Promise<import('../types.js').AcademicYear|null>}
 */
export async function getAcademicYearById(id) {
  _assertId(id);
  const snap = await getDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, id));
  return snap.exists() ? _toAcademicYear(snap) : null;
}

// ─── 4. Activate Academic Year ────────────────────────────────────────────────

/**
 * Activates an academic year inside a Firestore transaction.
 *
 * Business rules:
 *   - The target year must be INACTIVE (not CLOSED).
 *   - If a different year is currently ACTIVE for the same school,
 *     it is automatically set to INACTIVE in the same transaction.
 *   - Only one year per school may be ACTIVE at a time.
 *   - Calling with an already-ACTIVE year is a no-op (idempotent).
 *
 * Implementation note (Web SDK constraint): The Firestore Web SDK
 * `Transaction.get()` only accepts a `DocumentReference`, not a `Query`.
 * Collection queries cannot be run inside a `runTransaction` callback in the
 * Web SDK (the Admin/Node.js SDK does support this). The current ACTIVE year
 * is therefore located via query *before* the transaction; its DocumentReference
 * is then re-read and updated atomically inside the transaction.
 *
 * @param {string} id           - Document ID of the year to activate
 * @param {string} [activatedBy] - Admin UID performing the activation
 * @returns {Promise<void>}
 * @throws {Error} if the year is not found or is CLOSED
 */
export async function activateAcademicYear(id, activatedBy) {
  _assertId(id);

  const targetRef = doc(db, COLLECTIONS.ACADEMIC_YEARS, id);

  // ── Pre-flight reads (outside transaction — Web SDK does not allow queries inside) ──

  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Academic year not found");

  const targetData = targetSnap.data();
  if (targetData.status === AcademicYearStatus.ACTIVE) return; // Already active — no-op
  if (targetData.status === AcademicYearStatus.CLOSED) {
    throw new Error("A closed academic year cannot be activated");
  }

  // Find the currently ACTIVE year for this school (if any)
  // Composite index: schoolId ASC, status ASC
  const activeSnap = await getDocs(
    query(
      col(),
      where("schoolId", "==", targetData.schoolId),
      where("status",   "==", AcademicYearStatus.ACTIVE),
      limit(1)
    )
  );
  const currentActiveRef = !activeSnap.empty ? doc(db, COLLECTIONS.ACADEMIC_YEARS, activeSnap.docs[0].id) : null;

  // ── Atomic transaction ───────────────────────────────────────────────────────
  // All reads must precede all writes inside runTransaction.

  await runTransaction(db, async (tx) => {
    // Re-read target to guard against concurrent changes
    const latestTarget = await tx.get(targetRef);
    if (!latestTarget.exists()) throw new Error("Academic year not found");
    if (latestTarget.data().status === AcademicYearStatus.CLOSED) {
      throw new Error("A closed academic year cannot be activated");
    }
    if (latestTarget.data().status === AcademicYearStatus.ACTIVE) return; // Concurrent activation — no-op

    // Re-read the current active year (may have changed since the pre-flight read)
    if (currentActiveRef && currentActiveRef.id !== id) {
      const latestActive = await tx.get(currentActiveRef);
      if (latestActive.exists() && latestActive.data().status === AcademicYearStatus.ACTIVE) {
        tx.update(currentActiveRef, {
          status:    AcademicYearStatus.INACTIVE,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Activate the target year
    tx.update(targetRef, {
      status:      AcademicYearStatus.ACTIVE,
      activatedAt: serverTimestamp(),
      activatedBy: activatedBy || null,
      updatedAt:   serverTimestamp(),
    });
  });
}

// ─── 5. Close Academic Year ───────────────────────────────────────────────────

/**
 * Formally closes an academic year after year-end procedures are complete.
 *
 * Pre-flight validation (returns structured errors — does NOT throw):
 *   1. No DRAFT student fee profiles may exist for this year.
 *   2. No pending fee revisions may exist for this year.
 *
 * Status rules:
 *   - ACTIVE or INACTIVE years may be closed.
 *   - CLOSED years are already terminal.
 *
 * @param {string} id        - Academic year document ID
 * @param {string} [closedBy] - Admin UID
 * @returns {Promise<{ success: true } | { success: false, errors: string[] }>}
 */
export async function closeAcademicYear(id, closedBy) {
  _assertId(id);

  const yearSnap = await getDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, id));
  if (!yearSnap.exists()) {
    return { success: false, errors: ["Academic year not found"] };
  }

  const yearData = yearSnap.data();

  if (yearData.status === AcademicYearStatus.CLOSED) {
    return { success: false, errors: ["This academic year is already closed"] };
  }

  // ── Business validation ────────────────────────────────────────────────────

  const errors = [];

  // Check 1: No DRAFT fee profiles — they have not yet had installments generated
  // Composite index required: academicYearId ASC, status ASC
  const draftProfilesSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("academicYearId", "==", id),
      where("status",         "==", ProfileStatus.DRAFT),
      limit(1)
    )
  );
  if (!draftProfilesSnap.empty) {
    errors.push(
      "One or more student fee profiles are still in draft state. " +
      "All profiles must be activated before closing the academic year."
    );
  }

  // Check 2: No pending fee revisions
  // Composite index required: academicYear ASC, revisionStatus ASC
  const pendingRevisionsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.FEE_REVISIONS),
      where("academicYear",   "==", yearData.year),
      where("revisionStatus", "==", RevisionStatus.PENDING),
      limit(1)
    )
  );
  if (!pendingRevisionsSnap.empty) {
    errors.push(
      "One or more fee revisions are pending review. " +
      "All revisions must be approved or rejected before closing the academic year."
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  await updateDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, id), {
    status:    AcademicYearStatus.CLOSED,
    closedAt:  serverTimestamp(),
    closedBy:  closedBy || null,
    updatedAt: serverTimestamp(),
  });

  return { success: true };
}

// ─── 6. Delete Academic Year ──────────────────────────────────────────────────

/**
 * Permanently deletes an inactive academic year that has never been activated.
 *
 * Rules:
 *   - Only INACTIVE years may be deleted. Active or closed years are rejected.
 *   - If any student fee profiles reference this year, deletion is rejected.
 *
 * @param {string} id          - Academic year document ID
 * @param {string} [deletedBy] - Admin UID (for logging; not stored — document is deleted)
 * @returns {Promise<void>}
 * @throws {Error} if the year is not INACTIVE, or has fee profiles
 */
export async function deleteAcademicYear(id, deletedBy) {
  _assertId(id);

  const yearRef  = doc(db, COLLECTIONS.ACADEMIC_YEARS, id);
  const yearSnap = await getDoc(yearRef);
  if (!yearSnap.exists()) throw new Error("Academic year not found");

  const yearData = yearSnap.data();

  if (yearData.status !== AcademicYearStatus.INACTIVE) {
    throw new Error(
      `Only inactive academic years can be deleted. ` +
      `This year has status "${yearData.status}". ` +
      (yearData.status === AcademicYearStatus.ACTIVE
        ? "Activate a different year first to deactivate this one, then delete it."
        : "A closed academic year cannot be deleted.")
    );
  }

  // Check for any student fee profiles referencing this year
  // Single-field index on academicYearId is sufficient
  const profilesSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("academicYearId", "==", id),
      limit(1)
    )
  );
  if (!profilesSnap.empty) {
    throw new Error(
      "Cannot delete academic year: student fee profiles exist for this year. " +
      "Remove all profiles before deleting."
    );
  }

  await deleteDoc(yearRef);
}

// ─── updateAcademicYear (stub — not in scope for this release) ────────────────

/**
 * Updates mutable fields of an INACTIVE academic year (startDate, endDate).
 * Status transitions use the dedicated activate/close/delete methods.
 *
 * @param {string} id
 * @param {{ startDate?: *, endDate?: * }} updates
 * @returns {Promise<void>}
 */
export async function updateAcademicYear(id, updates) {
  throw new Error("Not implemented: AcademicYearService.updateAcademicYear");
}
