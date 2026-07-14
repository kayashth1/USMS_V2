/**
 * FeeScheduleGenerator — Fee Management V2
 *
 * Pure calculation engine. No Firestore. No Firebase. No async. No side effects.
 *
 * Given a StudentFeeProfile, SchoolSettings, and an academic year string,
 * returns an in-memory array of ScheduleEntry objects representing the complete
 * installment schedule for the year. Nothing is persisted.
 *
 * The same inputs always produce the same output (referentially transparent).
 *
 * Calculation pipeline (see generateSchedule):
 *   1. Generate ordered PeriodMeta objects (12 monthly or 4 quarterly)
 *   2. Pre-compute per-adjustment distribution metadata (for fixed_amount pro-ration)
 *   3. For each period:
 *      a. Apply one-time and holiday rules → effective line items
 *      b. Compute grossAmount
 *      c. Compute adjustmentAmount across all eligible adjustments
 *      d. Compute netAmount = max(0, gross − adjustment)
 *      e. Generate due date
 *      f. Build ScheduleEntry { status: "scheduled", balance: netAmount }
 *   4. Return ScheduleEntry[]
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Discriminated union that controls how the due date is calculated for each period.
 * Pass as `SchoolSettings.dueDateStrategy`. New strategy types can be added here
 * without changing `generateSchedule` or `resolveDueDate`'s call sites.
 *
 * @typedef {Object} DueDateStrategy
 * @property {"fixed_day_of_month"} type - Strategy discriminant
 * @property {number} [dayOfMonth]        - Used by "fixed_day_of_month"; clamped to month length.
 *                                          Default: 10
 */

/** @type {DueDateStrategy} */
const DEFAULT_DUE_DATE_STRATEGY = Object.freeze({ type: "fixed_day_of_month", dayOfMonth: 10 });

/**
 * School-level settings consumed by the schedule engine.
 *
 * @typedef {Object} SchoolSettings
 * @property {number[]}        [holidayMonths]    - 1-indexed calendar months that are school holidays.
 *                                                  e.g. [5, 6] means May and June.
 *                                                  Default: [] (no holiday months)
 * @property {DueDateStrategy} [dueDateStrategy]  - Controls how due dates are computed per period.
 *                                                  Default: { type: "fixed_day_of_month", dayOfMonth: 10 }
 */

/**
 * Internal representation of one installment period. Not exported to callers.
 *
 * @typedef {Object} PeriodMeta
 * @property {string}   period          - Unique key: "YYYY-MM" (monthly) or "Q{n}-YYYY-YY" (quarterly)
 * @property {string}   periodLabel     - Human-readable: "April 2026" or "Q1 (Apr–Jun) 2026-27"
 * @property {number}   startYear       - Calendar year of the period's first month
 * @property {number}   startMonth      - 1-indexed first month of the period
 * @property {number[]} months          - All 1-indexed calendar months in the period
 * @property {boolean}  isHolidayMonth  - true if ANY month in the period is in holidayMonths
 */

/**
 * Pre-computed distribution data for one FeeAdjustment across all periods.
 * Used to distribute fixed_amount reductions without fractional amounts.
 *
 * @typedef {Object} AdjMeta
 * @property {import('./types.js').FeeAdjustment} adj
 * @property {number}      totalEligible    - Count of periods where this adjustment applies
 * @property {number}      basePerPeriod    - Math.floor(value / totalEligible)
 * @property {number}      remainder        - value − basePerPeriod × totalEligible; added to firstEligible
 * @property {string|null} firstEligible    - period key of the first eligible period
 */

/**
 * One entry in the generated fee schedule. Mirrors the FeeInstallment shape
 * but is purely in-memory — no id, no Firestore references.
 *
 * @typedef {Object} ScheduleEntry
 * @property {number}     installmentNumber
 * @property {string}     period           - "YYYY-MM" or "Q{n}-YYYY-YY"
 * @property {string}     periodLabel
 * @property {Date}       dueDate
 * @property {import('./types.js').FeeLineItem[]} lineItems  - Effective items for this period;
 *                                                             amounts already reflect holiday scaling
 * @property {number}     grossAmount       - sum(lineItems[].amount)
 * @property {number}     adjustmentAmount  - total discount for this period
 * @property {number}     netAmount         - grossAmount − adjustmentAmount (≥ 0)
 * @property {number}     balance           - = netAmount; no payments exist yet
 * @property {"scheduled"} status
 * @property {boolean}    isHolidayMonth
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const QUARTER_LABELS = [
  "Q1 (Apr–Jun)",
  "Q2 (Jul–Sep)",
  "Q3 (Oct–Dec)",
  "Q4 (Jan–Mar)",
];

// ─── Private helpers ──────────────────────────────────────────────────────────

function _startYear(academicYear) {
  return parseInt(academicYear.split("-")[0], 10);
}

function _pad(n) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM" for the first month of a PeriodMeta. */
function _periodStart(meta) {
  return `${meta.startYear}-${_pad(meta.startMonth)}`;
}

/** "YYYY-MM" for the last month of a PeriodMeta. */
function _periodEnd(meta) {
  const last = meta.months[meta.months.length - 1];
  return `${meta.startYear}-${_pad(last)}`;
}

/**
 * Effective INR amount for one line item in one period using per-month applicability.
 *
 * Each month in the period contributes an equal share of the period amount.
 * Holiday months (when chargedDuringHolidays=false) contribute ₹0.
 * The period total is the sum of applicable monthly contributions.
 *
 * Example (quarterly, amount=₹600, May+June holiday):
 *   monthlyRate = Math.round(600 / 3) = 200
 *   April (non-holiday) → 200, May (holiday) → 0, June (holiday) → 0
 *   Quarterly effective = 200
 *
 * For monthly periods meta.months.length === 1, so this reduces to:
 *   monthlyRate = item.amount; result = item.amount or 0 (holiday month).
 *
 * @param {import('./types.js').FeeLineItem} item
 * @param {PeriodMeta} meta
 * @param {number[]} holidayMonths
 * @returns {number}
 */
function _effectiveAmount(item, meta, holidayMonths) {
  if (item.chargedDuringHolidays) return item.amount;

  // Per-month contribution (rounded once, applied per applicable month)
  const monthlyRate = Math.round(item.amount / meta.months.length);

  return meta.months
    .filter(m => !holidayMonths.includes(m))
    .reduce((sum) => sum + monthlyRate, 0);
}

/**
 * Builds AdjMeta for one FeeAdjustment so its fixed_amount value can be
 * distributed across eligible periods without fractional amounts.
 *
 * For percentage adjustments, only `totalEligible` is used (for maxAmount cap).
 *
 * @param {import('./types.js').FeeAdjustment} adj
 * @param {PeriodMeta[]} periods
 * @returns {AdjMeta}
 */
function _buildAdjMeta(adj, periods) {
  const eligible     = periods.filter(p => isPeriodEligible(p, adj.effectiveFrom, adj.effectiveTo));
  const totalEligible = Math.max(1, eligible.length);
  const value        = typeof adj.value === "number" ? adj.value : 0;
  const basePerPeriod = Math.floor(value / totalEligible);
  const remainder    = value - basePerPeriod * totalEligible;
  const firstEligible = eligible[0]?.period ?? null;

  return { adj, totalEligible, basePerPeriod, remainder, firstEligible };
}

/**
 * Discount contributed by one adjustment to one period.
 *
 * PERCENTAGE:
 *   base = grossAmount (total_fee) or sum of targeted line item amounts (specific_components)
 *   amount = round(base × value / 100)
 *   maxAmount cap is applied per-period as floor(maxAmount / totalEligible)
 *
 * FIXED_AMOUNT:
 *   Distributed evenly: basePerPeriod per period; firstEligible also receives the remainder.
 *   This guarantees sum(per-period amounts) === adj.value exactly.
 *
 * @param {AdjMeta} adjEntry
 * @param {PeriodMeta} meta
 * @param {import('./types.js').FeeLineItem[]} lineItems
 * @param {number} grossAmount
 * @returns {number}
 */
function _discountForPeriod(adjEntry, meta, lineItems, grossAmount) {
  const { adj, totalEligible, basePerPeriod, remainder, firstEligible } = adjEntry;

  if (!isPeriodEligible(meta, adj.effectiveFrom, adj.effectiveTo)) return 0;

  let amount;

  if (adj.calculationType === "percentage") {
    let base;
    if (adj.scope === "total_fee") {
      base = grossAmount;
    } else {
      const targetIds = new Set(adj.targetComponentIds || []);
      base = lineItems
        .filter(item => targetIds.has(item.feeStructureId))
        .reduce((sum, item) => sum + item.amount, 0);
    }

    amount = Math.round(base * adj.value / 100);

    // Apply maxAmount cap spread evenly across eligible periods
    if (adj.maxAmount !== null && adj.maxAmount !== undefined) {
      amount = Math.min(amount, Math.floor(adj.maxAmount / totalEligible));
    }
  } else {
    // fixed_amount — remainder lands on the first eligible period
    amount = basePerPeriod + (meta.period === firstEligible ? remainder : 0);
  }

  return Math.max(0, amount);
}

// ─── Period generators ────────────────────────────────────────────────────────

/**
 * Generates 12 PeriodMeta objects for a monthly schedule (April → March).
 *
 * @param {string}   academicYear  - "YYYY-YY" (e.g. "2026-27")
 * @param {number[]} [holidayMonths]
 * @returns {PeriodMeta[]}
 */
export function generateMonthlyPeriods(academicYear, holidayMonths = []) {
  const sy = _startYear(academicYear);

  return Array.from({ length: 12 }, (_, i) => {
    // April is index 0, March is index 11
    const month = ((3 + i) % 12) + 1;
    const year  = month >= 4 ? sy : sy + 1;

    return {
      period:        `${year}-${_pad(month)}`,
      periodLabel:   `${MONTH_NAMES[month - 1]} ${year}`,
      startYear:     year,
      startMonth:    month,
      months:        [month],
      isHolidayMonth: holidayMonths.includes(month),
    };
  });
}

/**
 * Generates 4 PeriodMeta objects for a quarterly schedule (Q1 → Q4).
 *
 * Q1: Apr–Jun   startYear
 * Q2: Jul–Sep   startYear
 * Q3: Oct–Dec   startYear
 * Q4: Jan–Mar   startYear + 1
 *
 * @param {string}   academicYear
 * @param {number[]} [holidayMonths]
 * @returns {PeriodMeta[]}
 */
export function generateQuarterlyPeriods(academicYear, holidayMonths = []) {
  const sy = _startYear(academicYear);

  return [
    { q: 1, months: [4, 5, 6],    year: sy     },
    { q: 2, months: [7, 8, 9],    year: sy     },
    { q: 3, months: [10, 11, 12], year: sy     },
    { q: 4, months: [1, 2, 3],    year: sy + 1 },
  ].map(({ q, months, year }) => ({
    period:        `Q${q}-${academicYear}`,
    periodLabel:   `${QUARTER_LABELS[q - 1]} ${academicYear}`,
    startYear:     year,
    startMonth:    months[0],
    months,
    isHolidayMonth: months.some(m => holidayMonths.includes(m)),
  }));
}

/**
 * Dispatches to the correct period generator based on schedule type.
 *
 * @param {"monthly"|"quarterly"} schedule
 * @param {string}   academicYear
 * @param {number[]} [holidayMonths]
 * @returns {PeriodMeta[]}
 */
export function generatePeriods(schedule, academicYear, holidayMonths = []) {
  return schedule === "quarterly"
    ? generateQuarterlyPeriods(academicYear, holidayMonths)
    : generateMonthlyPeriods(academicYear, holidayMonths);
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

/**
 * Returns true if a period overlaps with an adjustment's effective date range.
 *
 * Comparison uses "YYYY-MM" lexicographic ordering (safe for zero-padded ISO keys).
 *
 * null effectiveFrom → no lower bound (eligible from the first period).
 * null effectiveTo   → no upper bound (eligible through the last period).
 *
 * Overlap condition: period.end >= effectiveFrom AND period.start <= effectiveTo
 * This means a quarterly period is eligible even if only part of it falls within range.
 *
 * @param {PeriodMeta}  meta
 * @param {string|null} effectiveFrom
 * @param {string|null} effectiveTo
 * @returns {boolean}
 */
export function isPeriodEligible(meta, effectiveFrom, effectiveTo) {
  const start = _periodStart(meta);
  const end   = _periodEnd(meta);

  if (effectiveFrom && end   < effectiveFrom) return false;
  if (effectiveTo   && start > effectiveTo)   return false;

  return true;
}

// ─── Line item builder ────────────────────────────────────────────────────────

/**
 * Returns the effective line items for one period after applying:
 *
 *   One-time rule: items with isOneTime=true appear only in installment 1.
 *   Holiday rule:  items with chargedDuringHolidays=false contribute only for non-holiday
 *                  months within the period (see _effectiveAmount).
 *
 * The `amount` field on returned items reflects the effective period charge,
 * which may differ from the profile snapshot when holiday scaling is applied.
 * Items with an effective amount of 0 are omitted entirely.
 *
 * @param {import('./types.js').FeeLineItem[]} feeLineItems   - Profile snapshot
 * @param {PeriodMeta}   meta
 * @param {boolean}      isFirstInstallment
 * @param {number[]}     [holidayMonths]
 * @returns {import('./types.js').FeeLineItem[]}
 */
export function generateLineItemsForPeriod(feeLineItems, meta, isFirstInstallment, holidayMonths = []) {
  const result = [];

  for (const item of feeLineItems) {
    if (item.isOneTime && !isFirstInstallment) continue;

    const amount = _effectiveAmount(item, meta, holidayMonths);
    if (amount === 0) continue;

    result.push(amount === item.amount ? item : { ...item, amount });
  }

  return result;
}

// ─── Amount calculators ───────────────────────────────────────────────────────

/**
 * Sums line item amounts for a period.
 *
 * @param {import('./types.js').FeeLineItem[]} lineItems
 * @returns {number}
 */
export function calculateGrossAmount(lineItems) {
  return lineItems.reduce((sum, item) => sum + item.amount, 0);
}

/**
 * Computes the total discount for one period across all adjustments.
 *
 * Requires pre-computed AdjMeta (from generateSchedule's internal pass).
 * Exported primarily for unit testing individual adjustment calculations.
 *
 * @param {PeriodMeta}   meta
 * @param {import('./types.js').FeeLineItem[]} lineItems
 * @param {number}       grossAmount
 * @param {AdjMeta[]}    adjMeta   - Pre-computed via _buildAdjMeta inside generateSchedule
 * @returns {number}
 */
export function applyAdjustments(meta, lineItems, grossAmount, adjMeta) {
  return adjMeta.reduce((total, entry) => {
    return total + _discountForPeriod(entry, meta, lineItems, grossAmount);
  }, 0);
}

/**
 * Returns netAmount, floored at 0.
 *
 * @param {number} grossAmount
 * @param {number} adjustmentAmount
 * @returns {number}
 */
export function calculateNetAmount(grossAmount, adjustmentAmount) {
  return Math.max(0, grossAmount - adjustmentAmount);
}

// ─── Due date generator ───────────────────────────────────────────────────────

/**
 * Primitive: returns a Date clamped to the last valid day of the month.
 * Used internally by resolveDueDate; also exported for direct use in tests.
 *
 * @param {number} year
 * @param {number} month        - 1-indexed
 * @param {number} [dayOfMonth] - Default 10
 * @returns {Date}
 */
export function generateDueDate(year, month, dayOfMonth = 10) {
  // new Date(year, month, 0) gives the last day of `month` (month is 1-indexed here)
  const daysInMonth = new Date(year, month, 0).getDate();
  const day         = Math.min(dayOfMonth, daysInMonth);
  return new Date(year, month - 1, day);
}

/**
 * Resolves the due date for a period using the supplied DueDateStrategy.
 * Falls back to DEFAULT_DUE_DATE_STRATEGY when none is supplied.
 *
 * Add new strategy types here. The switch dispatch means `generateSchedule`
 * and all callers never need to change when a new strategy is introduced.
 *
 * @param {PeriodMeta}      meta
 * @param {DueDateStrategy} [strategy]
 * @returns {Date}
 */
export function resolveDueDate(meta, strategy) {
  const s = strategy ?? DEFAULT_DUE_DATE_STRATEGY;
  switch (s.type) {
    case "fixed_day_of_month":
    default:
      return generateDueDate(meta.startYear, meta.startMonth, s.dayOfMonth ?? 10);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generates the complete in-memory fee schedule for one academic year.
 *
 * Pure function — no I/O, no database, no async.
 *
 * @param {import('./types.js').StudentFeeProfile} profile
 * @param {SchoolSettings} schoolSettings
 * @param {string} academicYear  - "YYYY-YY" (e.g. "2026-27") — just the year string,
 *                                  not the full AcademicYear document
 * @returns {ScheduleEntry[]}
 */
export function generateSchedule(profile, schoolSettings, academicYear) {
  const feeLineItems   = profile.feeLineItems   ?? [];
  const feeAdjustments = profile.feeAdjustments ?? [];
  const schedule       = profile.schedule;

  const holidayMonths   = schoolSettings?.holidayMonths   ?? [];
  const dueDateStrategy = schoolSettings?.dueDateStrategy ?? DEFAULT_DUE_DATE_STRATEGY;

  // ── 1. Ordered period metadata ─────────────────────────────────────────────

  const periods = generatePeriods(schedule, academicYear, holidayMonths);

  // ── 2. Pre-compute fixed_amount distribution and eligibility counts ────────

  const adjMeta = feeAdjustments.map(adj => _buildAdjMeta(adj, periods));

  // ── 3. Build one ScheduleEntry per period ─────────────────────────────────

  return periods.map((meta, index) => {
    const installmentNumber  = index + 1;
    const isFirstInstallment = installmentNumber === 1;

    const lineItems        = generateLineItemsForPeriod(feeLineItems, meta, isFirstInstallment, holidayMonths);
    const grossAmount      = calculateGrossAmount(lineItems);
    const adjustmentAmount = applyAdjustments(meta, lineItems, grossAmount, adjMeta);
    const netAmount        = calculateNetAmount(grossAmount, adjustmentAmount);
    const dueDate          = resolveDueDate(meta, dueDateStrategy);

    return {
      installmentNumber,
      period:          meta.period,
      periodLabel:     meta.periodLabel,
      dueDate,
      lineItems,
      grossAmount,
      adjustmentAmount,
      netAmount,
      balance:         netAmount,
      status:          "scheduled",
      isHolidayMonth:  meta.isHolidayMonth,
    };
  });
}
