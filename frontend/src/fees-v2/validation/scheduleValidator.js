/**
 * ScheduleValidator — Fee Management V2
 *
 * Pure validation engine for generated schedules.
 * No Firestore. No Firebase. No async. No side effects.
 *
 * Run after FeeScheduleGenerator, before persistence.
 * Returns ALL validation errors; does not stop at the first failure.
 */

/**
 * Validates an in-memory schedule before it is written to Firestore.
 *
 * All rules are checked in every call — early failures do not prevent
 * later rules from being evaluated.
 *
 * Rules:
 *   1.  Installment numbers must be sequential starting at 1.
 *   2.  Period keys must be unique across all entries.
 *   3.  Every dueDate must be a valid Date instance.
 *   4.  grossAmount >= netAmount for each entry.
 *   5.  balance === netAmount for each entry (no payments exist yet).
 *   6.  adjustmentAmount <= grossAmount for each entry.
 *   7.  grossAmount, netAmount, adjustmentAmount, balance must all be >= 0.
 *   8.  feeStructureId must be unique within each entry's lineItems.
 *   9.  |sum(netAmounts) − profile.netAnnualFee| <= toleranceInr (default ₹1).
 *
 * @param {import('../feeScheduleGenerator.js').ScheduleEntry[]} entries
 * @param {import('../types.js').StudentFeeProfile} profile
 * @param {Object}  [options]
 * @param {number}  [options.toleranceInr=1]  - Max allowed rupee difference between
 *                                              sum(netAmounts) and profile.netAnnualFee.
 *                                              Accommodates integer rounding across periods.
 * @returns {import('../types.js').ValidationResult}
 */
export function validateSchedule(entries, profile, { toleranceInr = 1 } = {}) {
  const errors = [];

  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push("schedule must contain at least one entry");
    return { valid: false, errors };
  }

  // Track periods for rule 2 (evaluated alongside per-entry rules)
  const seenPeriods = new Set();

  entries.forEach((entry, i) => {
    const at = `installment ${i + 1} (period: ${entry?.period ?? "?"})`;

    // ── Rule 1: Sequential installment numbers ─────────────────────────────
    if (entry.installmentNumber !== i + 1) {
      errors.push(
        `${at}: installmentNumber must be ${i + 1}, got ${entry.installmentNumber}`
      );
    }

    // ── Rule 2: Unique period keys ─────────────────────────────────────────
    if (seenPeriods.has(entry.period)) {
      errors.push(`${at}: duplicate period key "${entry.period}"`);
    }
    seenPeriods.add(entry.period);

    // ── Rule 3: Valid due date ─────────────────────────────────────────────
    if (!(entry.dueDate instanceof Date) || isNaN(entry.dueDate.getTime())) {
      errors.push(`${at}: dueDate is not a valid Date`);
    }

    // ── Rule 7: Non-negative values ────────────────────────────────────────
    // Checked before rules 4/5/6 so those comparisons are only run on valid numbers.
    const grossOk =
      typeof entry.grossAmount === "number" && entry.grossAmount >= 0;
    const netOk =
      typeof entry.netAmount === "number" && entry.netAmount >= 0;
    const adjOk =
      typeof entry.adjustmentAmount === "number" && entry.adjustmentAmount >= 0;
    const balOk =
      typeof entry.balance === "number" && entry.balance >= 0;

    if (!grossOk) errors.push(`${at}: grossAmount must be a non-negative number`);
    if (!netOk)   errors.push(`${at}: netAmount must be a non-negative number`);
    if (!adjOk)   errors.push(`${at}: adjustmentAmount must be a non-negative number`);
    if (!balOk)   errors.push(`${at}: balance must be a non-negative number`);

    if (grossOk && netOk && adjOk && balOk) {
      // ── Rule 4: grossAmount >= netAmount ───────────────────────────────
      if (entry.grossAmount < entry.netAmount) {
        errors.push(
          `${at}: grossAmount (${entry.grossAmount}) must be >= netAmount (${entry.netAmount})`
        );
      }

      // ── Rule 5: balance === netAmount ──────────────────────────────────
      if (entry.balance !== entry.netAmount) {
        errors.push(
          `${at}: balance (${entry.balance}) must equal netAmount (${entry.netAmount}) ` +
          "— no payments exist at generation time"
        );
      }

      // ── Rule 6: adjustmentAmount <= grossAmount ────────────────────────
      if (entry.adjustmentAmount > entry.grossAmount) {
        errors.push(
          `${at}: adjustmentAmount (${entry.adjustmentAmount}) cannot exceed ` +
          `grossAmount (${entry.grossAmount})`
        );
      }
    }

    // ── Rule 8: No duplicate fee components within one installment ─────────
    if (Array.isArray(entry.lineItems)) {
      const seenComponents = new Set();
      entry.lineItems.forEach((item, j) => {
        if (seenComponents.has(item.feeStructureId)) {
          errors.push(
            `${at}: duplicate feeStructureId "${item.feeStructureId}" in lineItems[${j}]`
          );
        }
        seenComponents.add(item.feeStructureId);
      });
    }
  });

  // ── Rule 9: sum(netAmounts) ≈ profile.netAnnualFee ──────────────────────────
  const sumNet = entries.reduce(
    (acc, e) => acc + (typeof e.netAmount === "number" ? e.netAmount : 0),
    0
  );
  const expected = typeof profile.netAnnualFee === "number" ? profile.netAnnualFee : 0;
  const diff     = Math.abs(sumNet - expected);

  if (diff > toleranceInr) {
    errors.push(
      `sum of netAmounts across all installments (₹${sumNet}) does not match ` +
      `profile.netAnnualFee (₹${expected}); ` +
      `difference ₹${diff} exceeds tolerance of ₹${toleranceInr}`
    );
  }

  return { valid: errors.length === 0, errors };
}
