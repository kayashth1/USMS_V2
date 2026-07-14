/**
 * ReceiptGenerator — Fee Management V2
 *
 * Pure data formatter. Constructs a ReceiptModel from existing Firestore
 * documents already loaded by the caller.
 *
 * Rules:
 *   - No Firestore reads or writes
 *   - No Firebase imports
 *   - No async (all data is passed in)
 *   - No financial calculations (numbers come from the documents)
 *   - No PDF, no HTML, no UI
 *
 * The ReceiptModel is a plain JavaScript object. A separate PDF layer (not
 * in this module) is responsible for rendering it.
 *
 * Entry point:
 *   buildReceipt(payment, profile, allocations, school?)
 *
 * Each section builder is also exported so individual sections can be
 * assembled and tested independently.
 */

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Optional school details passed by the caller. None of the fields are
 * required — the receipt renders without them (blank header values).
 *
 * @typedef {Object} SchoolDetails
 * @property {string}      [name]
 * @property {string}      [address]
 * @property {string}      [phone]
 * @property {string}      [email]
 * @property {string}      [logoUrl]
 */

/**
 * Top-level structure returned by buildReceipt.
 *
 * @typedef {Object} ReceiptModel
 * @property {Date}              generatedAt     - When this model was built (local clock)
 * @property {ReceiptHeader}     header          - School info + receipt identity
 * @property {StudentSection}    student         - Who the receipt is for
 * @property {PaymentInfoSection} paymentInfo    - How the payment was made
 * @property {AllocationTable}   allocationTable - What the money was applied to
 * @property {ReceiptTotals}     totals          - Summarised monetary totals
 */

/**
 * @typedef {Object} ReceiptHeader
 * @property {string|null} schoolName
 * @property {string|null} schoolAddress
 * @property {string|null} schoolPhone
 * @property {string|null} schoolEmail
 * @property {string|null} schoolLogoUrl
 * @property {string}      receiptNo        - e.g. "RCP-20260709-0001"
 * @property {string}      receiptDate      - Human-readable payment date
 * @property {string}      academicYear     - e.g. "2026-27"
 */

/**
 * @typedef {Object} StudentSection
 * @property {string} studentName
 * @property {string} admissionNumber
 * @property {string} className
 * @property {string} section
 * @property {string} academicYear
 */

/**
 * @typedef {Object} PaymentInfoSection
 * @property {string}      paymentMode   - Display label, e.g. "Cash", "UPI"
 * @property {string}      paymentDate   - Human-readable
 * @property {string}      collectedBy
 * @property {string|null} remarks
 * @property {string}      status        - "confirmed" | "cancelled"
 */

/**
 * One fee component within one installment allocation.
 *
 * @typedef {Object} ComponentRow
 * @property {string} feeStructureId
 * @property {string} label            - e.g. "Tuition Fee", "Transport"
 * @property {number} allocatedAmount  - INR; always > 0
 */

/**
 * One installment row in the allocation table.
 *
 * @typedef {Object} InstallmentRow
 * @property {string}        installmentId
 * @property {string}        period         - e.g. "2026-04", "Q1-2026-27"
 * @property {string}        periodLabel    - e.g. "April 2026", "Q1 2026-27"
 * @property {number}        allocatedAmount
 * @property {ComponentRow[]} components
 */

/**
 * @typedef {Object} OpeningBalanceRow
 * @property {string} label           - "Prior Year Balance"
 * @property {number} allocatedAmount
 */

/**
 * @typedef {Object} AllocationTable
 * @property {OpeningBalanceRow|null} openingBalance
 * @property {InstallmentRow[]}       installments     - Sorted by period ascending
 */

/**
 * @typedef {Object} ReceiptTotals
 * @property {number} openingBalancePaid   - Amount applied to prior-year debt
 * @property {number} installmentTotal     - Sum of all installment allocations
 * @property {number} grandTotal           - openingBalancePaid + installmentTotal
 */

// ─── Private utilities ────────────────────────────────────────────────────────

/**
 * Converts a Firestore Timestamp, Date, or ISO string to a human-readable date.
 * Returns "—" for anything that cannot be parsed.
 *
 * @param {unknown} value
 * @param {string}  [locale]
 * @returns {string}
 */
function _formatDate(value, locale = "en-IN") {
  if (value == null) return "—";
  let date;
  if (typeof value?.toDate === "function") {
    date = value.toDate();                              // Firestore Timestamp
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);                             // ISO string or epoch ms
  }
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
}

/**
 * Maps a PaymentMode enum value to a customer-facing label.
 *
 * @param {string|undefined} mode
 * @returns {string}
 */
function _formatPaymentMode(mode) {
  const labels = {
    cash:   "Cash",
    upi:    "UPI",
    cheque: "Cheque",
    dd:     "Demand Draft",
    online: "Online Transfer",
  };
  return labels[mode] ?? mode ?? "—";
}

/**
 * Extracts the numeric allocated amount from a PaymentAllocation document,
 * tolerating both `allocatedAmount` and the legacy `amount` field name.
 *
 * @param {Object} alloc
 * @returns {number}
 */
function _getAllocatedAmount(alloc) {
  const v = alloc.allocatedAmount ?? alloc.amount;
  return typeof v === "number" ? v : 0;
}

/**
 * Coalesces a value to a string, returning "" for null/undefined.
 *
 * @param {unknown} v
 * @returns {string}
 */
function _str(v) {
  return v != null ? String(v) : "";
}

// ─── Section builders ─────────────────────────────────────────────────────────

/**
 * Builds the receipt header from the payment and optional school details.
 *
 * School fields are all nullable — the receipt is still valid when school
 * details are unavailable; the PDF layer renders blank where values are null.
 *
 * @param {Object}         payment  - FeePayment Firestore document
 * @param {SchoolDetails|null} school
 * @returns {ReceiptHeader}
 */
export function buildHeader(payment, school) {
  return {
    schoolName:    school?.name     ?? null,
    schoolAddress: school?.address  ?? null,
    schoolPhone:   school?.phone    ?? null,
    schoolEmail:   school?.email    ?? null,
    schoolLogoUrl: school?.logoUrl  ?? null,
    receiptNo:     _str(payment.receiptNo),
    receiptDate:   _formatDate(payment.paymentDate),
    academicYear:  _str(payment.academicYear),
  };
}

/**
 * Builds the student identification section from the fee profile.
 *
 * @param {Object} profile  - StudentFeeProfile Firestore document
 * @returns {StudentSection}
 */
export function buildStudentSection(profile) {
  return {
    studentName:     _str(profile.studentName),
    admissionNumber: _str(profile.admissionNumber),
    className:       _str(profile.className),
    section:         _str(profile.section),
    academicYear:    _str(profile.academicYear),
  };
}

/**
 * Builds the payment method / collection info section.
 *
 * @param {Object} payment  - FeePayment Firestore document
 * @returns {PaymentInfoSection}
 */
export function buildPaymentInfo(payment) {
  return {
    paymentMode: _formatPaymentMode(payment.paymentMode),
    paymentDate: _formatDate(payment.paymentDate),
    collectedBy: _str(payment.collectedBy),
    remarks:     payment.remarks ?? null,
    status:      _str(payment.status),
  };
}

/**
 * Builds the allocation table from the loaded PaymentAllocation documents.
 *
 * Separates opening-balance allocations from installment allocations.
 * Installments are sorted by period ascending (lexicographic comparison
 * works correctly for both monthly "YYYY-MM" and quarterly "Q#-YYYY-YY"
 * period formats).
 *
 * @param {Object[]} allocations  - PaymentAllocation Firestore documents
 * @returns {AllocationTable}
 */
export function buildAllocationTable(allocations) {
  const list = Array.isArray(allocations) ? allocations : [];

  // ── Opening balance ──────────────────────────────────────────────────────

  const openingAllocs = list.filter(a => a.allocationTarget === "opening_balance");

  let openingBalance = null;
  if (openingAllocs.length > 0) {
    const totalOpening = openingAllocs.reduce(
      (sum, a) => sum + _getAllocatedAmount(a),
      0
    );
    openingBalance = {
      label:           openingAllocs[0].periodLabel ?? "Prior Year Balance",
      allocatedAmount: totalOpening,
    };
  }

  // ── Installment rows ─────────────────────────────────────────────────────

  const instAllocs = list
    .filter(a => a.allocationTarget === "installment")
    .sort((a, b) => {
      // Sort monthly ("YYYY-MM") and quarterly ("Q#-YYYY-YY") by period string.
      // Both formats sort correctly lexicographically because the discriminating
      // portion (month number or Q number) appears at a consistent position.
      const pa = _str(a.period);
      const pb = _str(b.period);
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });

  const installments = instAllocs.map(alloc => ({
    installmentId:   _str(alloc.installmentId),
    period:          _str(alloc.period),
    periodLabel:     _str(alloc.periodLabel),
    allocatedAmount: _getAllocatedAmount(alloc),
    components:      _buildComponentRows(alloc.componentAllocations),
  }));

  return { openingBalance, installments };
}

/**
 * Maps the componentAllocations array on a PaymentAllocation document into
 * an array of ComponentRow objects for the receipt.
 *
 * @param {unknown} componentAllocations
 * @returns {ComponentRow[]}
 */
function _buildComponentRows(componentAllocations) {
  if (!Array.isArray(componentAllocations)) return [];

  return componentAllocations
    .filter(c => (c.allocatedAmount ?? 0) > 0)
    .map(c => ({
      feeStructureId:  _str(c.feeStructureId),
      label:           _str(c.label),
      allocatedAmount: typeof c.allocatedAmount === "number" ? c.allocatedAmount : 0,
    }));
}

/**
 * Builds the totals block by summing the already-built AllocationTable.
 * No raw document data is passed here — totals come from the formatted table.
 *
 * @param {AllocationTable} allocationTable
 * @returns {ReceiptTotals}
 */
export function buildTotals(allocationTable) {
  const openingBalancePaid = allocationTable.openingBalance?.allocatedAmount ?? 0;

  const installmentTotal = (allocationTable.installments ?? []).reduce(
    (sum, row) => sum + row.allocatedAmount,
    0
  );

  return {
    openingBalancePaid,
    installmentTotal,
    grandTotal: openingBalancePaid + installmentTotal,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Assembles a complete ReceiptModel from the Firestore documents the caller
 * has already loaded. No I/O happens inside this function.
 *
 * @param {Object}            payment      - FeePayment document (with .id)
 * @param {Object}            profile      - StudentFeeProfile document
 * @param {Object[]}          allocations  - PaymentAllocation documents for this payment
 * @param {SchoolDetails|null} [school]    - Optional school metadata for the header
 * @returns {ReceiptModel}
 */
export function buildReceipt(payment, profile, allocations, school = null) {
  const header          = buildHeader(payment, school);
  const student         = buildStudentSection(profile);
  const paymentInfo     = buildPaymentInfo(payment);
  const allocationTable = buildAllocationTable(allocations);
  const totals          = buildTotals(allocationTable);

  return {
    generatedAt: new Date(),
    header,
    student,
    paymentInfo,
    allocationTable,
    totals,
  };
}
