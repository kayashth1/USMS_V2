/**
 * PaymentAllocationEngine — Fee Management V2
 *
 * Pure allocation engine. No Firestore. No Firebase. No async. No side effects.
 *
 * Given a validated payment amount, a student fee profile, and a list of
 * outstanding installments, calculates how the payment should be distributed
 * across targets. Returns an in-memory AllocationPlan — nothing is persisted.
 *
 * Assumes PaymentValidator has already approved the payment. Does NOT repeat
 * payment validation.
 *
 * Allocation order (strict):
 *   1. Opening outstanding remaining (prior-year debt) — always first
 *   2. Installments in installmentNumber order (ascending)
 *      Within each installment: fee components in allocationPriority order
 *
 * Key invariant for component reconstruction:
 *   Because the same priority algorithm is always used, per-component state
 *   for a partially-paid installment can be reconstructed from
 *   (lineItems, totalAllocated) without loading prior PaymentAllocation records.
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Allocation to one fee component within one installment.
 * Matches the shape of PaymentAllocation.componentAllocations[].
 *
 * @typedef {Object} ComponentAllocation
 * @property {string} feeStructureId
 * @property {string} label
 * @property {number} allocatedAmount  - INR allocated to this component; > 0
 */

/**
 * Allocation to one installment, with component breakdown.
 *
 * @typedef {Object} InstallmentAllocation
 * @property {string}                installmentId
 * @property {number}                installmentNumber
 * @property {string}                period
 * @property {string}                periodLabel
 * @property {number}                allocatedAmount    - Total allocated to this installment
 * @property {number}                remainingBalance   - installment.balance − allocatedAmount
 * @property {ComponentAllocation[]} componentAllocations
 */

/**
 * Complete in-memory allocation plan returned to the caller.
 * The FeePaymentService uses this to construct FeePayment and
 * PaymentAllocation Firestore documents.
 *
 * @typedef {Object} AllocationPlan
 * @property {number}                  openingBalanceAllocation  - Allocated to prior-year debt
 * @property {InstallmentAllocation[]} installmentAllocations    - One entry per touched installment
 * @property {number}                  allocatedAmount           - paymentAmount − unallocatedAmount
 * @property {number}                  unallocatedAmount         - Remainder after all payable targets exhausted
 */

// ─── Helper: Sort and filter installments (rules 2, 3) ───────────────────────

/**
 * Returns installments eligible to receive allocation, sorted by installmentNumber
 * ascending.
 *
 * Excluded completely (rule 3):
 *   - status === "cancelled"
 *   - balance <= 0  (fully paid)
 *   - isLocked === true
 *
 * Sort key: installmentNumber ascending. Never by document ID.
 *
 * @param {import('./types.js').FeeInstallment[]} installments
 * @returns {import('./types.js').FeeInstallment[]}
 */
export function sortInstallments(installments) {
  return [...(Array.isArray(installments) ? installments : [])]
    .filter(inst =>
      inst.status !== "cancelled" &&
      !inst.isLocked &&
      (inst.balance ?? 0) > 0
    )
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
}

// ─── Helper: Opening balance allocation (rule 1) ──────────────────────────────

/**
 * Allocates as much of availablePayment as possible toward the opening
 * outstanding remaining balance.
 *
 * Rule 1: Opening outstanding is always settled before touching installments.
 *
 * @param {number} openingRemaining   - max(0, openingOutstanding − openingPaid)
 * @param {number} availablePayment   - Total payment available
 * @returns {{ allocated: number, remaining: number }}
 */
export function allocateOpeningBalance(openingRemaining, availablePayment) {
  const allocated = Math.min(openingRemaining, availablePayment);
  return { allocated, remaining: availablePayment - allocated };
}

// ─── Helper: Component allocation (rule 5) ───────────────────────────────────

/**
 * Distributes a payment across fee components within one installment using
 * allocationPriority order (lower number = higher priority).
 *
 * For partially-paid installments (totalAlreadyAllocated > 0), per-component
 * remaining balances are reconstructed by replaying totalAlreadyAllocated
 * through the same priority order. This is valid because the allocation
 * algorithm is deterministic — the same order is always used.
 *
 * Reconstruction example (Tuition ₹1500 prio 1, Transport ₹500 prio 2,
 * totalAlreadyAllocated = ₹1000):
 *   Tuition  already paid = min(1000, 1500) = 1000 → remaining = 500
 *   Transport already paid = min(0, 500) = 0       → remaining = 500
 *   New payment of ₹700:
 *     Tuition  → min(700, 500) = 500 → payment left = 200
 *     Transport → min(200, 500) = 200 → payment left = 0
 *   Result: [{ Tuition: 500 }, { Transport: 200 }]
 *
 * @param {import('./types.js').FeeLineItem[]} lineItems            - Face-value snapshot on the installment
 * @param {number}                             totalAlreadyAllocated - installment.totalAllocated
 * @param {number}                             newAllocation         - Amount to distribute now
 * @returns {ComponentAllocation[]}
 */
export function allocateComponentsByPriority(lineItems, totalAlreadyAllocated, newAllocation) {
  if (newAllocation === 0 || !Array.isArray(lineItems) || lineItems.length === 0) {
    return [];
  }

  // Sort by allocationPriority ascending (lower = higher priority = paid first)
  const sorted = [...lineItems].sort((a, b) => a.allocationPriority - b.allocationPriority);

  // Reconstruct per-component remaining balance from totalAlreadyAllocated
  let alreadyProcessed = totalAlreadyAllocated;
  const componentState = sorted.map(item => {
    const alreadyPaid = Math.min(alreadyProcessed, item.amount);
    alreadyProcessed -= alreadyPaid;
    return {
      feeStructureId: item.feeStructureId,
      label:          item.label,
      remaining:      item.amount - alreadyPaid,
    };
  });

  // Distribute newAllocation across components in priority order
  let toPay = newAllocation;
  const allocations = [];

  for (const comp of componentState) {
    if (toPay === 0) break;
    const alloc = Math.min(toPay, comp.remaining);
    toPay -= alloc;
    if (alloc > 0) {
      allocations.push({
        feeStructureId:  comp.feeStructureId,
        label:           comp.label,
        allocatedAmount: alloc,
      });
    }
  }

  return allocations;
}

// ─── Helper: Installment allocation (rules 4, 5) ─────────────────────────────

/**
 * Allocates up to paymentToAllocate toward one installment.
 *
 * Rule 4: Never allocate more than installment.balance.
 * Rule 5: Distribute the allocated amount across components by allocationPriority.
 *
 * @param {import('./types.js').FeeInstallment} installment
 * @param {number}                              paymentToAllocate  - Remaining payment budget
 * @returns {InstallmentAllocation}
 */
export function allocateInstallment(installment, paymentToAllocate) {
  // Rule 4: cap at installment balance
  const allocatedAmount  = Math.min(paymentToAllocate, installment.balance ?? 0);
  const remainingBalance = (installment.balance ?? 0) - allocatedAmount;

  // Rule 5: component breakdown by priority
  const componentAllocations = allocateComponentsByPriority(
    installment.lineItems       ?? [],
    installment.totalAllocated  ?? 0,
    allocatedAmount
  );

  return {
    installmentId:        installment.id,
    installmentNumber:    installment.installmentNumber,
    period:               installment.period,
    periodLabel:          installment.periodLabel,
    allocatedAmount,
    remainingBalance,
    componentAllocations,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Builds the complete allocation plan for a validated payment.
 *
 * Pure function — no I/O, no side effects. The same inputs always produce
 * the same output.
 *
 * Assumes PaymentValidator has already approved the payment. Does NOT
 * re-validate the payment request.
 *
 * Allocation pipeline:
 *   1. Compute openingRemaining (rule 1)
 *   2. Allocate openingRemaining first, deduct from budget
 *   3. Filter and sort installments (rule 2, 3)
 *   4. For each payable installment: allocate min(budget, balance) (rule 4)
 *      Distribute within the installment by component priority (rule 5)
 *   5. Stop when budget is exhausted or no payable targets remain (rule 6)
 *   6. Return unallocatedAmount for caller to handle (rule 7 — no credit created)
 *
 * @param {import('./types.js').StudentFeeProfile}  profile
 * @param {import('./types.js').FeeInstallment[]}   installments
 * @param {{ paymentAmount: number }}               paymentRequest
 * @returns {AllocationPlan}
 */
export function buildAllocationPlan(profile, installments, paymentRequest) {
  const totalPayment = paymentRequest.paymentAmount;

  // ── Rule 1: Opening outstanding first ────────────────────────────────────

  const openingRemaining = Math.max(
    0,
    (profile.openingOutstanding ?? 0) - (profile.openingPaid ?? 0)
  );

  const { allocated: openingBalanceAllocation, remaining: afterOpening } =
    allocateOpeningBalance(openingRemaining, totalPayment);

  // ── Rules 2, 3: Filter and sort installments ──────────────────────────────

  const payableInstallments = sortInstallments(installments);

  // ── Rules 4, 5, 6: Allocate to installments in order ─────────────────────

  let remainingPayment       = afterOpening;
  const installmentAllocations = [];

  for (const inst of payableInstallments) {
    if (remainingPayment === 0) break;  // Rule 6: stop when budget exhausted

    const allocation = allocateInstallment(inst, remainingPayment);
    remainingPayment -= allocation.allocatedAmount;
    installmentAllocations.push(allocation);
  }

  // ── Rule 7: Return unallocated remainder — do NOT create credit ───────────

  const unallocatedAmount = remainingPayment;
  const allocatedAmount   = totalPayment - unallocatedAmount;

  return {
    openingBalanceAllocation,
    installmentAllocations,
    allocatedAmount,
    unallocatedAmount,
  };
}
