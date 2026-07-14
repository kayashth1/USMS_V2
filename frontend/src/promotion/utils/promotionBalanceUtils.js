/**
 * promotionBalanceUtils — Student Promotion module
 *
 * Single source of truth for computing a student's outstanding balance and
 * remaining credit at the time a promotion batch is being set up.
 *
 * Used by:
 *   PromotionWizard      — captures the snapshot into StudentPromotion at creation
 *   PromotionPreviewStep — drives the Outstanding / Credit columns in the preview table
 *
 * The PromotionEngine (buildPromotionPlan / carryBalances) reads the snapshot
 * already stored on StudentPromotion; it never re-computes from installments.
 * The PromotionExecution service does the same. Fixing the snapshot at creation
 * time is therefore sufficient to fix execution as well.
 *
 * Formula (mirrors calculateOutstanding in fees-v2/validation/paymentValidator.js):
 *
 *   openingRemaining   = max(0, profile.openingOutstanding − profile.openingPaid)
 *   installmentBalance = Σ(balance of non-cancelled installments)
 *   outstanding        = openingRemaining + installmentBalance
 *   credit             = profile.openingCredit
 */

/**
 * Computes the actual outstanding balance and opening credit for one student.
 *
 * @param {Object|null} profile
 *   StudentFeeProfile for the current (from) academic year.
 *   Pass null when the student has no fee profile — returns zeros.
 *
 * @param {Object[]} installments
 *   FeeInstallment documents for this profile (may be empty for DRAFT profiles).
 *
 * @returns {{ outstanding: number, credit: number }}
 */
export function computeStudentBalances(profile, installments) {
  if (!profile) return { outstanding: 0, credit: 0 };

  const openingRemaining = Math.max(
    0,
    (profile.openingOutstanding ?? 0) - (profile.openingPaid ?? 0)
  );

  const installmentBalance = (Array.isArray(installments) ? installments : [])
    .filter((inst) => inst.status !== "cancelled")
    .reduce((sum, inst) => sum + (typeof inst.balance === "number" ? inst.balance : 0), 0);

  return {
    outstanding: openingRemaining + installmentBalance,
    credit:      profile.openingCredit ?? 0,
  };
}
