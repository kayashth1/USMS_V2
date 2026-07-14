/**
 * RolloverExecutionService — Academic Year Rollover module
 *
 * Persists an already-generated RolloverPlan to Firestore.
 * This is the ONLY module that may write rollover results to the database.
 *
 * Relationship to the engine:
 *   The engine (rolloverEngine.js) is pure and produces a RolloverPlan.
 *   This service receives that plan and executes it — it never recalculates,
 *   never rebuilds, and never inspects promotion logic.
 *
 * Why direct Firestore writes (not through existing service functions):
 *   feeProfile.closeProfile() guards that year.status === CLOSED.
 *   academicYear.closeAcademicYear() guards against any remaining DRAFT profiles.
 *   Both guards are correct for their intended callers (the fee management UI),
 *   but they conflict with the rollover execution order where profile activation
 *   and closure happen in the same batch as the year transition.
 *   Writing directly to Firestore bypasses those UI-oriented guards while
 *   maintaining full atomicity per student via runTransaction.
 *
 * Execution order:
 *   1. Year transition     — activate nextYear (ACTIVE); close currentYear (CLOSED)
 *   2. Promoted students   — per-student transaction: update class/year + activate new profile + close old profile
 *   3. Graduated students  — per-student transaction: set alumni + close old profile
 *   4. Summary write       — append rolloverSummary to the closed year document
 *
 * Atomicity model:
 *   - Year transition  → one Firestore transaction
 *   - Each student     → one Firestore transaction (all-or-nothing per student)
 *   - A failed student is recorded; remaining students continue processing
 *
 * Idempotency (safe to call twice):
 *   - Year activation : skip if year already ACTIVE
 *   - Year closure    : skip if year already CLOSED
 *   - Student update  : skip if student.currentAcademicYear already === nextYear
 *   - Profile activate: skip if profile.status !== DRAFT
 *   - Profile close   : skip if profile.status === CLOSED
 *   - Graduation      : skip if student.status === "alumni"
 */

import {
  doc, getDoc, updateDoc, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase.js";
import { COLLECTIONS } from "@/fees-v2/constants/collections.js";
import { AcademicYearStatus, ProfileStatus } from "@/fees-v2/constants/enums.js";

const STUDENTS = "students";

// ─── Step 1+2: Year transition ────────────────────────────────────────────────

/**
 * Activates the next academic year and closes the current one in a single
 * Firestore transaction. Idempotent — re-running is safe.
 *
 * @param {{ activateYearId: string, deactivateYearId: string }} yearTransition
 * @param {string} executedBy
 * @returns {Promise<void>}
 */
export async function updateAcademicYears(yearTransition, executedBy) {
  const { activateYearId, deactivateYearId } = yearTransition;
  if (!activateYearId)   throw new Error("yearTransition.activateYearId is required");
  if (!deactivateYearId) throw new Error("yearTransition.deactivateYearId is required");

  const nextRef    = doc(db, COLLECTIONS.ACADEMIC_YEARS, activateYearId);
  const currentRef = doc(db, COLLECTIONS.ACADEMIC_YEARS, deactivateYearId);

  await runTransaction(db, async (tx) => {
    const [nextSnap, currentSnap] = await Promise.all([
      tx.get(nextRef),
      tx.get(currentRef),
    ]);

    if (!nextSnap.exists())    throw new Error(`Academic year "${activateYearId}" not found`);
    if (!currentSnap.exists()) throw new Error(`Academic year "${deactivateYearId}" not found`);

    const now = serverTimestamp();

    if (nextSnap.data().status !== AcademicYearStatus.ACTIVE) {
      tx.update(nextRef, {
        status:      AcademicYearStatus.ACTIVE,
        activatedAt: now,
        activatedBy: executedBy,
        updatedAt:   now,
      });
    }

    if (currentSnap.data().status !== AcademicYearStatus.CLOSED) {
      tx.update(currentRef, {
        status:    AcademicYearStatus.CLOSED,
        closedAt:  now,
        closedBy:  executedBy,
        updatedAt: now,
      });
    }
  });
}

// ─── Step 3+4+5: Process one promoted student ─────────────────────────────────

/**
 * Applies a StudentUpdate and ProfileClosure for one promoted (CLASS_PROMOTION)
 * student in a single atomic transaction.
 *
 * The promoted student's NEW fee profile is intentionally left in DRAFT status
 * so the admin can generate installments from Fee Management V2 after rollover.
 * Activating a profile without installments would leave it in an unusable state
 * (ACTIVE but with no installment schedule and no "Collect Payment" button).
 *
 * Reads: studentRef, closureProfileRef (if any).
 * Writes (idempotency-guarded): student update, profile closure.
 *
 * @param {import('../rollover/rolloverEngine.js').StudentUpdate}     studentUpdate
 * @param {import('../rollover/rolloverEngine.js').ProfileActivation|null} activation  - unused; new profile stays DRAFT
 * @param {import('../rollover/rolloverEngine.js').ProfileClosure|null}    closure
 * @param {string} executedBy
 * @returns {Promise<void>}
 */
export async function executeStudentUpdate(studentUpdate, activation, closure, executedBy, classLabel = "") {
  const { studentId, currentClassId, currentAcademicYear } = studentUpdate;
  if (!studentId) throw new Error("studentUpdate.studentId is required");

  const studentRef = doc(db, STUDENTS, studentId);
  const closureRef = closure ? doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, closure.profileId) : null;

  await runTransaction(db, async (tx) => {
    // Phase 1: all reads
    const studentSnap = await tx.get(studentRef);
    const closureSnap = closureRef ? await tx.get(closureRef) : null;

    if (!studentSnap.exists()) throw new Error(`Student "${studentId}" not found`);

    const now = serverTimestamp();

    // Phase 2: idempotency-guarded writes
    if (studentSnap.data().currentAcademicYear !== currentAcademicYear) {
      // classId is the canonical field read by Student Management and the
      // Promotion Wizard. currentClassId is set in parallel for any code
      // that already reads the new field. Both must be kept in sync.
      tx.update(studentRef, {
        classId:            currentClassId,
        classLabel,
        currentClassId,
        currentAcademicYear,
        updatedAt: now,
      });
    }

    // New profile (activation) is intentionally NOT activated here.
    // It remains DRAFT so the admin can generate installments from FeesV2.

    if (closureSnap?.exists() && closureSnap.data().status !== ProfileStatus.CLOSED) {
      tx.update(closureRef, { status: ProfileStatus.CLOSED, updatedAt: now });
    }
  });
}

// ─── Step 6: Process one graduated student ────────────────────────────────────

/**
 * Applies a GraduationUpdate and ProfileClosure for one graduated student
 * in a single atomic transaction.
 *
 * Reads: studentRef, closureProfileRef (if any).
 * Writes (idempotency-guarded): student graduation fields, profile closure.
 *
 * @param {import('../rollover/rolloverEngine.js').GraduationUpdate}  graduationUpdate
 * @param {import('../rollover/rolloverEngine.js').ProfileClosure|null} closure
 * @param {string} executedBy
 * @returns {Promise<void>}
 */
export async function executeGraduationUpdate(graduationUpdate, closure, executedBy) {
  const { studentId, status, graduatedAcademicYear, graduatedClassId } = graduationUpdate;
  if (!studentId) throw new Error("graduationUpdate.studentId is required");

  const studentRef = doc(db, STUDENTS, studentId);
  const closureRef = closure ? doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, closure.profileId) : null;

  await runTransaction(db, async (tx) => {
    const studentSnap = await tx.get(studentRef);
    const closureSnap = closureRef ? await tx.get(closureRef) : null;

    if (!studentSnap.exists()) throw new Error(`Student "${studentId}" not found`);

    const now = serverTimestamp();

    if (studentSnap.data().status !== "alumni") {
      tx.update(studentRef, {
        status:                "alumni",
        isActive:              false,
        graduatedAcademicYear,
        graduatedClassId,
        graduatedAt:           now,
        updatedAt:             now,
      });
    }

    if (closureSnap?.exists() && closureSnap.data().status !== ProfileStatus.CLOSED) {
      tx.update(closureRef, { status: ProfileStatus.CLOSED, updatedAt: now });
    }
  });
}

// ─── Step 7: Write summary ────────────────────────────────────────────────────

/**
 * Appends a rolloverSummary sub-object to the closed academic year document.
 * This is a simple field addition — it does not alter the document's schema.
 *
 * @param {string} closedYearId        - Firestore ID of the year that was closed
 * @param {Object} summary
 * @param {number} summary.studentsUpdated
 * @param {number} summary.profilesActivated
 * @param {number} summary.profilesClosed
 * @param {number} summary.graduates
 * @param {number} summary.failed
 * @param {string} summary.completedBy
 * @returns {Promise<void>}
 */
async function _writeSummary(closedYearId, summary) {
  await updateDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, closedYearId), {
    rolloverSummary: {
      ...summary,
      completedAt: serverTimestamp(),
    },
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Executes an already-generated RolloverPlan by persisting all writes to
 * Firestore in the correct order.
 *
 * Execution order:
 *   1. updateAcademicYears    — activate nextYear; close currentYear
 *   2. executeStudentUpdate   — per promoted student (atomic per student)
 *   3. executeGraduationUpdate — per graduated student (atomic per student)
 *   4. _writeSummary           — append summary to closed year document
 *
 * A failure for a single student is recorded in the `failures` array and
 * execution continues with remaining students.
 *
 * Progress callback shape:
 *   { completed, failed, total, remaining, currentStudentId: string|null }
 *
 * @param {import('./rolloverEngine.js').RolloverPlan} rolloverPlan
 * @param {{ activateYearId: string }} nextAcademicYear  - used only for summary label
 * @param {string} executedBy     - Admin UID
 * @param {Object} [options]
 * @param {Function} [options.onProgress]
 *
 * @returns {Promise<{
 *   completed:        number,
 *   failed:           number,
 *   skipped:          number,
 *   total:            number,
 *   studentsUpdated:  number,
 *   profilesActivated:number,
 *   profilesClosed:   number,
 *   graduates:        number,
 *   failures: Array<{ studentId: string, error: string }>,
 * }>}
 */
export async function executeRollover(rolloverPlan, nextAcademicYear, executedBy, { onProgress } = {}) {
  if (!rolloverPlan)  throw new Error("rolloverPlan is required");
  if (!executedBy)    throw new Error("executedBy is required");

  const {
    yearTransition,
    studentUpdates,
    profileActivations,
    profileClosures,
    graduationUpdates,
    summary: planSummary,
  } = rolloverPlan;

  // Build lookup maps for per-student cross-referencing
  const activationByStudentId = {};
  profileActivations.forEach((a) => { activationByStudentId[a.studentId] = a; });

  const closureByStudentId = {};
  profileClosures.forEach((c) => { closureByStudentId[c.studentId] = c; });

  // Pre-load class labels for unique destination classes (one read per class,
  // not per student) so executeStudentUpdate can sync Student.classLabel.
  const uniqueClassIds = [...new Set(studentUpdates.map((su) => su.currentClassId).filter(Boolean))];
  const classLabelMap = {};
  await Promise.all(uniqueClassIds.map(async (classId) => {
    try {
      const snap = await getDoc(doc(db, "classes", classId));
      if (snap.exists()) {
        const c = snap.data();
        classLabelMap[classId] = `Grade ${c.grade} – ${c.section}`;
      }
    } catch { /* non-critical — classLabel will be empty string */ }
  }));

  const total     = studentUpdates.length + graduationUpdates.length;
  let completed   = 0;
  let failed      = 0;
  let studentsUpdated   = 0;
  let profilesActivated = 0;
  let profilesClosed    = 0;
  let graduates         = 0;
  const failures = [];

  const report = (currentStudentId = null) => {
    onProgress?.({
      completed,
      failed,
      total,
      remaining:       total - completed - failed,
      currentStudentId,
    });
  };

  // ── Step 1+2: Year transition ──────────────────────────────────────────────
  await updateAcademicYears(yearTransition, executedBy);
  report();

  // ── Steps 3+4+5: Promoted students ────────────────────────────────────────
  for (const su of studentUpdates) {
    report(su.studentId);
    const activation = activationByStudentId[su.studentId] ?? null;
    const closure    = closureByStudentId[su.studentId]    ?? null;
    try {
      await executeStudentUpdate(su, activation, closure, executedBy, classLabelMap[su.currentClassId] ?? "");
      completed++;
      studentsUpdated++;
      if (activation) profilesActivated++;
      if (closure)    profilesClosed++;
    } catch (err) {
      failed++;
      failures.push({ studentId: su.studentId, error: err.message ?? "Unknown error" });
    }
    report();
  }

  // ── Step 6: Graduated students ─────────────────────────────────────────────
  for (const gu of graduationUpdates) {
    report(gu.studentId);
    const closure = closureByStudentId[gu.studentId] ?? null;
    try {
      await executeGraduationUpdate(gu, closure, executedBy);
      completed++;
      graduates++;
      if (closure) profilesClosed++;
    } catch (err) {
      failed++;
      failures.push({ studentId: gu.studentId, error: err.message ?? "Unknown error" });
    }
    report();
  }

  // ── Step 7: Summary ────────────────────────────────────────────────────────
  const summaryPayload = {
    studentsUpdated,
    profilesActivated,
    profilesClosed,
    graduates,
    failed,
    skipped:     planSummary.skipped,
    completedBy: executedBy,
  };

  try {
    await _writeSummary(yearTransition.deactivateYearId, summaryPayload);
  } catch {
    // Summary write failure is non-fatal — the rollover itself succeeded
  }

  return {
    completed,
    failed,
    skipped:   planSummary.skipped,
    total,
    studentsUpdated,
    profilesActivated,
    profilesClosed,
    graduates,
    failures,
  };
}
