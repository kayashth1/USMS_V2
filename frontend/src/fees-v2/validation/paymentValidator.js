/**
 * PaymentValidator — Fee Management V2
 *
 * Pure validation engine for payment acceptance.
 * No Firestore. No Firebase. No async. No side effects. No service calls.
 *
 * Determines whether a payment CAN be accepted against a student fee profile.
 * Does NOT create records, allocate amounts, or generate receipts.
 *
 * Used by:
 *   - FeePaymentService  — to gate payment creation at the service layer
 *   - UI layer           — to show real-time validation before submission
 */

import { ProfileStatus, PaymentMode } from "../constants/enums.js";

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Inbound payment data supplied by the caller before a payment is persisted.
 *
 * @typedef {Object} PaymentRequest
 * @property {number}       paymentAmount  - INR amount to collect; must be > 0
 * @property {string}       paymentMode    - "cash"|"upi"|"cheque"|"dd"|"online"
 * @property {Date|string}  paymentDate    - Date payment was received; required
 * @property {string}       collectedBy    - Staff name or UID; required
 * @property {string}       [remarks]      - Optional: cheque no., UTR, free-text note
 */

/**
 * Breakdown of how outstanding is composed.
 * Returned by calculateOutstanding and used internally by validateAmount.
 *
 * @typedef {Object} OutstandingBreakdown
 * @property {number} openingRemaining    - max(0, openingOutstanding − openingPaid)
 * @property {number} installmentBalance  - Sum of non-cancelled installment balances
 * @property {number} lockedBalance       - Portion of installmentBalance that is locked
 * @property {number} totalOutstanding    - openingRemaining + installmentBalance
 * @property {number} payableAmount       - totalOutstanding − lockedBalance
 *                                          (the maximum amount that can be accepted now)
 */

/**
 * Result returned by validatePayment.
 * Extends the base ValidationResult with computed outstanding figures.
 * totalOutstanding and payableAmount are always present so the UI can
 * display balances even when the payment is rejected.
 *
 * @typedef {Object} PaymentValidationResult
 * @property {boolean}  valid
 * @property {number}   totalOutstanding  - Total owed (locked + unlocked, excl. cancelled)
 * @property {number}   payableAmount     - Maximum amount that can be accepted right now
 * @property {string[]} errors
 */

// ─── Helper: Profile validation (rules 1, 2, 3) ───────────────────────────────

/**
 * Validates that the profile exists, is ACTIVE, and already has installments generated.
 *
 * Rule 1: Profile must exist.
 * Rule 2: Profile status must be ACTIVE.
 * Rule 3: Installments must already be generated.
 *
 * @param {import('../types.js').StudentFeeProfile|null|undefined} profile
 * @returns {string[]} errors
 */
export function validateProfile(profile) {
  const errors = [];

  // Rule 1
  if (!profile || typeof profile !== "object") {
    errors.push("student fee profile is required");
    return errors;  // Cannot evaluate rules 2/3 without a profile object
  }

  // Rule 2
  if (profile.status !== ProfileStatus.ACTIVE) {
    errors.push(
      `profile status must be "${ProfileStatus.ACTIVE}"; ` +
      `current status is "${profile.status ?? "unknown"}"`
    );
  }

  // Rule 3
  if (!profile.installmentsGenerated) {
    errors.push(
      "installments have not yet been generated for this profile; " +
      "a payment cannot be accepted until the fee schedule is generated"
    );
  }

  return errors;
}

// ─── Helper: Installment list validation ─────────────────────────────────────

/**
 * Validates the structural integrity of the installments array.
 *
 * Cancelled and locked installments are expected in the list.
 * Their effect on outstanding is handled by calculateOutstanding (rules 8, 9).
 *
 * @param {unknown} installments
 * @returns {string[]} errors
 */
export function validateInstallments(installments) {
  const errors = [];

  if (!Array.isArray(installments)) {
    errors.push("installments must be an array");
  }

  return errors;
}

// ─── Helper: Payment mode validation (rule 5) ────────────────────────────────

/**
 * Validates that paymentMode is one of the recognised values.
 *
 * Rule 5: Allowed modes are cash, upi, cheque, dd, online.
 *
 * @param {string|undefined} paymentMode
 * @returns {string[]} errors
 */
export function validateMode(paymentMode) {
  const errors  = [];
  const allowed = Object.values(PaymentMode);

  if (!paymentMode) {
    errors.push("paymentMode is required");
  } else if (!allowed.includes(paymentMode)) {
    errors.push(
      `paymentMode must be one of: ${allowed.join(", ")}; received "${paymentMode}"`
    );
  }

  return errors;
}

// ─── Helper: Outstanding calculation (rules 6, 7, 8, 9) ──────────────────────

/**
 * Computes outstanding and payable amounts from the profile and installment list.
 *
 * Rule 8: Cancelled installments are excluded entirely.
 * Rule 9: Locked installments contribute to totalOutstanding but NOT payableAmount.
 *         Opening outstanding remaining has no lock concept and is always payable.
 *
 * @param {import('../types.js').StudentFeeProfile}    profile
 * @param {import('../types.js').FeeInstallment[]}     installments
 * @returns {OutstandingBreakdown}
 */
export function calculateOutstanding(profile, installments) {
  const openingRemaining = Math.max(
    0,
    (profile.openingOutstanding ?? 0) - (profile.openingPaid ?? 0)
  );

  let installmentBalance = 0;
  let lockedBalance      = 0;

  for (const inst of (Array.isArray(installments) ? installments : [])) {
    // Rule 8: skip cancelled installments entirely
    if (inst.status === "cancelled") continue;

    const bal = typeof inst.balance === "number" ? inst.balance : 0;
    installmentBalance += bal;

    // Rule 9: track locked portion so it can be excluded from payableAmount
    if (inst.isLocked) {
      lockedBalance += bal;
    }
  }

  const totalOutstanding = openingRemaining + installmentBalance;
  const payableAmount    = totalOutstanding - lockedBalance;

  return {
    openingRemaining,
    installmentBalance,
    lockedBalance,
    totalOutstanding,
    payableAmount,
  };
}

// ─── Helper: Amount validation (rules 4, 6, 7, 9) ────────────────────────────

/**
 * Validates the payment amount against the outstanding breakdown.
 *
 * Rule 4: paymentAmount must be present, numeric, and > 0.
 * Rule 7: Reject if totalOutstanding is zero (nothing owed).
 * Rule 9: Reject if payableAmount is zero (everything outstanding is locked).
 * Rule 6: paymentAmount must not exceed payableAmount.
 *
 * Stops early within this function when fundamental amount problems are found
 * (e.g., missing or non-numeric), because subsequent checks would be meaningless.
 * Cross-rule collection is handled at the top level in validatePayment.
 *
 * @param {unknown} paymentAmount
 * @param {number}  totalOutstanding
 * @param {number}  payableAmount
 * @returns {string[]} errors
 */
export function validateAmount(paymentAmount, totalOutstanding, payableAmount) {
  const errors = [];

  // Rule 4: required
  if (paymentAmount === null || paymentAmount === undefined) {
    errors.push("paymentAmount is required");
    return errors;
  }

  // Rule 4: numeric
  if (typeof paymentAmount !== "number" || isNaN(paymentAmount)) {
    errors.push("paymentAmount must be a number");
    return errors;
  }

  // Rule 4: greater than zero
  if (paymentAmount <= 0) {
    errors.push("paymentAmount must be greater than zero");
    return errors;
  }

  // Rule 7: nothing owed at all
  if (totalOutstanding === 0) {
    errors.push("no outstanding balance — all dues are already cleared");
    return errors;
  }

  // Rule 9 (expressed as amount): all outstanding is locked
  if (payableAmount === 0) {
    errors.push(
      "all outstanding installments are currently locked and cannot receive payments; " +
      "contact the administrator to unlock a period before collecting"
    );
    return errors;
  }

  // Rule 6: cannot exceed payable amount (overpayment not supported)
  if (paymentAmount > payableAmount) {
    errors.push(
      `paymentAmount (₹${paymentAmount}) exceeds the payable amount (₹${payableAmount}); ` +
      "overpayment is not supported"
    );
  }

  return errors;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Validates whether a payment can be accepted for a student fee profile.
 *
 * Pure function — no I/O, no side effects, always returns the same output
 * for the same inputs.
 *
 * Collects ALL validation errors before returning (rule 10 — no early exit).
 * totalOutstanding and payableAmount are always computed and returned so the
 * UI can display balances even when the result is invalid.
 *
 * Validation pipeline:
 *   validateProfile(profile)               → rules 1, 2, 3
 *   validateInstallments(installments)     → structural check
 *   validateMode(paymentMode)              → rule 5
 *   calculateOutstanding(profile, inst)    → rules 8, 9 (filter logic)
 *   validateAmount(amount, total, payable) → rules 4, 6, 7, 9
 *   paymentDate / collectedBy checks       → required field guards
 *
 * @param {import('../types.js').StudentFeeProfile|null}  profile
 * @param {import('../types.js').FeeInstallment[]}        installments
 * @param {PaymentRequest}                                paymentRequest
 * @returns {PaymentValidationResult}
 */
export function validatePayment(profile, installments, paymentRequest) {
  const errors = [];
  const req    = paymentRequest ?? {};

  // ── Rules 1, 2, 3: Profile ─────────────────────────────────────────────────
  errors.push(...validateProfile(profile));

  // ── Structural check: installments ────────────────────────────────────────
  errors.push(...validateInstallments(installments));

  // ── Rule 5: Payment mode ───────────────────────────────────────────────────
  errors.push(...validateMode(req.paymentMode));

  // ── Rules 8, 9: Outstanding calculation ───────────────────────────────────
  // Always computed even when profile/installments have errors, so the UI
  // always receives totalOutstanding and payableAmount for display.
  const { totalOutstanding, payableAmount } =
    profile && Array.isArray(installments)
      ? calculateOutstanding(profile, installments)
      : { totalOutstanding: 0, payableAmount: 0 };

  // ── Rules 4, 6, 7, 9: Amount ──────────────────────────────────────────────
  errors.push(...validateAmount(req.paymentAmount, totalOutstanding, payableAmount));

  // ── Required request fields ────────────────────────────────────────────────
  if (!req.collectedBy || typeof req.collectedBy !== "string" || req.collectedBy.trim() === "") {
    errors.push("collectedBy is required");
  }

  if (req.paymentDate === null || req.paymentDate === undefined) {
    errors.push("paymentDate is required");
  } else {
    const d = req.paymentDate instanceof Date
      ? req.paymentDate
      : new Date(req.paymentDate);
    if (isNaN(d.getTime())) {
      errors.push("paymentDate is not a valid date");
    }
  }

  return {
    valid: errors.length === 0,
    totalOutstanding,
    payableAmount,
    errors,
  };
}
