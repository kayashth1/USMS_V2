/**
 * FeeInstallmentService — Fee Management V2
 *
 * Manages the feeInstallments collection. One document per period per student
 * per academic year. Installments are created atomically by createInstallments;
 * subsequent mutations (revision propagation, cancellation, period lock) are
 * handled by dedicated operations.
 *
 * Status derivation rules (enforced on every balance-affecting write):
 *   cancelled → "cancelled"    regardless of balance
 *   balance <= 0               → "paid"
 *   balance > 0, allocated > 0 → "partial"
 *   balance > 0, today > due   → "overdue"
 *   balance > 0, today <= due  → "due"
 *   balance > 0, due is future → "upcoming"
 *
 * Document ID format: {profileId}_{period}
 *   Monthly:   "profileId_2026-04" through "profileId_2027-03"
 *   Quarterly: "profileId_Q1-2026-27" through "profileId_Q4-2026-27"
 */

import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, where, orderBy, runTransaction, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import { ProfileStatus, InstallmentStatus } from "../constants/enums.js";
import { generateSchedule } from "../feeScheduleGenerator.js";
import { validateSchedule } from "../validation/scheduleValidator.js";

// ─── Private helpers ──────────────────────────────────────────────────────────

const col = () => collection(db, COLLECTIONS.FEE_INSTALLMENTS);

/**
 * Reduces installment balances by the profile's openingCredit, consuming it
 * from the earliest installment first. Pure — no I/O, no side effects.
 * Does NOT create payments, receipts, or PaymentAllocations.
 *
 * Each returned entry gets a `creditApplied` field (≥ 0). When creditApplied > 0
 * the `balance` field is reduced accordingly. `netAmount` is never changed.
 *
 * @param {import('../feeScheduleGenerator.js').ScheduleEntry[]} entries
 * @param {number} openingCredit
 * @returns {Array<ScheduleEntry & { creditApplied: number }>}
 */
function _applyOpeningCredit(entries, openingCredit) {
  if (!openingCredit || openingCredit <= 0) {
    return entries.map((e) => ({ ...e, creditApplied: 0 }));
  }

  let remaining = openingCredit;
  return entries.map((entry) => {
    if (remaining <= 0) return { ...entry, creditApplied: 0 };
    // Apply up to the full installment amount (balance === netAmount at creation)
    const apply = Math.min(remaining, entry.netAmount);
    remaining  -= apply;
    return { ...entry, balance: entry.netAmount - apply, creditApplied: apply };
  });
}

/**
 * Adds the profile's openingOutstanding to the FIRST installment's balance.
 * This makes carry-forward dues immediately payable through the normal
 * payment collection flow. balance may exceed netAmount for installment #1.
 *
 * Pure — no I/O, no side effects. Applied AFTER _applyOpeningCredit.
 *
 * @param {Array<ScheduleEntry & { creditApplied: number }>} entries
 * @param {number} openingOutstanding
 * @returns {Array<ScheduleEntry & { creditApplied: number, outstandingApplied: number }>}
 */
function _applyOpeningOutstanding(entries, openingOutstanding) {
  if (!openingOutstanding || openingOutstanding <= 0) {
    return entries.map((e) => ({ ...e, outstandingApplied: 0 }));
  }
  return entries.map((entry, i) => {
    if (i !== 0) return { ...entry, outstandingApplied: 0 };
    return {
      ...entry,
      balance:             entry.balance + openingOutstanding,
      outstandingApplied:  openingOutstanding,
    };
  });
}

function _toInstallment(snap) {
  return { id: snap.id, ...snap.data() };
}

// ─── 1. createInstallments ────────────────────────────────────────────────────

/**
 * Generates all installment documents for a DRAFT fee profile in a single
 * Firestore transaction, then transitions the profile to ACTIVE.
 *
 * Pipeline:
 *   1. Load profile from Firestore and validate preconditions.
 *   2. Call FeeScheduleGenerator (pure, no I/O).
 *   3. Run ScheduleValidator — abort on any validation error.
 *   4. Open a transaction:
 *        a. Re-read profile to guard against concurrent generation.
 *        b. Read each installment slot to confirm none exist.
 *        c. Write one feeInstallment document per schedule entry.
 *        d. Update profile: status → ACTIVE, installmentsGenerated → true.
 *
 * Installment document IDs are deterministic ({profileId}_{period}) so that
 * duplicate creation is caught atomically inside the transaction.
 *
 * Field mapping from ScheduleEntry to feeInstallment document:
 *   entry.adjustmentAmount → discountAmount  (Firestore field name differs)
 *   entry.status ("scheduled") is NOT stored — persisted status is UPCOMING.
 *   entry.dueDate (Date)  → dueDate          (SDK auto-converts to Timestamp)
 *
 * @param {Object}      params
 * @param {string}      params.profileId        - studentFeeProfiles document ID
 * @param {import('../feeScheduleGenerator.js').SchoolSettings} [params.schoolSettings]
 *                                              - Holiday months and due-date strategy.
 *                                                Defaults to no holidays, day-10 due dates.
 * @param {string}      [params.createdBy]      - Admin UID
 * @returns {Promise<string[]>}                   Ordered installment document IDs
 * @throws {Error} if profile not found, preconditions fail, or validation errors
 */
export async function createInstallments({ profileId, schoolSettings, createdBy }) {
  if (!profileId || typeof profileId !== "string") {
    throw new Error("profileId is required");
  }

  // ── Step 1: Load profile (outside transaction — needed to run generator) ───

  const profileRef  = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    throw new Error(`Fee profile "${profileId}" not found`);
  }

  const profile = { id: profileSnap.id, ...profileSnap.data() };

  // Precondition: no regeneration
  if (profile.installmentsGenerated) {
    throw new Error(
      "Installments have already been generated for this profile. " +
      "Use the Fee Revision module to make changes to existing installments."
    );
  }

  // Precondition: profile must be in DRAFT status
  if (profile.status !== ProfileStatus.DRAFT) {
    throw new Error(
      `Cannot generate installments: profile status is "${profile.status}". ` +
      "Only DRAFT profiles can have installments generated."
    );
  }

  // ── Step 2: Generate schedule (pure, deterministic, no I/O) ───────────────

  const rawEntries = generateSchedule(
    profile,
    schoolSettings ?? {},
    profile.academicYear
  );

  // ── Step 3: Validate schedule — abort on any error ────────────────────────
  // Validate BEFORE applying opening credit so Rule 5 (balance === netAmount)
  // correctly checks the raw generated values, not the credit-reduced balances.

  const validation = validateSchedule(rawEntries, profile);
  if (!validation.valid) {
    const err = new Error(
      `Schedule validation failed with ${validation.errors.length} error(s): ` +
      validation.errors[0]
    );
    err.validationErrors = validation.errors;
    throw err;
  }

  // ── Step 3b: Apply opening credit, then opening outstanding ──────────────
  // Both run after validation so modified balances don't trip Rule 5.
  // Credit reduces balance from the earliest installment forward.
  // Outstanding adds to the first installment's balance (carry-forward dues).

  const withCredit = _applyOpeningCredit(rawEntries, profile.openingCredit ?? 0);
  const entries    = _applyOpeningOutstanding(withCredit, profile.openingOutstanding ?? 0);

  // ── Step 4: Prepare deterministic document refs ────────────────────────────
  // ID format: {profileId}_{period} — unique per profile + period combination.

  const installmentRefs = entries.map(entry =>
    doc(db, COLLECTIONS.FEE_INSTALLMENTS, `${profileId}_${entry.period}`)
  );

  // ── Step 5: Atomic transaction ─────────────────────────────────────────────
  // Firestore Web SDK: tx.get() only accepts DocumentReference, not Query.
  // All reads (profile re-read + every installment slot) precede all writes.

  await runTransaction(db, async (tx) => {

    // Re-read profile to guard against concurrent generation
    const latestProfile = await tx.get(profileRef);
    if (!latestProfile.exists()) {
      throw new Error(`Fee profile "${profileId}" not found`);
    }
    if (latestProfile.data().installmentsGenerated) {
      throw new Error(
        "Installments were generated concurrently by another request. Aborting."
      );
    }

    // Confirm every installment slot is empty (rule: do not overwrite)
    for (const ref of installmentRefs) {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        throw new Error(
          `Installment document "${ref.id}" already exists. ` +
          "Regeneration is not supported — use the Fee Revision module."
        );
      }
    }

    const now = serverTimestamp();

    // Write one feeInstallment document per schedule entry
    entries.forEach((entry, i) => {
      const creditApplied      = entry.creditApplied      ?? 0;
      const outstandingApplied = entry.outstandingApplied ?? 0;
      const balance            = entry.balance;

      // Derive status: credit may settle an installment; outstanding raises balance above netAmount
      let status = InstallmentStatus.UPCOMING;
      if (balance <= 0)           status = InstallmentStatus.PAID;
      else if (creditApplied > 0) status = InstallmentStatus.PARTIAL;

      tx.set(installmentRefs[i], {
        feeProfileId:         profileId,
        studentId:            profile.studentId,
        schoolId:             profile.schoolId,
        academicYear:         profile.academicYear,
        installmentNumber:    entry.installmentNumber,
        period:               entry.period,
        periodLabel:          entry.periodLabel,
        dueDate:              entry.dueDate,           // Date → Firestore Timestamp (auto-converted)
        isHolidayMonth:       entry.isHolidayMonth,
        lineItems:            entry.lineItems,
        grossAmount:          entry.grossAmount,
        discountAmount:       entry.adjustmentAmount,  // ScheduleEntry field name differs from document field
        netAmount:            entry.netAmount,
        totalAllocated:       creditApplied,
        openingOutstanding:   outstandingApplied,      // carry-forward dues baked into this installment
        balance,
        status,
        isLocked:           false,
        cancelledAt:        null,
        cancellationReason: null,
        lastRevisionId:     null,
        lastRevisedAt:      null,
        createdAt:          now,
        updatedAt:          now,
        ...(createdBy ? { createdBy } : {}),
      });
    });

    // Transition the profile to ACTIVE and clear opening balance migration values.
    // openingOutstanding and openingCredit have been transferred into installments;
    // installments are now the single source of truth for balances.
    // The original values are preserved in applied* fields for display purposes.
    tx.update(profileRef, {
      status:                        ProfileStatus.ACTIVE,
      installmentsGenerated:         true,
      appliedOpeningOutstanding:     profile.openingOutstanding ?? 0,
      appliedOpeningCredit:          profile.openingCredit ?? 0,
      openingOutstanding:            0,
      openingCredit:                 0,
      updatedAt:                     now,
    });
  });

  return installmentRefs.map(ref => ref.id);
}

// ─── 2. updateInstallment ─────────────────────────────────────────────────────

/**
 * Updates a single installment's mutable fields.
 * Used internally by FeeRevisionService when propagating a revision to future
 * installments, and by the period-close operation to set isLocked = true.
 *
 * @param {string} installmentId
 * @param {Object} updates
 * @param {import('../types.js').FeeLineItem[]} [updates.lineItems]
 * @param {number} [updates.grossAmount]
 * @param {number} [updates.discountAmount]
 * @param {number} [updates.netAmount]
 * @param {number} [updates.totalAllocated]
 * @param {number} [updates.balance]
 * @param {boolean} [updates.isLocked]
 * @param {string|null} [updates.lastRevisionId]
 * @returns {Promise<void>}
 */
export async function updateInstallment(installmentId, updates) {
  throw new Error("Not implemented: FeeInstallmentService.updateInstallment");
}

// ─── 3. getInstallments ───────────────────────────────────────────────────────

/**
 * Returns all installments for a fee profile, ordered by installmentNumber ascending.
 * Composite index required: feeProfileId ASC, installmentNumber ASC.
 *
 * @param {string} profileId
 * @returns {Promise<import('../types.js').FeeInstallment[]>}
 */
export async function getInstallments(profileId) {
  if (!profileId || typeof profileId !== "string") {
    throw new Error("profileId is required");
  }

  const snap = await getDocs(
    query(
      col(),
      where("feeProfileId",     "==", profileId),
      orderBy("installmentNumber", "asc")
    )
  );

  return snap.docs.map(_toInstallment);
}

// ─── 4. getInstallmentsByStudentAndYear ───────────────────────────────────────

/**
 * Returns all installments for a student in a given academic year, ordered by
 * installmentNumber ascending.
 * Composite index required: studentId ASC, academicYear ASC, installmentNumber ASC.
 *
 * @param {string} studentId
 * @param {string} academicYear  - "YYYY-YY"
 * @returns {Promise<import('../types.js').FeeInstallment[]>}
 */
export async function getInstallmentsByStudentAndYear(studentId, academicYear) {
  if (!studentId   || typeof studentId   !== "string") throw new Error("studentId is required");
  if (!academicYear || typeof academicYear !== "string") throw new Error("academicYear is required");

  const snap = await getDocs(
    query(
      col(),
      where("studentId",        "==", studentId),
      where("academicYear",     "==", academicYear),
      orderBy("installmentNumber", "asc")
    )
  );

  return snap.docs.map(_toInstallment);
}

// ─── 5. getOutstandingInstallments ────────────────────────────────────────────

/**
 * Returns installments with balance > 0 for a student in a given academic year.
 * Used by the alumni gate to block promotion if dues exist.
 * Composite index required: studentId ASC, academicYear ASC, balance ASC, installmentNumber ASC.
 *
 * @param {string} studentId
 * @param {string} academicYear  - "YYYY-YY"
 * @returns {Promise<import('../types.js').FeeInstallment[]>}
 */
export async function getOutstandingInstallments(studentId, academicYear) {
  if (!studentId   || typeof studentId   !== "string") throw new Error("studentId is required");
  if (!academicYear || typeof academicYear !== "string") throw new Error("academicYear is required");

  const snap = await getDocs(
    query(
      col(),
      where("studentId",    "==", studentId),
      where("academicYear", "==", academicYear),
      where("balance",      ">",  0),
      orderBy("balance",            "asc"),
      orderBy("installmentNumber",  "asc")
    )
  );

  return snap.docs.map(_toInstallment);
}

// ─── 6. cancelInstallment ────────────────────────────────────────────────────

/**
 * Cancels an installment. Sets status to "cancelled", balance to 0, and stamps
 * cancelledAt and cancellationReason. Existing paymentAllocations are preserved
 * for credit-tracking purposes.
 *
 * @param {string} installmentId
 * @param {string} cancellationReason
 * @param {string} cancelledBy  - Admin UID
 * @returns {Promise<void>}
 */
export async function cancelInstallment(installmentId, cancellationReason, cancelledBy) {
  throw new Error("Not implemented: FeeInstallmentService.cancelInstallment");
}

// ─── 7. waiverInstallmentsForBatch ───────────────────────────────────────────

/**
 * Waives all outstanding installments for a set of StudentPromotion records.
 * Called before graduation execution when the admin chooses to waive dues
 * instead of collecting or graduating with outstanding balance.
 *
 * For each StudentPromotion that has openingOutstanding > 0 and an
 * oldFeeProfileId, loads all non-cancelled, non-paid, non-waived installments
 * and sets: status = WAIVED, balance = 0, waivedBy, waivedAt, waiverReason.
 *
 * Uses chunked writeBatch (max 400 ops per batch, well under Firestore's 500
 * limit) so that large graduating classes don't exceed the per-batch limit.
 *
 * @param {Object[]} pendingPromotions  StudentPromotion docs (with oldFeeProfileId, openingOutstanding)
 * @param {string}   waivedBy           Admin UID
 * @param {string}   [waiverReason]     Optional note stored on each waived installment
 * @returns {Promise<{ waived: number }>}
 */
export async function waiverInstallmentsForBatch(pendingPromotions, waivedBy, waiverReason) {
  const targets = (pendingPromotions ?? []).filter(
    (sp) => (sp.openingOutstanding ?? 0) > 0 && sp.oldFeeProfileId
  );
  if (targets.length === 0) return { waived: 0 };

  const waivedAt = serverTimestamp();
  const STATUSES_TO_SKIP = new Set(["cancelled", "paid", "waived"]);

  // Load installments for all target profiles in parallel
  const groups = await Promise.all(
    targets.map(async (sp) => {
      const insts = await getInstallments(sp.oldFeeProfileId);
      return insts.filter(
        (inst) => !STATUSES_TO_SKIP.has(inst.status) && (inst.balance ?? 0) > 0
      );
    })
  );

  // Write in chunks of 400 to stay under the 500-op Firestore writeBatch limit
  let batch  = writeBatch(db);
  let ops    = 0;
  let waived = 0;

  for (const installments of groups) {
    for (const inst of installments) {
      const ref = doc(db, COLLECTIONS.FEE_INSTALLMENTS, inst.id);
      batch.update(ref, {
        status:       InstallmentStatus.WAIVED,
        balance:      0,
        waivedBy,
        waivedAt,
        waiverReason: waiverReason ?? null,
        updatedAt:    waivedAt,
      });
      ops++;
      waived++;

      if (ops === 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops   = 0;
      }
    }
  }

  if (ops > 0) await batch.commit();

  return { waived };
}

// ─── 8. lockPeriodInstallments ───────────────────────────────────────────────

/**
 * Locks all unlocked installments for a given period across a school.
 * Used by the period-close workflow.
 * Composite index required: schoolId ASC, period ASC, isLocked ASC.
 *
 * @param {string} schoolId
 * @param {string} period     - "YYYY-MM"
 * @param {string} lockedBy   - Admin UID
 * @returns {Promise<{ locked: number }>}
 */
export async function lockPeriodInstallments(schoolId, period, lockedBy) {
  throw new Error("Not implemented: FeeInstallmentService.lockPeriodInstallments");
}
