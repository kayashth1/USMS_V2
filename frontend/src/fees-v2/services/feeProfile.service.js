/**
 * StudentFeeProfileService — Fee Management V2
 *
 * Manages the studentFeeProfiles collection. One document per student per
 * academic year.
 *
 * Status lifecycle:
 *   DRAFT  → activateProfile()  → ACTIVE
 *   ACTIVE → closeProfile()     → CLOSED  (only when academic year is CLOSED)
 *
 * Changes to an ACTIVE profile must flow through FeeRevisionService.
 * Draft-phase edits use updateDraftProfile() directly.
 *
 * Document ID strategy: deterministic composite key "${studentId}_${academicYearId}".
 * Uniqueness is enforced atomically via a Firestore transaction (tx.get + tx.set),
 * eliminating the TOCTOU window of a query-then-create pattern.
 *
 * Fee items: createDraftProfile loads ALL active fixed fee structures for the
 * student's class. Variable fees are added later via updateDraftProfile().
 *
 * computedAmount: always derived server-side from the adjustment definition
 * (calculationType, value, maxAmount, scope, targetComponentIds). The caller's
 * supplied computedAmount is never used.
 *
 * grossAnnualFee in DRAFT does NOT account for holiday months; that correction
 * is applied by FeeInstallmentService when installments are generated.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import {
  AcademicYearStatus,
  ProfileStatus,
  AdjustmentCalculationType,
  AdjustmentScope,
} from "../constants/enums.js";
import {
  validateFeeProfile,
  validateFeeAdjustment,
} from "../validation/feeProfile.validate.js";

// ─── Private helpers ──────────────────────────────────────────────────────────

const col = () => collection(db, COLLECTIONS.STUDENT_FEE_PROFILES);

function _assertId(id, label = "id") {
  if (!id || typeof id !== "string") throw new Error(`${label} is required`);
}

function _toProfile(snap) {
  return { id: snap.id, ...snap.data() };
}

function _validationError(errors) {
  const err = new Error(errors[0]);
  err.validationErrors = errors;
  return err;
}

/** Deterministic profile document ID. */
function _profileId(studentId, academicYearId) {
  return `${studentId}_${academicYearId}`;
}

/**
 * Builds a FeeLineItem snapshot from a FeeStructure document.
 *
 * @param {{ id: string, label: string, amount: number, type: string,
 *           isOneTime?: boolean, chargedDuringHolidays?: boolean,
 *           allocationPriority?: number }} struct
 * @returns {import('../types.js').FeeLineItem}
 */
function _snapshotFeeStructure(struct) {
  return {
    feeStructureId:        struct.id,
    label:                 struct.label,
    amount:                struct.amount,
    type:                  struct.type,
    isOneTime:             struct.isOneTime             ?? false,
    chargedDuringHolidays: struct.chargedDuringHolidays ?? true,
    allocationPriority:    struct.allocationPriority    ?? 999,
  };
}

/**
 * Estimates the gross annual fee from line items and a payment schedule.
 *
 * One-time items are counted once (charged in installment 1 only).
 * Recurring items are multiplied by the period count.
 * Holiday-month exclusions are NOT applied here — they are applied during
 * installment generation by FeeInstallmentService.
 *
 * @param {import('../types.js').FeeLineItem[]} feeLineItems
 * @param {"monthly"|"quarterly"} schedule
 * @returns {number}
 */
function _computeGrossAnnualFee(feeLineItems, schedule) {
  const periods = schedule === "quarterly" ? 4 : 12;
  return feeLineItems.reduce((sum, item) => {
    return sum + (item.isOneTime ? item.amount : item.amount * periods);
  }, 0);
}

/**
 * Derives the annual INR reduction for one FeeAdjustment from its definition.
 * Never trusts a caller-supplied computedAmount.
 *
 * FIXED_AMOUNT  → computedAmount = value
 * PERCENTAGE on total_fee         → round(grossAnnualFee × value / 100)
 * PERCENTAGE on specific_components → round(annualisedComponentBase × value / 100)
 * maxAmount cap applied to percentage results when set.
 * Result is always ≥ 0.
 *
 * @param {import('../types.js').FeeAdjustment} adj
 * @param {import('../types.js').FeeLineItem[]} feeLineItems
 * @param {number} grossAnnualFee
 * @param {"monthly"|"quarterly"} schedule
 * @returns {number}
 */
function _computeAdjustmentAmount(adj, feeLineItems, grossAnnualFee, schedule) {
  let computed;

  if (adj.calculationType === AdjustmentCalculationType.FIXED_AMOUNT) {
    computed = typeof adj.value === "number" ? adj.value : 0;
  } else {
    // PERCENTAGE
    let base;
    if (adj.scope === AdjustmentScope.TOTAL_FEE) {
      base = grossAnnualFee;
    } else {
      // SPECIFIC_COMPONENTS — annualise only the targeted line items
      const periods   = schedule === "quarterly" ? 4 : 12;
      const targetIds = new Set(adj.targetComponentIds || []);
      base = feeLineItems
        .filter(item => targetIds.has(item.feeStructureId))
        .reduce((sum, item) => {
          return sum + (item.isOneTime ? item.amount : item.amount * periods);
        }, 0);
    }
    computed = Math.round(base * (adj.value ?? 0) / 100);

    // Apply maxAmount cap (percentage-specific ceiling)
    if (adj.maxAmount !== null && adj.maxAmount !== undefined && computed > adj.maxAmount) {
      computed = adj.maxAmount;
    }
  }

  return Math.max(0, computed);
}

/**
 * Derives grossAnnualFee, totalAdjustmentAmount, and netAnnualFee.
 * Adjustments must already have their computedAmount set by _computeAdjustmentAmount
 * before this function is called.
 *
 * @param {import('../types.js').FeeLineItem[]} feeLineItems
 * @param {import('../types.js').FeeAdjustment[]} feeAdjustments
 * @param {"monthly"|"quarterly"} schedule
 * @returns {{ grossAnnualFee: number, totalAdjustmentAmount: number, netAnnualFee: number }}
 */
function _recalculate(feeLineItems, feeAdjustments, schedule) {
  const grossAnnualFee        = _computeGrossAnnualFee(feeLineItems, schedule);
  const totalAdjustmentAmount = feeAdjustments.reduce((s, a) => s + (a.computedAmount ?? 0), 0);
  const netAnnualFee          = Math.max(0, grossAnnualFee - totalAdjustmentAmount);
  return { grossAnnualFee, totalAdjustmentAmount, netAnnualFee };
}

// ─── 1. Create Draft Profile ──────────────────────────────────────────────────

/**
 * Creates a Student Fee Profile in DRAFT status.
 *
 * Loads ALL active fixed fee structures for the student's class (by classId +
 * schoolId) and snapshots them as feeLineItems. Variable fees and adjustments
 * are added later via updateDraftProfile().
 *
 * The document ID is "${studentId}_${academicYearId}". A Firestore transaction
 * atomically checks that no profile already exists before writing, making
 * duplicate creation impossible even under concurrent requests.
 *
 * Pre-conditions checked before the transaction:
 *   - Student exists in the "students" collection
 *   - Academic year exists and is ACTIVE
 *   - At least one active fixed fee structure exists for the class
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.academicYearId
 * @param {string} params.schoolId
 * @param {string} params.classId
 * @param {string} params.classLabel
 * @param {"monthly"|"quarterly"} params.schedule
 * @param {string} [params.createdBy]                  - Admin UID
 * @param {string|null} [params.promotedFromProfileId] - Prior-year profile if promoting
 * @param {number} [params.openingOutstanding]         - Debt from prior year; default 0
 * @param {number} [params.openingCredit]              - Credit from prior year; default 0
 * @returns {Promise<string>}                           Created document ID
 * @throws {Error} on validation failure, not-found, or duplicate
 */
export async function createDraftProfile({
  studentId,
  academicYearId,
  schoolId,
  classId,
  classLabel,
  schedule,
  createdBy,
  promotedFromProfileId = null,
  openingOutstanding    = 0,
  openingCredit         = 0,
}) {
  _assertId(studentId,      "studentId");
  _assertId(academicYearId, "academicYearId");
  _assertId(schoolId,       "schoolId");
  _assertId(classId,        "classId");

  if (!classLabel || typeof classLabel !== "string") {
    throw new Error("classLabel is required");
  }
  if (!["monthly", "quarterly"].includes(schedule)) {
    throw new Error("schedule must be 'monthly' or 'quarterly'");
  }
  if (typeof openingOutstanding !== "number" || openingOutstanding < 0) {
    throw new Error("openingOutstanding must be a non-negative number");
  }
  if (typeof openingCredit !== "number" || openingCredit < 0) {
    throw new Error("openingCredit must be a non-negative number");
  }

  // ── Pre-flight reads (outside transaction — queries cannot run inside) ────

  const [studentSnap, yearSnap, fixedStructsSnap] = await Promise.all([
    getDoc(doc(db, "students", studentId)),
    getDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, academicYearId)),
    // All active fixed fee structures for this class
    // Composite index required: schoolId ASC, classId ASC, type ASC, isActive ASC
    getDocs(query(
      collection(db, COLLECTIONS.FEE_STRUCTURES),
      where("schoolId", "==", schoolId),
      where("classId",  "==", classId),
      where("type",     "==", "fixed"),
      where("isActive", "==", true)
    )),
  ]);

  if (!studentSnap.exists()) throw new Error("Student not found");
  if (!yearSnap.exists())    throw new Error("Academic year not found");

  const yearData = yearSnap.data();
  if (yearData.status !== AcademicYearStatus.ACTIVE) {
    throw new Error(
      `Academic year must be ACTIVE to create a fee profile. ` +
      `Current status: "${yearData.status}"`
    );
  }

  if (fixedStructsSnap.empty) {
    throw new Error(
      `No active fixed fee structures found for class "${classId}". ` +
      `Configure fee structures for this class before creating a profile.`
    );
  }

  // ── Build feeLineItems snapshot — sorted ascending by allocationPriority ──

  const feeLineItems = fixedStructsSnap.docs
    .map(s => _snapshotFeeStructure({ id: s.id, ...s.data() }))
    .sort((a, b) => a.allocationPriority - b.allocationPriority);

  const { grossAnnualFee, totalAdjustmentAmount, netAnnualFee } =
    _recalculate(feeLineItems, [], schedule);

  // ── Atomic create-or-fail via transaction with deterministic document ID ──

  const profileRef = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, _profileId(studentId, academicYearId));
  const now        = serverTimestamp();

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(profileRef);
    if (existing.exists()) {
      throw new Error(
        "A fee profile already exists for this student in the selected academic year"
      );
    }
    tx.set(profileRef, {
      studentId,
      academicYearId,
      academicYear:          yearData.year,
      schoolId,
      classId,
      classLabel,
      feeStructureId:        null,   // multiple fixed structures — no single reference
      feeLineItems,
      variableFeeIds:        [],
      schedule,
      grossAnnualFee,
      feeAdjustments:        [],
      totalAdjustmentAmount,
      netAnnualFee,
      openingOutstanding,
      openingCredit,
      openingPaid:           0,
      installmentsGenerated: false,
      revisionCount:         0,
      lastRevisedAt:         null,
      status:                ProfileStatus.DRAFT,
      promotedFromProfileId,
      createdAt:             now,
      updatedAt:             now,
      ...(createdBy ? { createdBy } : {}),
    });
  });

  return profileRef.id;
}

// ─── 2. Update Draft Profile ──────────────────────────────────────────────────

/**
 * Updates mutable fields of a DRAFT fee profile.
 *
 * Only DRAFT profiles may be updated directly. Changes to an ACTIVE profile
 * must go through FeeRevisionService.
 *
 * Mutable fields:
 *   - variableFeeIds: full replacement. Each ID is loaded from Firestore,
 *     validated to exist and to be type "variable", and snapshotted.
 *     Variable items in feeLineItems are rebuilt; fixed items are preserved.
 *   - feeAdjustments: full replacement. computedAmount is derived server-side
 *     from each adjustment's definition — any caller-supplied computedAmount
 *     is silently replaced.
 *   - schedule: changes affect grossAnnualFee and all percentage-based adjustments.
 *
 * Computation pipeline (order is mandatory):
 *   1. Resolve variableFeeIds → load structures → rebuild feeLineItems
 *   2. Determine schedule
 *   3. Compute grossAnnualFee from feeLineItems + schedule
 *   4. Compute computedAmount for each adjustment from its definition
 *   5. Validate adjustments (with server-computed computedAmount in place)
 *   6. Compute totalAdjustmentAmount + netAnnualFee
 *   7. Write
 *
 * @param {string} profileId
 * @param {Object} updates
 * @param {string[]} [updates.variableFeeIds]
 * @param {import('../types.js').FeeAdjustment[]} [updates.feeAdjustments]
 * @param {"monthly"|"quarterly"} [updates.schedule]
 * @returns {Promise<void>}
 */
export async function updateDraftProfile(profileId, updates) {
  _assertId(profileId, "profileId");

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updates must be a plain object");
  }
  if (Object.keys(updates).length === 0) {
    throw new Error("updates must contain at least one field");
  }

  const profileRef  = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error("Fee profile not found");

  const profile = _toProfile(profileSnap);
  if (profile.status !== ProfileStatus.DRAFT) {
    throw new Error(
      `Only DRAFT profiles can be updated directly. ` +
      `This profile has status "${profile.status}". ` +
      `Use FeeRevisionService to amend an active profile.`
    );
  }

  // ── Step 1: Resolve variable fees ─────────────────────────────────────────

  let variableFeeIds = profile.variableFeeIds;
  let variableItems  = profile.feeLineItems.filter(i => i.type === "variable");

  if (updates.variableFeeIds !== undefined) {
    if (!Array.isArray(updates.variableFeeIds)) {
      throw new Error("variableFeeIds must be an array");
    }
    const ids = updates.variableFeeIds;

    if (ids.length > 0) {
      const snaps = await Promise.all(
        ids.map(id => getDoc(doc(db, COLLECTIONS.FEE_STRUCTURES, id)))
      );

      const missingIdx = snaps.findIndex(s => !s.exists());
      if (missingIdx !== -1) {
        throw new Error(`Variable fee structure not found: "${ids[missingIdx]}"`);
      }
      const wrongType = snaps.find(s => s.data().type !== "variable");
      if (wrongType) {
        throw new Error(`Fee structure "${wrongType.id}" is not a variable fee structure`);
      }

      variableItems = snaps.map(s => _snapshotFeeStructure({ id: s.id, ...s.data() }));
    } else {
      variableItems = [];
    }

    variableFeeIds = ids;
  }

  // ── Step 2: Resolve schedule ──────────────────────────────────────────────

  let schedule = profile.schedule;
  if (updates.schedule !== undefined) {
    if (!["monthly", "quarterly"].includes(updates.schedule)) {
      throw new Error("schedule must be 'monthly' or 'quarterly'");
    }
    schedule = updates.schedule;
  }

  // ── Step 3: Rebuild feeLineItems and compute grossAnnualFee ──────────────

  const fixedItems   = profile.feeLineItems.filter(i => i.type === "fixed");
  const feeLineItems = [...fixedItems, ...variableItems];
  const grossAnnualFee = _computeGrossAnnualFee(feeLineItems, schedule);

  // ── Step 4: Compute adjustment amounts server-side ────────────────────────

  let feeAdjustments = profile.feeAdjustments;
  if (updates.feeAdjustments !== undefined) {
    if (!Array.isArray(updates.feeAdjustments)) {
      throw new Error("feeAdjustments must be an array");
    }

    // Compute computedAmount from definition — caller's value is discarded
    feeAdjustments = updates.feeAdjustments.map(adj => ({
      ...adj,
      computedAmount: _computeAdjustmentAmount(adj, feeLineItems, grossAnnualFee, schedule),
    }));

    // ── Step 5: Validate adjustments (with server-computed amounts in place) ─
    const adjErrors = [];
    feeAdjustments.forEach((adj, i) => {
      const r = validateFeeAdjustment(adj);
      r.errors.forEach(e => adjErrors.push(`feeAdjustments[${i}]: ${e}`));
    });
    if (adjErrors.length > 0) throw _validationError(adjErrors);
  } else {
    // Schedule or variable fees changed: recompute existing adjustment amounts
    // so percentage-based adjustments stay consistent with the new base.
    feeAdjustments = profile.feeAdjustments.map(adj => ({
      ...adj,
      computedAmount: _computeAdjustmentAmount(adj, feeLineItems, grossAnnualFee, schedule),
    }));
  }

  // ── Step 6: Compute final totals ──────────────────────────────────────────

  const totalAdjustmentAmount = feeAdjustments.reduce((s, a) => s + (a.computedAmount ?? 0), 0);
  const netAnnualFee          = Math.max(0, grossAnnualFee - totalAdjustmentAmount);

  // ── Step 7: Write ─────────────────────────────────────────────────────────

  await updateDoc(profileRef, {
    schedule,
    feeAdjustments,
    variableFeeIds,
    feeLineItems,
    grossAnnualFee,
    totalAdjustmentAmount,
    netAnnualFee,
    updatedAt: serverTimestamp(),
  });
}

// ─── 3. Activate Profile ─────────────────────────────────────────────────────

/**
 * Transitions a DRAFT fee profile to ACTIVE status.
 *
 * Business rules:
 *   - Profile must be in DRAFT status.
 *   - Profile must have at least one fee line item (snapshot not empty).
 *   - The full profile shape is validated before write.
 *
 * Does NOT generate installments. Call FeeInstallmentService.createInstallments()
 * after activation. installmentsGenerated remains false until that call.
 *
 * @param {string} profileId
 * @returns {Promise<void>}
 * @throws {Error} if profile not found, not DRAFT, or snapshot validation fails
 */
export async function activateProfile(profileId) {
  _assertId(profileId, "profileId");

  const profileRef  = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error("Fee profile not found");

  const profile = _toProfile(profileSnap);

  if (profile.status !== ProfileStatus.DRAFT) {
    throw new Error(
      `Only DRAFT profiles can be activated. Current status: "${profile.status}"`
    );
  }

  // Snapshot must have at least one fee line item
  if (!Array.isArray(profile.feeLineItems) || profile.feeLineItems.length === 0) {
    throw new Error(
      "Cannot activate a profile with no fee line items. " +
      "Ensure fixed fee structures are configured for this class."
    );
  }

  // Validate the full profile shape against the ACTIVE status it will become
  const validation = validateFeeProfile({
    studentId:             profile.studentId,
    academicYearId:        profile.academicYearId,
    academicYear:          profile.academicYear,
    schoolId:              profile.schoolId,
    classId:               profile.classId,
    classLabel:            profile.classLabel,
    schedule:              profile.schedule,
    feeLineItems:          profile.feeLineItems,
    feeAdjustments:        profile.feeAdjustments,
    variableFeeIds:        profile.variableFeeIds,
    grossAnnualFee:        profile.grossAnnualFee,
    totalAdjustmentAmount: profile.totalAdjustmentAmount,
    netAnnualFee:          profile.netAnnualFee,
    openingOutstanding:    profile.openingOutstanding,
    openingCredit:         profile.openingCredit,
    openingPaid:           profile.openingPaid,
    status:                ProfileStatus.ACTIVE,
  });
  if (!validation.valid) throw _validationError(validation.errors);

  await updateDoc(profileRef, {
    status:    ProfileStatus.ACTIVE,
    updatedAt: serverTimestamp(),
  });
}

// ─── 4. Close Profile ─────────────────────────────────────────────────────────

/**
 * Closes a fee profile. The academic year must be CLOSED before any of its
 * profiles can be closed.
 *
 * Both DRAFT and ACTIVE profiles may be closed (a draft profile that was never
 * activated can be closed during year-end cleanup).
 *
 * @param {string} profileId
 * @returns {Promise<void>}
 * @throws {Error} if profile not found, already closed, or academic year not CLOSED
 */
export async function closeProfile(profileId) {
  _assertId(profileId, "profileId");

  const profileRef  = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error("Fee profile not found");

  const profile = _toProfile(profileSnap);

  if (profile.status === ProfileStatus.CLOSED) {
    throw new Error("This fee profile is already closed");
  }

  const yearSnap = await getDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, profile.academicYearId));
  if (!yearSnap.exists()) throw new Error("Academic year not found");

  const yearStatus = yearSnap.data().status;
  if (yearStatus !== AcademicYearStatus.CLOSED) {
    throw new Error(
      `Fee profiles can only be closed once the academic year is CLOSED. ` +
      `Current academic year status: "${yearStatus}"`
    );
  }

  await updateDoc(profileRef, {
    status:    ProfileStatus.CLOSED,
    updatedAt: serverTimestamp(),
  });
}

// ─── 5. Get Profile ───────────────────────────────────────────────────────────

/**
 * Returns a fee profile by its document ID.
 * feeLineItems and feeAdjustments are embedded — no additional queries needed.
 *
 * @param {string} profileId
 * @returns {Promise<import('../types.js').StudentFeeProfile|null>}
 */
export async function getProfile(profileId) {
  _assertId(profileId, "profileId");
  const snap = await getDoc(doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId));
  return snap.exists() ? _toProfile(snap) : null;
}

/**
 * Returns the fee profile for a specific student and academic year, or null.
 *
 * Because the document ID is deterministic ("${studentId}_${academicYearId}"),
 * this is a direct document lookup — no composite index or query required.
 *
 * @param {string} studentId
 * @param {string} academicYearId
 * @returns {Promise<import('../types.js').StudentFeeProfile|null>}
 */
export async function getProfileByStudentAndYear(studentId, academicYearId) {
  _assertId(studentId,      "studentId");
  _assertId(academicYearId, "academicYearId");

  const snap = await getDoc(
    doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, _profileId(studentId, academicYearId))
  );
  return snap.exists() ? _toProfile(snap) : null;
}

/**
 * Returns all fee profiles for a school within a given academic year string.
 * Composite index required: schoolId ASC, academicYear ASC
 *   (with optional status filter: schoolId ASC, academicYear ASC, status ASC).
 *
 * @param {string} schoolId
 * @param {string} academicYear  - "YYYY-YY"
 * @param {string} [status]      - Optional: "draft" | "active" | "closed"
 * @returns {Promise<import('../types.js').StudentFeeProfile[]>}
 */
export async function getProfilesBySchoolAndYear(schoolId, academicYear, status) {
  _assertId(schoolId, "schoolId");
  if (!academicYear || typeof academicYear !== "string") {
    throw new Error("academicYear is required");
  }
  if (status !== undefined && !Object.values(ProfileStatus).includes(status)) {
    throw new Error(`status must be one of: ${Object.values(ProfileStatus).join(", ")}`);
  }

  const constraints = [
    where("schoolId",     "==", schoolId),
    where("academicYear", "==", academicYear),
  ];
  if (status) {
    constraints.push(where("status", "==", status));
  }

  const snap = await getDocs(query(col(), ...constraints));
  return snap.docs.map(_toProfile);
}

// ─── 6. Delete Draft Profile ──────────────────────────────────────────────────

/**
 * Permanently deletes a DRAFT fee profile.
 *
 * Only DRAFT profiles may be deleted. ACTIVE and CLOSED profiles are rejected —
 * they carry financial meaning and must not be removed.
 *
 * @param {string} profileId
 * @returns {Promise<void>}
 * @throws {Error} if profile not found or not DRAFT
 */
export async function deleteDraftProfile(profileId) {
  _assertId(profileId, "profileId");

  const profileRef  = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error("Fee profile not found");

  const profile = _toProfile(profileSnap);

  if (profile.status !== ProfileStatus.DRAFT) {
    throw new Error(
      `Only DRAFT fee profiles can be deleted. ` +
      `This profile has status "${profile.status}".`
    );
  }

  await deleteDoc(profileRef);
}
