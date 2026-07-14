/**
 * PaymentCancellationService — Fee Management V2
 *
 * Reverses a previously confirmed FeePayment.
 *
 * Design principles:
 *   - No financial recalculation — only reverses what was persisted
 *   - No document deletions — audit history is preserved in full
 *   - ONE Firestore transaction — all-or-nothing; any failure rolls back completely
 *   - Strict read-before-write — Firestore Web SDK constraint honoured
 *
 * Documents mutated per cancellation:
 *   1 × FeePayment              status → cancelled, cancelledAt/By/Reason set
 *   N × PaymentAllocation       isReversed → true, reversedAt set (NOT deleted)
 *   1 × StudentFeeProfile       openingPaid decremented (only if opening balance was allocated)
 *   N × FeeInstallment          totalAllocated decremented, balance restored, status re-derived
 *
 * Documents NOT touched:
 *   FeeInstallment.grossAmount, discountAmount, lineItems  — never modified
 *   FeePayment.receiptNo, allocationSummary                — receipt remains valid
 *   PaymentAllocation (body)                               — only flags stamped, no content deleted
 */

import {
  collection, doc, getDoc, getDocs, runTransaction, serverTimestamp,
  query, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import {
  PaymentStatus,
  InstallmentStatus,
  AllocationTarget,
} from "../constants/enums.js";

// ─── Private utilities ────────────────────────────────────────────────────────

/**
 * Reads the allocated amount from a PaymentAllocation document, tolerating
 * both the `allocatedAmount` field name and the legacy `amount` field name.
 *
 * @param {Object} alloc
 * @returns {number}
 */
function _getAllocatedAmount(alloc) {
  const v = alloc.allocatedAmount ?? alloc.amount;
  return typeof v === "number" ? v : 0;
}

/**
 * Derives the installment status after a partial or full reversal.
 *
 * Three-state model (the payment service does not know the current date
 * relative to the due date; overdue / upcoming transitions are handled
 * by a separate date-aware operation):
 *   newBalance === 0          → paid   (other payments still cover the full amount)
 *   newBalance >= netAmount   → due    (fully reversed; nothing remains allocated)
 *   otherwise                 → partial (some OTHER payment partially covers it)
 *
 * @param {number} newBalance
 * @param {number} netAmount
 * @returns {string} InstallmentStatus value
 */
function _deriveStatusAfterReversal(newBalance, netAmount) {
  if (newBalance <= 0)         return InstallmentStatus.PAID;
  if (newBalance >= netAmount) return InstallmentStatus.DUE;
  return InstallmentStatus.PARTIAL;
}

// ─── Helper methods (exported for unit testability) ───────────────────────────

/**
 * Loads the FeePayment document and all its PaymentAllocation documents
 * from Firestore. Validates that the payment is CONFIRMED before proceeding.
 *
 * Runs OUTSIDE the transaction (Firestore SDK prohibits queries inside
 * runTransaction). The refs returned are re-used for the transaction reads.
 *
 * @param {string} paymentId
 * @returns {Promise<{
 *   payment:    Object,
 *   paymentRef: import('firebase/firestore').DocumentReference,
 *   allocations: Object[],
 *   allocRefs:  import('firebase/firestore').DocumentReference[],
 * }>}
 * @throws {Error} if payment not found or not CONFIRMED
 */
export async function loadPayment(paymentId) {
  if (!paymentId || typeof paymentId !== "string") {
    throw new Error("paymentId is required");
  }

  const paymentRef  = doc(db, COLLECTIONS.FEE_PAYMENTS, paymentId);
  const paymentSnap = await getDoc(paymentRef);

  if (!paymentSnap.exists()) {
    throw new Error(`Payment "${paymentId}" not found`);
  }

  const payment = { id: paymentSnap.id, ...paymentSnap.data() };

  // Rule 1: only CONFIRMED payments may be cancelled
  if (payment.status !== PaymentStatus.CONFIRMED) {
    throw new Error(
      `Payment "${paymentId}" cannot be cancelled: ` +
      `current status is "${payment.status}", only "confirmed" payments may be cancelled`
    );
  }

  // Load all PaymentAllocation documents for this payment (query runs outside transaction)
  const allocSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS),
      where("paymentId", "==", paymentId)
    )
  );

  const allocations = allocSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allocRefs   = allocSnap.docs.map(d => d.ref);

  return { payment, paymentRef, allocations, allocRefs };
}

/**
 * WRITE PHASE: Marks the FeePayment document as cancelled.
 *
 * Sets status, cancelledAt, cancelledBy, cancellationReason.
 * Does NOT touch receiptNo, allocationSummary, or any amount fields —
 * the receipt remains a valid record of the (now-cancelled) payment.
 *
 * Must be called inside a Firestore transaction, after all reads.
 *
 * @param {import('firebase/firestore').Transaction}         tx
 * @param {import('firebase/firestore').DocumentReference}   paymentRef
 * @param {string}                                           cancelledBy
 * @param {string}                                           cancellationReason
 * @param {import('firebase/firestore').FieldValue}          now  - serverTimestamp()
 */
export function markPaymentCancelled(tx, paymentRef, cancelledBy, cancellationReason, now) {
  tx.update(paymentRef, {
    status:             PaymentStatus.CANCELLED,
    cancelledAt:        now,
    cancelledBy:        cancelledBy ?? null,
    cancellationReason: cancellationReason ?? null,
    updatedAt:          now,
  });
}

/**
 * WRITE PHASE: Stamps isReversed=true and reversedAt on each PaymentAllocation
 * document. Documents are NOT deleted — they are permanently preserved for
 * audit history.
 *
 * Must be called inside a Firestore transaction, after all reads.
 *
 * @param {import('firebase/firestore').Transaction}           tx
 * @param {import('firebase/firestore').DocumentReference[]}   allocRefs
 * @param {import('firebase/firestore').FieldValue}            now
 */
export function markAllocationsReversed(tx, allocRefs, now) {
  for (const ref of allocRefs) {
    tx.update(ref, {
      isReversed: true,
      reversedAt: now,
    });
  }
}

/**
 * WRITE PHASE: Decrements profile.openingPaid by the reversed opening-balance
 * amount. Never modifies openingOutstanding.
 *
 * Floor: openingPaid is clamped at 0 to guard against data inconsistency.
 *
 * Must be called inside a Firestore transaction, after all reads.
 *
 * @param {import('firebase/firestore').Transaction}           tx
 * @param {import('firebase/firestore').DocumentReference}     profileRef
 * @param {import('firebase/firestore').DocumentSnapshot}      profileSnap
 * @param {number}                                             reversalAmount
 * @param {import('firebase/firestore').FieldValue}            now
 */
export function reverseOpeningBalance(tx, profileRef, profileSnap, reversalAmount, now) {
  const currentOpeningPaid = profileSnap.data().openingPaid ?? 0;
  const newOpeningPaid     = Math.max(0, currentOpeningPaid - reversalAmount);

  tx.update(profileRef, {
    openingPaid: newOpeningPaid,
    updatedAt:   now,
  });
}

/**
 * WRITE PHASE: Reverses each affected installment's totalAllocated and balance,
 * then re-derives the installment status.
 *
 * Fields NOT modified: grossAmount, discountAmount, lineItems, dueDate, period,
 * periodLabel, isLocked, cancelledAt, cancellationReason.
 *
 * Balance ceiling: `Math.min(netAmount, balance + reversalAmount)` — guards
 * against over-restoration if data has drifted due to an edge case.
 *
 * Must be called inside a Firestore transaction, after all reads.
 *
 * @param {import('firebase/firestore').Transaction}           tx
 * @param {import('firebase/firestore').DocumentReference[]}   instRefs
 * @param {import('firebase/firestore').DocumentSnapshot[]}    instSnaps   - Parallel to instRefs
 * @param {Map<string, number>}                                reversalAmountByInstallmentId
 *   Map from installment document ID to the amount being reversed on that installment.
 * @param {import('firebase/firestore').FieldValue}            now
 */
export function reverseInstallments(tx, instRefs, instSnaps, reversalAmountByInstallmentId, now) {
  for (let i = 0; i < instRefs.length; i++) {
    const ref         = instRefs[i];
    const data        = instSnaps[i].data();
    const reversalAmt = reversalAmountByInstallmentId.get(ref.id) ?? 0;

    const newTotalAllocated = Math.max(0, (data.totalAllocated ?? 0) - reversalAmt);

    // Restore balance, but never exceed netAmount (ceiling guard)
    const netAmount  = data.netAmount ?? 0;
    const newBalance = Math.min(netAmount, (data.balance ?? 0) + reversalAmt);

    const newStatus = _deriveStatusAfterReversal(newBalance, netAmount);

    tx.update(ref, {
      totalAllocated: newTotalAllocated,
      balance:        newBalance,
      status:         newStatus,
      updatedAt:      now,
    });
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Cancels a confirmed FeePayment and reverses all of its Firestore side-effects
 * inside a single atomic transaction.
 *
 * No financial recalculation is performed. Every number written back is derived
 * by undoing the original allocation arithmetic (subtract, not recompute).
 *
 * Pipeline:
 *   1. Pre-flight (outside transaction):
 *        a. Load and validate the FeePayment (must be CONFIRMED).
 *        b. Load all PaymentAllocation documents for this payment.
 *        c. Build reversalAmountByInstallmentId map and total opening reversal.
 *
 *   2. READ PHASE (inside transaction — all tx.get() calls):
 *        a. Re-read FeePayment  — concurrency guard (catches concurrent cancellations).
 *        b. Re-read StudentFeeProfile — needed for fresh openingPaid value (only
 *           if at least one opening-balance allocation exists).
 *        c. Re-read each affected FeeInstallment — needed for fresh balance /
 *           totalAllocated values.
 *
 *   3. WRITE PHASE (all synchronous — no await):
 *        a. markPaymentCancelled  → FeePayment.status = "cancelled"
 *        b. markAllocationsReversed → PaymentAllocation.isReversed = true
 *        c. reverseOpeningBalance   → profile.openingPaid decremented
 *        d. reverseInstallments     → installment.balance restored, status re-derived
 *
 * @param {string} paymentId
 * @param {string} cancellationReason
 * @param {string} cancelledBy         - Admin UID
 * @returns {Promise<void>}
 * @throws {Error} if payment not found, not CONFIRMED, or concurrent cancellation detected
 */
export async function cancelPayment(paymentId, cancellationReason, cancelledBy) {
  // ── Step 1: Pre-flight loads (outside transaction) ─────────────────────────

  const { payment, paymentRef, allocations, allocRefs } = await loadPayment(paymentId);

  // Separate opening-balance allocations from installment allocations
  const openingAllocs = allocations.filter(
    a => a.allocationTarget === AllocationTarget.OPENING_BALANCE
  );
  const instAllocations = allocations.filter(
    a => a.allocationTarget === AllocationTarget.INSTALLMENT
  );

  // Aggregate reversal amounts per installment (handles the theoretical case
  // of multiple allocations targeting the same installment for this payment)
  const reversalAmountByInstallmentId = new Map();
  for (const alloc of instAllocations) {
    const prev = reversalAmountByInstallmentId.get(alloc.installmentId) ?? 0;
    reversalAmountByInstallmentId.set(alloc.installmentId, prev + _getAllocatedAmount(alloc));
  }

  const totalOpeningReversal = openingAllocs.reduce(
    (sum, a) => sum + _getAllocatedAmount(a),
    0
  );

  // Pre-build refs for unique installment IDs (query ran outside; re-use in transaction)
  const instIds  = [...reversalAmountByInstallmentId.keys()];
  const instRefs = instIds.map(id => doc(db, COLLECTIONS.FEE_INSTALLMENTS, id));

  // Profile ref needed only if opening balance is being reversed
  const profileRef = totalOpeningReversal > 0 && payment.feeProfileId
    ? doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, payment.feeProfileId)
    : null;

  // ── Step 2–3: Atomic transaction ───────────────────────────────────────────

  await runTransaction(db, async (tx) => {

    // ── READ PHASE ──────────────────────────────────────────────────────────
    // All tx.get() calls must complete before any tx.update() is issued.

    // a. Re-read the payment: concurrency guard against duplicate cancellations
    const freshPaymentSnap = await tx.get(paymentRef);
    if (!freshPaymentSnap.exists()) {
      throw new Error(`Payment "${paymentId}" not found`);
    }
    if (freshPaymentSnap.data().status !== PaymentStatus.CONFIRMED) {
      throw new Error(
        `Concurrent cancellation detected: payment "${paymentId}" is no longer CONFIRMED`
      );
    }

    // b. Re-read profile (only when opening balance is being reversed)
    let profileSnap = null;
    if (profileRef) {
      profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists()) {
        throw new Error(`Fee profile "${payment.feeProfileId}" not found`);
      }
    }

    // c. Re-read each affected installment (get fresh balance/totalAllocated)
    const instSnaps = await Promise.all(instRefs.map(r => tx.get(r)));
    for (let i = 0; i < instSnaps.length; i++) {
      if (!instSnaps[i].exists()) {
        throw new Error(`Installment "${instIds[i]}" not found`);
      }
    }

    // ── WRITE PHASE ─────────────────────────────────────────────────────────
    // No await after this point — all writes are synchronous tx.update() calls.

    const now = serverTimestamp();

    // a. Mark the payment cancelled
    markPaymentCancelled(tx, paymentRef, cancelledBy, cancellationReason, now);

    // b. Stamp isReversed on every PaymentAllocation (never delete)
    markAllocationsReversed(tx, allocRefs, now);

    // c. Reverse the opening balance on the profile (if applicable)
    if (profileRef && profileSnap) {
      reverseOpeningBalance(tx, profileRef, profileSnap, totalOpeningReversal, now);
    }

    // d. Restore each installment's balance and re-derive its status
    if (instRefs.length > 0) {
      reverseInstallments(tx, instRefs, instSnaps, reversalAmountByInstallmentId, now);
    }
  });
}
