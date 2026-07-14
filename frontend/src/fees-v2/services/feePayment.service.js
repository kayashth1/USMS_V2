/**
 * FeePaymentService — Fee Management V2
 *
 * Persists a payment that has already been validated by PaymentValidator and
 * allocated by PaymentAllocationEngine. This service does NO financial
 * calculation — it only writes Firestore documents.
 *
 * Everything in createPayment runs inside ONE Firestore transaction.
 * Firestore Web SDK constraint: ALL tx.get() calls must precede ALL
 * tx.set()/tx.update() calls within the same transaction callback.
 *
 * Documents written per payment:
 *   1 × FeePayment
 *   1 × PaymentAllocation for the opening balance (if allocated)
 *   N × PaymentAllocation (one per touched installment)
 *   N × FeeInstallment updates (balance, totalAllocated, status)
 *   1 × receipt counter increment (via ReceiptNumberGenerator)
 *   1 × StudentFeeProfile update (openingPaid) — only if opening balance allocated
 *
 * If ANY write fails, Firestore rolls back the entire transaction automatically.
 */

import {
  collection, doc, getDoc, getDocs, runTransaction, serverTimestamp,
  query, where, orderBy, limit,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import {
  PaymentStatus,
  InstallmentStatus,
  AllocationTarget,
  AllocationStrategy,
} from "../constants/enums.js";
import { createReceiptNumberGenerator } from "../utils/receiptNumber.js";

// ─── Private helpers ──────────────────────────────────────────────────────────

const paymentCol = () => collection(db, COLLECTIONS.FEE_PAYMENTS);

function _toDoc(snap) {
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Derives the installment status after a balance change.
 * The payment service uses a three-state model; overdue/upcoming transitions
 * are handled separately by date-aware operations.
 *
 * @param {number} newBalance
 * @param {number} netAmount
 * @returns {string} InstallmentStatus value
 */
function _deriveInstallmentStatus(newBalance, netAmount) {
  if (newBalance <= 0)           return InstallmentStatus.PAID;
  if (newBalance < netAmount)    return InstallmentStatus.PARTIAL;
  return InstallmentStatus.DUE;
}

// ─── 1. createPayment ─────────────────────────────────────────────────────────

/**
 * Atomically persists a payment, its allocation records, and all affected
 * installment updates.
 *
 * Pre-conditions (enforced by callers, not re-checked here):
 *   - PaymentValidator has already returned { valid: true }
 *   - PaymentAllocationEngine has produced allocationPlan
 *   - profile.id is set (the Firestore document ID)
 *
 * Transaction structure:
 *   READ PHASE  — all tx.get() calls
 *     a. Receipt counter document
 *     b. Profile document (only if opening balance is being allocated)
 *     c. Each touched installment document (concurrency guard)
 *
 *   WRITE PHASE — all synchronous, no await
 *     a. Increment receipt counter → get receiptNo
 *     b. tx.set(paymentRef, ...)
 *     c. tx.set(openingAllocRef, ...) — if applicable
 *     d. tx.set(instAllocRef[i], ...) — per installment
 *     e. tx.update(instRef[i], ...)   — per installment (balance, status)
 *     f. tx.update(profileRef, ...)   — if opening balance allocated
 *
 * @param {Object}                         params
 * @param {import('../types.js').StudentFeeProfile}          params.profile
 *   Must include `.id` (Firestore document ID), `.studentId`, `.schoolId`,
 *   `.academicYear`, `.openingPaid`.
 * @param {import('../validation/paymentValidator.js').PaymentRequest} params.paymentRequest
 *   `{ paymentAmount, paymentMode, paymentDate, collectedBy, remarks?, createdBy? }`
 * @param {import('../paymentAllocationEngine.js').AllocationPlan}     params.allocationPlan
 *   Output of buildAllocationPlan(). Not re-computed here.
 * @param {{ getRef: function, generate: function }} [params.receiptGenerator]
 *   Override for testing. Defaults to the Firestore counter-backed generator.
 * @returns {Promise<{ paymentId: string, receiptNo: string }>}
 */
export async function createPayment({
  profile,
  paymentRequest,
  allocationPlan,
  receiptGenerator = null,
}) {
  if (!profile?.id) throw new Error("profile.id is required");

  const generator = receiptGenerator ?? createReceiptNumberGenerator(db, profile.schoolId);

  const paymentDate = paymentRequest.paymentDate instanceof Date
    ? paymentRequest.paymentDate
    : new Date(paymentRequest.paymentDate);

  const {
    openingBalanceAllocation,
    installmentAllocations,
  } = allocationPlan;

  // ── Pre-compute all DocumentReferences outside the transaction ─────────────
  // Auto-generated IDs are assigned at reference-creation time — no I/O needed.

  const paymentRef    = doc(paymentCol());
  const counterRef    = generator.getRef(paymentDate);
  const profileRef    = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profile.id);

  const instRefs = installmentAllocations.map(alloc =>
    doc(db, COLLECTIONS.FEE_INSTALLMENTS, alloc.installmentId)
  );

  const openingAllocRef = openingBalanceAllocation > 0
    ? doc(collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS))
    : null;

  const instAllocRefs = installmentAllocations.map(
    () => doc(collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS))
  );

  let capturedReceiptNo = null;

  await runTransaction(db, async (tx) => {

    // ── READ PHASE ────────────────────────────────────────────────────────────
    // Firestore requires all reads to complete before any writes are issued.

    // a. Receipt counter (always needed)
    const counterSnap = await tx.get(counterRef);

    // b. Profile (only when opening balance is being allocated)
    let profileSnap = null;
    if (openingBalanceAllocation > 0) {
      profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists()) {
        throw new Error(`Fee profile "${profile.id}" not found`);
      }
    }

    // c. Each touched installment — validates existence and guards against
    //    concurrent payments that may have reduced the balance since the
    //    AllocationPlan was built outside this transaction.
    const instSnaps = await Promise.all(instRefs.map(r => tx.get(r)));

    for (let i = 0; i < instSnaps.length; i++) {
      const snap  = instSnaps[i];
      const alloc = installmentAllocations[i];
      if (!snap.exists()) {
        throw new Error(`Installment "${alloc.installmentId}" not found`);
      }
      const freshBalance = snap.data().balance ?? 0;
      if (freshBalance < alloc.allocatedAmount) {
        throw new Error(
          `Concurrent payment detected: installment "${alloc.installmentId}" ` +
          `has balance ₹${freshBalance} but allocation plan expected ≥₹${alloc.allocatedAmount}. ` +
          "Retry after refreshing the installment data."
        );
      }
    }

    // ── WRITE PHASE ───────────────────────────────────────────────────────────
    // No await after this point — all writes are synchronous tx calls.

    // a. Increment receipt counter and capture the receipt number.
    //    generator.generate() calls tx.set(counterRef, ...) internally.
    capturedReceiptNo = generator.generate(counterSnap, tx, paymentDate);

    const now = serverTimestamp();

    // b. Build the allocationSummary embedded in the payment document.
    const allocationSummary = [];
    if (openingBalanceAllocation > 0) {
      allocationSummary.push({
        target:        AllocationTarget.OPENING_BALANCE,
        installmentId: null,
        period:        null,
        periodLabel:   "Prior Year Balance",
        amount:        openingBalanceAllocation,
      });
    }
    for (const alloc of installmentAllocations) {
      allocationSummary.push({
        target:        AllocationTarget.INSTALLMENT,
        installmentId: alloc.installmentId,
        period:        alloc.period,
        periodLabel:   alloc.periodLabel,
        amount:        alloc.allocatedAmount,
      });
    }

    // c. Write the FeePayment document.
    tx.set(paymentRef, {
      studentId:         profile.studentId,
      schoolId:          profile.schoolId,
      academicYear:      profile.academicYear,
      feeProfileId:      profile.id,
      receiptNo:         capturedReceiptNo,
      paymentAmount:     paymentRequest.paymentAmount,
      paymentMode:       paymentRequest.paymentMode,
      paymentDate,
      collectedBy:       paymentRequest.collectedBy,
      remarks:           paymentRequest.remarks    ?? null,
      status:            PaymentStatus.CONFIRMED,
      allocationSummary,
      allocatedAmount:   allocationPlan.allocatedAmount,
      unallocatedAmount: allocationPlan.unallocatedAmount,
      cancelledAt:       null,
      cancellationNote:  null,
      cancelledBy:       null,
      createdAt:         now,
      updatedAt:         now,
      ...(paymentRequest.createdBy ? { createdBy: paymentRequest.createdBy } : {}),
    });

    // d. Write opening balance allocation document (if applicable).
    if (openingAllocRef) {
      tx.set(openingAllocRef, {
        paymentId:            paymentRef.id,
        feeProfileId:         profile.id,
        studentId:            profile.studentId,
        schoolId:             profile.schoolId,
        academicYear:         profile.academicYear,
        allocationStrategy:   AllocationStrategy.PRIORITY_ORDER,
        allocationTarget:     AllocationTarget.OPENING_BALANCE,
        installmentId:        null,
        period:               null,
        periodLabel:          "Prior Year Balance",
        allocatedAmount:      openingBalanceAllocation,
        componentAllocations: [],
        createdAt:            now,
      });
    }

    // e. Write one allocation record per touched installment, then update
    //    the installment's totalAllocated, balance, and status.
    for (let i = 0; i < installmentAllocations.length; i++) {
      const alloc     = installmentAllocations[i];
      const freshData = instSnaps[i].data();

      // Allocation record
      tx.set(instAllocRefs[i], {
        paymentId:            paymentRef.id,
        feeProfileId:         profile.id,
        studentId:            profile.studentId,
        schoolId:             profile.schoolId,
        academicYear:         profile.academicYear,
        allocationStrategy:   AllocationStrategy.PRIORITY_ORDER,
        allocationTarget:     AllocationTarget.INSTALLMENT,
        installmentId:        alloc.installmentId,
        period:               alloc.period,
        periodLabel:          alloc.periodLabel,
        allocatedAmount:      alloc.allocatedAmount,
        componentAllocations: alloc.componentAllocations,
        createdAt:            now,
      });

      // Installment balance update
      const newTotalAllocated = (freshData.totalAllocated ?? 0) + alloc.allocatedAmount;
      const newBalance        = (freshData.balance        ?? 0) - alloc.allocatedAmount;
      const newStatus         = _deriveInstallmentStatus(newBalance, freshData.netAmount ?? 0);

      tx.update(instRefs[i], {
        totalAllocated: newTotalAllocated,
        balance:        newBalance,
        status:         newStatus,
        updatedAt:      now,
      });
    }

    // f. Update profile.openingPaid (only when opening balance was allocated).
    if (openingBalanceAllocation > 0 && profileSnap) {
      const currentOpeningPaid = profileSnap.data().openingPaid ?? 0;
      tx.update(profileRef, {
        openingPaid: currentOpeningPaid + openingBalanceAllocation,
        updatedAt:   now,
      });
    }
  });

  return { paymentId: paymentRef.id, receiptNo: capturedReceiptNo };
}

// ─── 2. cancelPayment (stub) ──────────────────────────────────────────────────

/**
 * Cancels a payment by:
 *   1. Setting payment status to "cancelled"
 *   2. Reversing all PaymentAllocation records (totalAllocated decremented,
 *      balance restored on each affected installment)
 *   3. Recomputing installment statuses
 *
 * @param {string} paymentId
 * @param {string} cancelledBy
 * @param {string} cancellationNote
 * @returns {Promise<void>}
 */
export async function cancelPayment(paymentId, cancelledBy, cancellationNote) {
  throw new Error("Not implemented: FeePaymentService.cancelPayment");
}

// ─── 3. getPayment ────────────────────────────────────────────────────────────

/**
 * Returns a payment by its Firestore document ID.
 *
 * @param {string} paymentId
 * @returns {Promise<import('../types.js').FeePayment|null>}
 */
export async function getPayment(paymentId) {
  if (!paymentId || typeof paymentId !== "string") {
    throw new Error("paymentId is required");
  }
  const snap = await getDoc(doc(db, COLLECTIONS.FEE_PAYMENTS, paymentId));
  return _toDoc(snap);
}

// ─── 4. getPaymentByReceiptNo ─────────────────────────────────────────────────

/**
 * Returns a payment by receipt number.
 * Uses the auto-index on receiptNo (single-field).
 *
 * @param {string} receiptNo
 * @returns {Promise<import('../types.js').FeePayment|null>}
 */
export async function getPaymentByReceiptNo(receiptNo) {
  if (!receiptNo || typeof receiptNo !== "string") {
    throw new Error("receiptNo is required");
  }
  const snap = await getDocs(
    query(paymentCol(), where("receiptNo", "==", receiptNo), limit(1))
  );
  if (snap.empty) return null;
  return _toDoc(snap.docs[0]);
}

// ─── 5. getPaymentsByStudent ──────────────────────────────────────────────────

/**
 * Returns confirmed payments for a student in a given academic year, newest first.
 * Composite index required: studentId ASC, academicYear ASC, paymentDate DESC.
 *
 * @param {string} studentId
 * @param {string} academicYear  - "YYYY-YY"
 * @returns {Promise<import('../types.js').FeePayment[]>}
 */
export async function getPaymentsByStudent(studentId, academicYear) {
  if (!studentId    || typeof studentId    !== "string") throw new Error("studentId is required");
  if (!academicYear || typeof academicYear !== "string") throw new Error("academicYear is required");

  const snap = await getDocs(
    query(
      paymentCol(),
      where("studentId",    "==", studentId),
      where("academicYear", "==", academicYear),
      where("status",       "==", PaymentStatus.CONFIRMED),
      orderBy("paymentDate", "desc")
    )
  );

  return snap.docs.map(_toDoc);
}

// ─── 6. getPaymentsBySchool ───────────────────────────────────────────────────

/**
 * Returns all confirmed payments for a school in a given academic year,
 * optionally filtered by date range. Used for collection reports.
 * Composite index required: schoolId ASC, academicYear ASC, status ASC, paymentDate DESC.
 *
 * @param {string} schoolId
 * @param {string} academicYear               - "YYYY-YY"
 * @param {{ from?: Date, to?: Date }} [dateRange]
 * @returns {Promise<import('../types.js').FeePayment[]>}
 */
export async function getPaymentsBySchool(schoolId, academicYear, dateRange) {
  if (!schoolId     || typeof schoolId     !== "string") throw new Error("schoolId is required");
  if (!academicYear || typeof academicYear !== "string") throw new Error("academicYear is required");

  const constraints = [
    where("schoolId",     "==", schoolId),
    where("academicYear", "==", academicYear),
    where("status",       "==", PaymentStatus.CONFIRMED),
  ];

  if (dateRange?.from instanceof Date) {
    constraints.push(where("paymentDate", ">=", dateRange.from));
  }
  if (dateRange?.to instanceof Date) {
    constraints.push(where("paymentDate", "<=", dateRange.to));
  }

  constraints.push(orderBy("paymentDate", "desc"));

  const snap = await getDocs(query(paymentCol(), ...constraints));
  return snap.docs.map(_toDoc);
}
