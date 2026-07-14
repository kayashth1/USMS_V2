/**
 * FeeRevisionEngine — Fee Management V2
 *
 * Pure calculation engine. No Firestore. No Firebase. No async. No side effects.
 *
 * Given a StudentFeeProfile, FeeInstallments[], and a FeeRevisionDoc,
 * computes a RevisionPlan that describes exactly what would change if the
 * revision were applied. Nothing is persisted — the caller (service layer)
 * reads the plan and performs the actual Firestore writes.
 *
 * The same inputs always produce the same output (referentially transparent).
 *
 * Calculation pipeline (see computeRevisionPlan):
 *   1. Find open installments from effectiveInstallment onwards
 *   2. Build mutable engine state (only line-item and revision-adjustment slices)
 *   3. Apply each change in revision.changes[] sequentially
 *   4. Pre-compute adjustment metadata for revision-introduced adjustments ONLY
 *   5. Recalculate each affected installment:
 *        a. Rebuild line items from revised feeLineItems + pinned items
 *        b. Carry original inst.discountAmount forward (frozen — never redistributed)
 *        c. Add discount contribution from revision adjustments only
 *        d. Derive netAmount and balance
 *   6. Build and return RevisionPlan { affectedInstallments, summary }
 *
 * Invariants preserved:
 *   - Paid and cancelled installments are never in affectedInstallments
 *   - totalAllocated is never modified — balance = newNetAmount − totalAllocated
 *   - Existing discounts are carried as-is from inst.discountAmount; they are
 *     never recomputed or redistributed across the remaining open installments
 *   - One-time fees introduced by a revision appear on effectiveInstallment only,
 *     not on installment #1 of the academic year
 *   - Unknown revisionType values throw immediately — financial engines fail loudly
 */

import { RevisionType } from "./constants/enums.js";
import {
  generateLineItemsForPeriod,
  calculateGrossAmount,
  applyAdjustments,
  calculateNetAmount,
  isPeriodEligible,
} from "./feeScheduleGenerator.js";

// ─── Internal type definitions ────────────────────────────────────────────────

/**
 * Mutable in-memory state used during a single computeRevisionPlan() call.
 *
 * IMPORTANT — feeAdjustments from the original profile are NOT stored here.
 * Existing discounts are read directly from inst.discountAmount (frozen).
 * Only adjustments introduced by the current revision live in revisionAdjustments.
 *
 * @typedef {Object} EngineState
 * @property {import('./types.js').FeeLineItem[]}   feeLineItems          - Recurring components; mutated by ADD/REMOVE/CORRECTION changes
 * @property {import('./types.js').FeeAdjustment[]} revisionAdjustments   - NEW adjustments from SCHOLARSHIP/WAIVER changes only; never contains pre-existing profile adjustments
 * @property {PinnedLineItem[]}                     pinnedItems           - One-time items tied to a specific period (fines and one-time add-fee changes)
 */

/**
 * A line item pinned to one specific installment period.
 * Used for: FINE charges, and one-time fee components added via revision
 * (so they appear on effectiveInstallment rather than installment #1).
 *
 * @typedef {Object} PinnedLineItem
 * @property {string}                           period    - The installment period this item appears in
 * @property {import('./types.js').FeeLineItem} lineItem
 */

/**
 * Snapshot of calculated values for one installment (before or after revision).
 *
 * @typedef {Object} InstallmentValues
 * @property {import('./types.js').FeeLineItem[]} lineItems
 * @property {number} grossAmount
 * @property {number} discountAmount
 * @property {number} netAmount
 * @property {number} balance
 */

/**
 * Per-installment record of what would change if the revision were applied.
 * Includes audit fields so preview screens and history views can link back
 * to the originating revision without an additional Firestore fetch.
 *
 * @typedef {Object} InstallmentDiff
 * @property {string}            installmentId
 * @property {string}            period
 * @property {string}            periodLabel
 * @property {string}            revisionId    - FK → feeRevisions; the revision that produced this diff
 * @property {string[]}          revisionType  - Distinct revisionType values from revision.changes[]; may have multiple entries for multi-change revisions
 * @property {string}            reason        - The revision's reason field; surfaced for audit history
 * @property {InstallmentValues} oldValues
 * @property {InstallmentValues} newValues
 * @property {{ grossAmount: number, discountAmount: number, netAmount: number, balance: number }} difference
 */

/**
 * Aggregate change summary for the entire revision.
 *
 * @typedef {Object} RevisionSummary
 * @property {number} increase       - Total net amount increase across affected installments (student owes more)
 * @property {number} decrease       - Total net amount decrease across affected installments; always a positive number
 * @property {number} netDifference  - increase − decrease; positive = net cost increase, negative = net saving
 */

/**
 * The output of computeRevisionPlan.
 *
 * @typedef {Object} RevisionPlan
 * @property {InstallmentDiff[]} affectedInstallments  - Ordered by installmentNumber ascending; empty if nothing changes
 * @property {RevisionSummary}   summary
 */

// ─── Period helpers ───────────────────────────────────────────────────────────

// First month (1-indexed) of each quarter Q1–Q4
const QUARTER_FIRST_MONTHS = [4, 7, 10, 1];

// All months (1-indexed) in each quarter
const QUARTER_MONTHS = [
  [4, 5, 6],    // Q1
  [7, 8, 9],    // Q2
  [10, 11, 12], // Q3
  [1, 2, 3],    // Q4
];

function _pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * Returns true if periodB's position in the schedule is >= periodA.
 * Handles both "YYYY-MM" (monthly) and "Q{n}-YYYY-YY" (quarterly) formats.
 *
 * @param {string} periodA  - Boundary (effectiveInstallment)
 * @param {string} periodB  - Installment period to test
 * @returns {boolean}
 */
function _periodGte(periodA, periodB) {
  if (!periodA.startsWith("Q") && !periodB.startsWith("Q")) {
    // Both monthly — ISO "YYYY-MM" lexicographic ordering is correct
    return periodB >= periodA;
  }
  // Both quarterly — compare by sortable index
  return _qIndex(periodB) >= _qIndex(periodA);
}

/**
 * Converts a quarterly period key to a globally sortable integer.
 * "Q1-2026-27" → 8104, "Q4-2026-27" → 8111
 *
 * @param {string} period  - "Q{n}-YYYY-YY"
 * @returns {number}
 */
function _qIndex(period) {
  const q        = parseInt(period[1], 10);          // 1–4
  const baseYear = parseInt(period.slice(3, 7), 10); // first YYYY in "YYYY-YY"
  const calYear  = q === 4 ? baseYear + 1 : baseYear; // Q4 is in the next calendar year
  return calYear * 4 + (q - 1);
}

/**
 * Reconstructs a minimal PeriodMeta from an existing FeeInstallment.
 * Avoids re-running the period generator; the installment already carries
 * all information needed for amount and discount calculations.
 *
 * @param {import('./types.js').FeeInstallment} inst
 * @returns {import('./feeScheduleGenerator.js').PeriodMeta}
 */
function _metaFromInstallment(inst) {
  const { period, periodLabel, isHolidayMonth } = inst;

  if (period.startsWith("Q")) {
    const q         = parseInt(period[1], 10);
    const baseYear  = parseInt(period.slice(3, 7), 10);
    const months    = QUARTER_MONTHS[q - 1];
    const startYear = q === 4 ? baseYear + 1 : baseYear;

    return { period, periodLabel, startYear, startMonth: months[0], months, isHolidayMonth };
  }

  const [year, month] = period.split("-").map(Number);
  return { period, periodLabel, startYear: year, startMonth: month, months: [month], isHolidayMonth };
}

/**
 * Converts effectiveInstallment to the "YYYY-MM" format used by
 * FeeAdjustment.effectiveFrom. Monthly keys pass through unchanged;
 * quarterly keys resolve to the first calendar month of the quarter.
 *
 * "2026-08"    → "2026-08"
 * "Q2-2026-27" → "2026-07"
 *
 * @param {string} effectiveInstallment
 * @returns {string}  "YYYY-MM"
 */
function _toYearMonth(effectiveInstallment) {
  if (!effectiveInstallment.startsWith("Q")) return effectiveInstallment;

  const q        = parseInt(effectiveInstallment[1], 10);
  const baseYear = parseInt(effectiveInstallment.slice(3, 7), 10);
  const month    = QUARTER_FIRST_MONTHS[q - 1];
  const year     = q === 4 ? baseYear + 1 : baseYear;

  return `${year}-${_pad(month)}`;
}

/**
 * Builds pre-computed AdjMeta for a set of adjustments using only the
 * supplied metas as the eligible-period universe.
 *
 * Called exclusively with state.revisionAdjustments (never the full profile
 * feeAdjustments), so existing discounts are never redistributed.
 *
 * @param {import('./types.js').FeeAdjustment[]}              adjustments
 * @param {import('./feeScheduleGenerator.js').PeriodMeta[]}  metas
 * @returns {Array<{adj: import('./types.js').FeeAdjustment, totalEligible: number, basePerPeriod: number, remainder: number, firstEligible: string|null}>}
 */
function _buildAdjMeta(adjustments, metas) {
  return adjustments.map((adj) => {
    const eligible      = metas.filter(
      (m) => isPeriodEligible(m, adj.effectiveFrom ?? null, adj.effectiveTo ?? null)
    );
    const totalEligible = Math.max(1, eligible.length);
    const value         = typeof adj.value === "number" ? adj.value : 0;
    const basePerPeriod = Math.floor(value / totalEligible);
    const remainder     = value - basePerPeriod * totalEligible;
    const firstEligible = eligible[0]?.period ?? null;

    return { adj, totalEligible, basePerPeriod, remainder, firstEligible };
  });
}

// ─── Private applicators ──────────────────────────────────────────────────────

/**
 * Adds a fee structure as a line item to engine state.
 *
 * Routing rule:
 *   isOneTime: false → state.feeLineItems (appears in every affected installment)
 *   isOneTime: true  → state.pinnedItems at effectiveInstallment (appears ONCE at the
 *                       effective period, not at installment #1 of the academic year)
 *
 * Idempotent: no-op if feeStructureId is already present in feeLineItems.
 * No-op if feeStructuresMap does not contain the requested id — the caller is
 * responsible for pre-loading structures before calling computeRevisionPlan.
 *
 * @param {string}     feeStructureId
 * @param {string}     effectiveInstallment
 * @param {EngineState} state
 * @param {Record<string, import('./types.js').FeeStructure>} feeStructuresMap
 */
function _addLineItem(feeStructureId, effectiveInstallment, state, feeStructuresMap) {
  if (state.feeLineItems.some((item) => item.feeStructureId === feeStructureId)) return;

  const s = feeStructuresMap[feeStructureId];
  if (!s) return;

  /** @type {import('./types.js').FeeLineItem} */
  const lineItem = {
    feeStructureId,
    label:                 s.label,
    amount:                s.amount,
    type:                  s.type,
    isOneTime:             s.isOneTime             ?? false,
    chargedDuringHolidays: s.chargedDuringHolidays ?? true,
    allocationPriority:    s.allocationPriority    ?? 999,
  };

  if (lineItem.isOneTime) {
    // Pin to effectiveInstallment so it appears exactly once at the right period,
    // not at installment #1 which is what generateLineItemsForPeriod would do.
    state.pinnedItems = [...state.pinnedItems, { period: effectiveInstallment, lineItem }];
  } else {
    state.feeLineItems = [...state.feeLineItems, lineItem];
  }
}

/**
 * Removes the FeeLineItem matching feeStructureId from state.feeLineItems.
 * No-op if not present.
 *
 * @param {string}      feeStructureId
 * @param {EngineState} state
 */
function _removeLineItem(feeStructureId, state) {
  state.feeLineItems = state.feeLineItems.filter(
    (item) => item.feeStructureId !== feeStructureId
  );
}

/**
 * Creates a new FeeAdjustment from a SCHOLARSHIP or WAIVER change entry
 * and appends it to state.revisionAdjustments.
 *
 * Deliberately does NOT touch profile.feeAdjustments — this preserves the
 * separation between existing (frozen) adjustments and revision-introduced ones.
 *
 * @param {import('./types.js').ScholarshipChangeDetail|import('./types.js').WaiverChangeDetail} change
 * @param {"scholarship"|"waiver"} adjType
 * @param {string}      effectiveInstallment
 * @param {string}      revisionId
 * @param {string}      reason
 * @param {EngineState} state
 */
function _addAdjustment(change, adjType, effectiveInstallment, revisionId, reason, state) {
  const isPercentage  = change.percentage != null;
  const value         = isPercentage ? change.percentage : change.fixedAmount;
  const effectiveFrom = _toYearMonth(effectiveInstallment);
  const adjIndex      = state.revisionAdjustments.length;

  /** @type {import('./types.js').FeeAdjustment} */
  const newAdj = {
    id:                 `rev_${revisionId ?? "draft"}_${adjType}_${adjIndex}`,
    type:               adjType,
    label:              reason,
    scope:              change.scope,
    targetComponentIds: change.targetComponentIds ?? [],
    calculationType:    isPercentage ? "percentage" : "fixed_amount",
    value:              value ?? 0,
    maxAmount:          null,
    computedAmount:     0,   // derived per installment during recalculation
    effectiveFrom,
    effectiveTo:        null,
    reason,
    approvedBy:         null,
    createdAt:          null,
  };

  state.revisionAdjustments = [...state.revisionAdjustments, newAdj];
}

/**
 * Adds a fine as a PinnedLineItem tied to effectiveInstallment.
 * The fine appears only in that specific installment.
 *
 * @param {import('./types.js').FineChangeDetail} change
 * @param {string}      effectiveInstallment
 * @param {EngineState} state
 */
function _addFine(change, effectiveInstallment, state) {
  const index = state.pinnedItems.length;

  /** @type {import('./types.js').FeeLineItem} */
  const lineItem = {
    feeStructureId:        `fine_${index}`,
    label:                 `Fine: ${change.reason}`,
    amount:                change.amount,
    type:                  "variable",
    isOneTime:             false,  // isOneTime is irrelevant here — period-pinning controls appearance
    chargedDuringHolidays: true,
    allocationPriority:    9999,
  };

  state.pinnedItems = [...state.pinnedItems, { period: effectiveInstallment, lineItem }];
}

/**
 * Updates the per-cycle amount of the FeeLineItem matching feeStructureId.
 * No-op if not found.
 *
 * @param {import('./types.js').CorrectionChangeDetail} change
 * @param {EngineState} state
 */
function _correctAmount(change, state) {
  state.feeLineItems = state.feeLineItems.map((item) =>
    item.feeStructureId === change.feeStructureId
      ? { ...item, amount: Number(change.newValue) }
      : item
  );
}

// ─── Public typed applicators ─────────────────────────────────────────────────

/**
 * Applies an ADD_VARIABLE_FEE or REMOVE_VARIABLE_FEE change to engine state.
 * The action field ("add"|"remove") on the change entry determines direction.
 *
 * For "add": one-time structures are pinned to effectiveInstallment, not installment #1.
 *
 * @param {import('./types.js').VariableFeeChangeDetail & { revisionType: string }} change
 * @param {EngineState} state
 * @param {Record<string, import('./types.js').FeeStructure>} feeStructuresMap
 * @param {string} effectiveInstallment
 */
export function applyVariableFee(change, state, feeStructuresMap, effectiveInstallment) {
  if (change.action === "add") {
    _addLineItem(change.feeStructureId, effectiveInstallment, state, feeStructuresMap);
  } else {
    _removeLineItem(change.feeStructureId, state);
  }
}

/**
 * Applies an ADD_FIXED_FEE or REMOVE_FIXED_FEE change to engine state.
 *
 * For "add": one-time structures are pinned to effectiveInstallment, not installment #1.
 *
 * @param {import('./types.js').FixedFeeChangeDetail & { revisionType: string }} change
 * @param {EngineState} state
 * @param {Record<string, import('./types.js').FeeStructure>} feeStructuresMap
 * @param {string} effectiveInstallment
 */
export function applyFixedFee(change, state, feeStructuresMap, effectiveInstallment) {
  if (change.action === "add") {
    _addLineItem(change.feeStructureId, effectiveInstallment, state, feeStructuresMap);
  } else {
    _removeLineItem(change.feeStructureId, state);
  }
}

/**
 * Applies a SCHOLARSHIP change — appends a new "scholarship" FeeAdjustment
 * to state.revisionAdjustments (not the profile's feeAdjustments).
 *
 * @param {import('./types.js').ScholarshipChangeDetail} change
 * @param {EngineState} state
 * @param {string} effectiveInstallment
 * @param {string} revisionId
 * @param {string} reason
 */
export function applyScholarship(change, state, effectiveInstallment, revisionId, reason) {
  _addAdjustment(change, "scholarship", effectiveInstallment, revisionId, reason, state);
}

/**
 * Applies a WAIVER change — appends a new "waiver" FeeAdjustment
 * to state.revisionAdjustments.
 *
 * @param {import('./types.js').WaiverChangeDetail} change
 * @param {EngineState} state
 * @param {string} effectiveInstallment
 * @param {string} revisionId
 * @param {string} reason
 */
export function applyWaiver(change, state, effectiveInstallment, revisionId, reason) {
  _addAdjustment(change, "waiver", effectiveInstallment, revisionId, reason, state);
}

/**
 * Applies a FINE change — pins a one-time charge to effectiveInstallment.
 * The fine never appears in any other installment.
 *
 * @param {import('./types.js').FineChangeDetail} change
 * @param {EngineState} state
 * @param {string} effectiveInstallment
 */
export function applyFine(change, state, effectiveInstallment) {
  _addFine(change, effectiveInstallment, state);
}

/**
 * Applies a FEE_CORRECTION change — updates the per-cycle amount of
 * an existing line item in state.feeLineItems.
 *
 * @param {import('./types.js').CorrectionChangeDetail} change
 * @param {EngineState} state
 */
export function applyCorrection(change, state) {
  _correctAmount(change, state);
}

// ─── Public engine methods ─────────────────────────────────────────────────────

/**
 * Returns open installments that fall on or after effectiveInstallment,
 * sorted by installmentNumber ascending.
 *
 * Paid and cancelled installments are excluded — they are immutable.
 *
 * @param {import('./types.js').FeeInstallment[]} installments
 * @param {string} effectiveInstallment  - "YYYY-MM" or "Q{n}-YYYY-YY"
 * @returns {import('./types.js').FeeInstallment[]}
 */
export function findAffectedInstallments(installments, effectiveInstallment) {
  const IMMUTABLE = new Set(["paid", "cancelled"]);

  return installments
    .filter(
      (inst) =>
        _periodGte(effectiveInstallment, inst.period) &&
        !IMMUTABLE.has(inst.status)
    )
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
}

/**
 * Dispatches one RevisionChangeEntry to the appropriate typed applicator.
 * Mutates EngineState in place.
 *
 * Changes are applied in the order they appear in revision.changes[].
 * The output state of change N is the input state for change N+1.
 *
 * Throws immediately for any unknown revisionType — financial engines
 * must fail loudly rather than silently producing wrong numbers.
 *
 * @param {import('./types.js').RevisionChangeEntry} change
 * @param {EngineState} state
 * @param {Record<string, import('./types.js').FeeStructure>} feeStructuresMap
 * @param {string} effectiveInstallment
 * @param {string} revisionId
 * @param {string} reason
 * @throws {Error} If change.revisionType is not a known RevisionType value
 */
export function applyChange(change, state, feeStructuresMap, effectiveInstallment, revisionId, reason) {
  switch (change.revisionType) {
    case RevisionType.ADD_VARIABLE_FEE:
    case RevisionType.REMOVE_VARIABLE_FEE:
      applyVariableFee(change, state, feeStructuresMap, effectiveInstallment);
      break;

    case RevisionType.ADD_FIXED_FEE:
    case RevisionType.REMOVE_FIXED_FEE:
      applyFixedFee(change, state, feeStructuresMap, effectiveInstallment);
      break;

    case RevisionType.SCHOLARSHIP:
      applyScholarship(change, state, effectiveInstallment, revisionId, reason);
      break;

    case RevisionType.WAIVER:
      applyWaiver(change, state, effectiveInstallment, revisionId, reason);
      break;

    case RevisionType.FINE:
      applyFine(change, state, effectiveInstallment);
      break;

    case RevisionType.FEE_CORRECTION:
      applyCorrection(change, state);
      break;

    default:
      throw new Error(
        `FeeRevisionEngine: unknown revisionType "${change.revisionType}". ` +
        `Expected one of: ${Object.values(RevisionType).join(", ")}. ` +
        `Financial engines must fail loudly.`
      );
  }
}

/**
 * Recalculates one installment using the current engine state.
 *
 * Discount calculation uses TWO layers — never one unified pass:
 *   frozenDiscount    = inst.discountAmount (locked from original generation)
 *   revisionDiscount  = applyAdjustments(..., newAdjMeta) (revision changes only)
 *   discountAmount    = frozenDiscount + revisionDiscount
 *
 * This ensures existing scholarships, waivers, and concessions are never
 * recomputed or redistributed. Only adjustments introduced by the current
 * revision affect the discount calculation.
 *
 * totalAllocated is carried over from the original installment — never touched.
 * balance = newNetAmount − totalAllocated.
 *
 * @param {import('./types.js').FeeInstallment} installment
 * @param {EngineState} state
 * @param {ReturnType<typeof _buildAdjMeta>} newAdjMeta   - Pre-computed from state.revisionAdjustments only
 * @param {number[]} [holidayMonths]
 * @returns {InstallmentValues}
 */
export function recalculateInstallment(installment, state, newAdjMeta, holidayMonths = []) {
  const meta             = _metaFromInstallment(installment);
  const isFirstInstallment = installment.installmentNumber === 1;

  // (a) Recurring items from the revised line-item list
  const recurring = generateLineItemsForPeriod(
    state.feeLineItems,
    meta,
    isFirstInstallment,
    holidayMonths
  );

  // (b) Period-pinned items: fines and one-time add-fees for this period
  const pinned = state.pinnedItems
    .filter((p) => p.period === installment.period)
    .map((p) => p.lineItem);

  const lineItems = [...recurring, ...pinned];

  const grossAmount = calculateGrossAmount(lineItems);

  // (c) Existing discounts are frozen — carry forward from original installment
  const frozenDiscount   = installment.discountAmount;
  // (d) Revision-introduced adjustments are freshly computed
  const revisionDiscount = applyAdjustments(meta, lineItems, grossAmount, newAdjMeta);

  const discountAmount = frozenDiscount + revisionDiscount;
  const netAmount      = calculateNetAmount(grossAmount, discountAmount);
  const balance        = netAmount - installment.totalAllocated;

  return { lineItems, grossAmount, discountAmount, netAmount, balance };
}

/**
 * Assembles the final RevisionPlan from a list of per-installment diffs.
 *
 * @param {InstallmentDiff[]} diffs
 * @returns {RevisionPlan}
 */
export function buildRevisionPlan(diffs) {
  let increase = 0;
  let decrease = 0;

  for (const d of diffs) {
    const delta = d.newValues.netAmount - d.oldValues.netAmount;
    if (delta > 0) increase += delta;
    else           decrease += Math.abs(delta);
  }

  return {
    affectedInstallments: diffs,
    summary: {
      increase,
      decrease,
      netDifference: increase - decrease,
    },
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Computes the RevisionPlan for a FeeRevisionDoc.
 *
 * Pure function — no I/O, no database, no async.
 * Assumes the revision has already been validated via validateFeeRevisionDoc().
 *
 * @param {import('./types.js').StudentFeeProfile}   profile
 *   The student's current fee profile. feeLineItems is the starting point for
 *   line-item changes. feeAdjustments is NOT used here — existing discounts are
 *   read directly from inst.discountAmount on each installment.
 *
 * @param {import('./types.js').FeeInstallment[]}    installments
 *   All installments for this profile. Paid and cancelled ones are excluded.
 *
 * @param {import('./types.js').FeeRevisionDoc}      revision
 *   The revision to evaluate. revision.changes[] is applied sequentially.
 *   Assumed to be valid — no validation is performed here.
 *
 * @param {Record<string, import('./types.js').FeeStructure>} [feeStructuresMap]
 *   Map of feeStructureId → FeeStructure. Required for ADD_*_FEE entries.
 *   ADD entries whose id is absent from the map are silently skipped.
 *
 * @param {number[]} [holidayMonths]
 *   1-indexed calendar months that are school holidays.
 *   Affects items with chargedDuringHolidays=false. Default: [].
 *
 * @returns {RevisionPlan}
 * @throws {Error} If any change in revision.changes[] has an unknown revisionType
 */
export function computeRevisionPlan(
  profile,
  installments,
  revision,
  feeStructuresMap = {},
  holidayMonths    = [],
) {
  // ── 1. Find open installments from effectiveInstallment onwards ───────────
  const affected = findAffectedInstallments(installments, revision.effectiveInstallment);

  if (affected.length === 0) {
    return buildRevisionPlan([]);
  }

  // ── 2. Build mutable engine state ─────────────────────────────────────────
  // feeAdjustments from the profile are deliberately excluded — frozen discounts
  // are read per-installment from inst.discountAmount in step 5.
  /** @type {EngineState} */
  const state = {
    feeLineItems:        profile.feeLineItems.map((item) => ({ ...item })),
    revisionAdjustments: [],
    pinnedItems:         [],
  };

  // ── 3. Apply each change sequentially ────────────────────────────────────
  // applyChange throws for unknown revisionType — no silent skips.
  for (const change of revision.changes) {
    applyChange(
      change,
      state,
      feeStructuresMap,
      revision.effectiveInstallment,
      revision.revisionId,
      revision.reason,
    );
  }

  // ── 4. Pre-compute adjustment metadata for revision-only adjustments ───────
  // Existing profile.feeAdjustments are never passed here — they must not be
  // redistributed across the remaining open installments.
  const affectedMetas = affected.map(_metaFromInstallment);
  const newAdjMeta    = _buildAdjMeta(state.revisionAdjustments, affectedMetas);

  // ── 5. Collect distinct revisionType values for audit fields ──────────────
  const revisionTypes = [...new Set(revision.changes.map((c) => c.revisionType))];

  // ── 6. Compute per-installment diffs ─────────────────────────────────────
  /** @type {InstallmentDiff[]} */
  const diffs = affected.map((inst) => {
    const newValues = recalculateInstallment(inst, state, newAdjMeta, holidayMonths);

    /** @type {InstallmentValues} */
    const oldValues = {
      lineItems:      inst.lineItems,
      grossAmount:    inst.grossAmount,
      discountAmount: inst.discountAmount,
      netAmount:      inst.netAmount,
      balance:        inst.balance,
    };

    return {
      installmentId: inst.id,
      period:        inst.period,
      periodLabel:   inst.periodLabel,
      revisionId:    revision.revisionId,
      revisionType:  revisionTypes,
      reason:        revision.reason,
      oldValues,
      newValues,
      difference: {
        grossAmount:    newValues.grossAmount    - oldValues.grossAmount,
        discountAmount: newValues.discountAmount - oldValues.discountAmount,
        netAmount:      newValues.netAmount      - oldValues.netAmount,
        balance:        newValues.balance        - oldValues.balance,
      },
    };
  });

  // ── 7. Build plan and return ──────────────────────────────────────────────
  return buildRevisionPlan(diffs);
}
