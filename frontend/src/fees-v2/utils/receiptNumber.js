/**
 * ReceiptNumberGenerator — Fee Management V2
 *
 * Abstraction for generating sequential, unique receipt numbers.
 * The format (RCP-YYYYMMDD-XXXX) is encapsulated here. Swap implementations
 * by passing a different generator object to createPayment — no service code changes.
 *
 * Default implementation:
 *   Uses a per-school per-day Firestore counter document for sequential numbering.
 *   Counter reads happen inside the payment transaction so receipt numbers are
 *   guaranteed unique even under concurrent payment submissions.
 *
 * Generator interface:
 *   getRef(paymentDate: Date) → DocumentReference   — read inside the transaction
 *   generate(counterSnap, tx, paymentDate) → string — write counter + return receipt no
 *
 * The two-method split preserves the Firestore Web SDK requirement that all
 * transaction reads must happen before any transaction writes. Callers must
 * call getRef() → tx.get() → generate() in that order.
 */

import { doc } from "firebase/firestore";
import { db } from "@/config/firebase";

/** Firestore collection that holds per-school per-day receipt counters. */
const COUNTER_COLLECTION = "receiptCounters";

/**
 * Formats a Date as YYYYMMDD (zero-padded, local calendar).
 *
 * @param {Date} date
 * @returns {string}
 */
function _formatDate(date) {
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, "0");
  const d   = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Assembles a receipt number string from its constituent parts.
 * Override this function to change the receipt number format without
 * touching counter or transaction logic.
 *
 * @param {string} dateStr       - YYYYMMDD
 * @param {number} sequenceNumber - 1-based counter value for this school+day
 * @returns {string}               e.g. "RCP-20260709-0001"
 */
export function formatReceiptNo(dateStr, sequenceNumber) {
  return `RCP-${dateStr}-${String(sequenceNumber).padStart(4, "0")}`;
}

/**
 * Creates the default ReceiptNumberGenerator backed by a Firestore counter document.
 *
 * Counter document path: receiptCounters/{schoolId}_{YYYYMMDD}
 * Fields: { schoolId: string, date: string, count: number }
 *
 * @param {import('firebase/firestore').Firestore} firestoreDb
 * @param {string} schoolId
 * @returns {{ getRef: function, generate: function }}
 */
export function createReceiptNumberGenerator(firestoreDb, schoolId) {
  return {
    /**
     * Returns the DocumentReference for the counter document.
     * Call this BEFORE opening the transaction, or at the start of the
     * transaction's read phase. Pass the result to tx.get(), then to generate().
     *
     * @param {Date} paymentDate
     * @returns {import('firebase/firestore').DocumentReference}
     */
    getRef(paymentDate) {
      const d       = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
      const dateStr = _formatDate(d);
      return doc(firestoreDb, COUNTER_COLLECTION, `${schoolId}_${dateStr}`);
    },

    /**
     * Increments the counter and returns the formatted receipt number.
     * Must be called AFTER all transaction reads and BEFORE the service
     * writes its own documents.
     *
     * Calls tx.set() synchronously — no await, no async I/O.
     *
     * @param {import('firebase/firestore').DocumentSnapshot} counterSnap  - From tx.get(getRef(...))
     * @param {import('firebase/firestore').Transaction}      tx
     * @param {Date}                                          paymentDate
     * @returns {string}  Formatted receipt number
     */
    generate(counterSnap, tx, paymentDate) {
      const d       = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
      const dateStr = _formatDate(d);
      const current = counterSnap.exists() ? (counterSnap.data().count ?? 0) : 0;
      const next    = current + 1;

      // Write-back the incremented counter (synchronous — no await)
      tx.set(counterSnap.ref, { schoolId, date: dateStr, count: next }, { merge: true });

      return formatReceiptNo(dateStr, next);
    },
  };
}

/**
 * Convenience factory that uses the module-level `db` import.
 * Preferred for production code; pass explicit db/schoolId for tests.
 *
 * @param {string} schoolId
 * @returns {{ getRef: function, generate: function }}
 */
export function defaultReceiptGenerator(schoolId) {
  return createReceiptNumberGenerator(db, schoolId);
}
