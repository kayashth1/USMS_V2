import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ─────────── UTILS ─────────── */

export const currentAcademicYear = () => {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const startYear = m >= 3 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
};

export const generatePeriods = (schedule, academicYear) => {
  const startYear = Number(academicYear.split("-")[0]);
  if (schedule === "quarterly") {
    return [`Q1-${academicYear}`, `Q2-${academicYear}`, `Q3-${academicYear}`, `Q4-${academicYear}`];
  }
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = (3 + i) % 12;
    const year = monthIndex >= 3 ? startYear : startYear + 1;
    periods.push(`${year}-${String(monthIndex + 1).padStart(2, "0")}`);
  }
  return periods;
};

const FULL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const QUARTER_LABELS = {
  Q1: "Q1 (Apr–Jun)", Q2: "Q2 (Jul–Sep)", Q3: "Q3 (Oct–Dec)", Q4: "Q4 (Jan–Mar)",
};

export const formatPeriod = (period) => {
  if (period.startsWith("Q")) {
    const [q, ...rest] = period.split("-");
    return `${QUARTER_LABELS[q]} ${rest.join("-")}`;
  }
  if (period === "opening" || period.startsWith("opening-")) return "Opening Balance";
  const [year, month] = period.split("-");
  return `${FULL_MONTHS[Number(month) - 1]} ${year}`;
};

export const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const generateReceiptNo = () => {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${datePart}-${rand}`;
};

/* ─────────── SORT INDEX ─────────── */
// April=0, May=1, ..., Dec=8, Jan=9, Feb=10, Mar=11, opening=-1
const periodToSortIndex = (period) => {
  if (!period) return 99;
  if (period === "opening" || period.startsWith("opening-")) return -1;
  const month = Number(period.split("-")[1]);
  if (isNaN(month)) return 99;
  return month >= 4 ? month - 4 : month + 8;
};

/* ─────────── CORE LEDGER ENGINE ─────────── */

/**
 * Recalculates the running balance for ONE student in ONE academic year.
 * Scoped strictly to academicYear so multiple years never bleed into each other.
 */
export const recalculateStudentLedger = async (studentId, academicYear) => {
  if (!studentId || !academicYear) return;

  const snap = await getDocs(
    query(collection(db, "feePayments"), where("studentId", "==", studentId))
  );
  if (snap.empty) return;

  // JS-filter for academicYear to avoid requiring a composite Firestore index
  const records = snap.docs
    .map((d) => {
      const data = d.data();
      const si = data.sortIndex ?? periodToSortIndex(data.period);
      return { id: d.id, ref: d.ref, ...data, sortIndex: si };
    })
    .filter((r) => r.academicYear === academicYear && r.sortIndex >= -1 && r.sortIndex <= 11)
    .sort((a, b) => a.sortIndex - b.sortIndex);

  if (records.length === 0) return;

  let runningBalance = 0;
  const updates = [];

  for (const record of records) {
    const carryForward = runningBalance;
    const outstanding  = Math.round(
      carryForward + (record.totalDue || 0) - (record.amountPaid || 0)
    );
    const status =
      outstanding <= 0 ? "paid"
      : (record.amountPaid || 0) > 0 ? "partial"
      : "pending";

    updates.push({ ref: record.ref, carryForward, outstanding, status });
    runningBalance = outstanding;
  }

  for (let i = 0; i < updates.length; i += 200) {
    const b = writeBatch(db);
    updates.slice(i, i + 200).forEach(({ ref, carryForward, outstanding, status }) =>
      b.update(ref, { carryForward, outstanding, status })
    );
    await b.commit();
  }
};

/* ─────────── FEE STRUCTURES ─────────── */

export const getFixedFeeStructures = async (schoolId) => {
  if (!schoolId) return [];
  const snap = await getDocs(query(
    collection(db, "feeStructures"),
    where("schoolId", "==", schoolId),
    where("type", "==", "fixed")
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getVariableFeeStructures = async (schoolId) => {
  if (!schoolId) return [];
  const snap = await getDocs(query(
    collection(db, "feeStructures"),
    where("schoolId", "==", schoolId),
    where("type", "==", "variable")
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const addFeeStructure = async (data) => {
  await addDoc(collection(db, "feeStructures"), {
    ...data,
    amount: Number(data.amount),
    chargedDuringHolidays: data.chargedDuringHolidays ?? true,
    createdAt: serverTimestamp(),
  });
};

export const updateFeeStructure = async (id, data) => {
  await updateDoc(doc(db, "feeStructures", id), {
    ...data,
    amount: Number(data.amount),
    chargedDuringHolidays: data.chargedDuringHolidays ?? true,
  });
};

export const deleteFeeStructure = async (id) => {
  await deleteDoc(doc(db, "feeStructures", id));
};

/* ─────────── STUDENT FEE YEARS ─────────── */
// Replaces the old studentFeeProfiles collection.
// Doc ID: `${studentId}_${academicYear}` — uniquely identifies one student's ledger for one year.

const feeYearDocId = (studentId, academicYear) => `${studentId}_${academicYear}`;

/**
 * Returns the active fee year for a student (used in StudentProfile).
 * Fetches all years for the student and returns the active one.
 */
export const getActiveStudentFeeYear = async (studentId) => {
  if (!studentId) return null;
  const snap = await getDocs(
    query(collection(db, "studentFeeYears"), where("studentId", "==", studentId))
  );
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return docs.find((d) => d.status === "active") || docs[docs.length - 1] || null;
};

export const getStudentFeeYearsAll = async (studentId) => {
  if (!studentId) return [];
  const snap = await getDocs(
    query(collection(db, "studentFeeYears"), where("studentId", "==", studentId))
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (b.academicYear || "").localeCompare(a.academicYear || ""));
};

/**
 * Returns a map of { studentId: profile } for all students in a school + academicYear.
 * Replaces the old getStudentFeeProfiles that read from studentFeeProfiles collection.
 */
export const getStudentFeeProfiles = async (schoolId, academicYear) => {
  if (!schoolId) return {};
  const snap = await getDocs(
    query(collection(db, "studentFeeYears"), where("schoolId", "==", schoolId))
  );
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!academicYear || data.academicYear === academicYear) {
      map[data.studentId] = { id: d.id, ...data };
    }
  });
  return map;
};

/**
 * Close a student's academic year:
 *   1. Locks all payment records (isClosed = true)
 *   2. Computes the closing balance from the last monthly record's outstanding
 *   3. Updates the year entity with status="closed" and closingBalance
 * Returns the closing balance (positive = owes money, negative = credit).
 */
export const closeStudentFeeYear = async (studentId, academicYear) => {
  if (!studentId || !academicYear) return 0;

  const snap = await getDocs(
    query(collection(db, "feePayments"), where("studentId", "==", studentId))
  );

  const yearDocs = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((r) => r.academicYear === academicYear);

  if (yearDocs.length === 0) return 0;

  // Closing balance = outstanding of the last monthly record
  let closingBalance = 0;
  let lastSortIndex  = -2;
  yearDocs.forEach((r) => {
    const si = r.sortIndex ?? periodToSortIndex(r.period);
    if (si >= 0 && si <= 11 && si > lastSortIndex) {
      lastSortIndex  = si;
      closingBalance = r.outstanding || 0;
    }
  });
  closingBalance = Math.round(closingBalance);

  // Lock all payment records
  for (let i = 0; i < yearDocs.length; i += 200) {
    const b = writeBatch(db);
    yearDocs.slice(i, i + 200).forEach(({ ref, isClosed }) => {
      if (!isClosed) b.update(ref, { isClosed: true });
    });
    await b.commit();
  }

  // Update the year entity if it exists
  const yearRef  = doc(db, "studentFeeYears", feeYearDocId(studentId, academicYear));
  const yearSnap = await getDoc(yearRef);
  if (yearSnap.exists()) {
    await updateDoc(yearRef, {
      status: "closed",
      closingBalance,
      closedAt: serverTimestamp(),
    });
  }

  return closingBalance;
};

// Internal helper: create the 12 monthly feePayment records for a year
const _createFeePaymentRecords = async ({
  studentId, studentName, classId, classLabel,
  schoolId, academicYear, schedule, items, holidayMonths,
}) => {
  const recurringItems = items.filter((i) => !i.isOneTime);
  const oneTimeItems   = items.filter((i) =>  i.isOneTime);

  const BASE = {
    studentId, studentName, classId, classLabel, schoolId, academicYear,
    amountPaid: 0, carryForward: 0, outstanding: 0, status: "pending",
    isClosed: false, receiptNo: null, paidAt: null, paidBy: null,
    collectedBy: null, notes: null, createdAt: serverTimestamp(),
  };

  const periods = generatePeriods(schedule, academicYear);
  const batch   = writeBatch(db);

  periods.forEach((period, index) => {
    const isFirstPeriod  = index === 0;
    const isHoliday      = holidayMonths.includes(period);
    const activeRecurring = isHoliday
      ? recurringItems.filter((i) => i.chargedDuringHolidays !== false)
      : recurringItems;
    const periodItems = isFirstPeriod ? [...activeRecurring, ...oneTimeItems] : activeRecurring;
    const periodDue   = periodItems.reduce((s, i) => s + Number(i.amount), 0);
    const sortIndex   = periodToSortIndex(period);

    batch.set(doc(collection(db, "feePayments")), {
      ...BASE,
      period,
      periodLabel:    formatPeriod(period),
      sortIndex,
      totalDue:       periodDue,
      outstanding:    periodDue,
      items:          periodItems,
      isHolidayMonth: isHoliday,
    });
  });

  await batch.commit();
};

/**
 * Create a new student fee year entity + all monthly payment records.
 * If openingBalance != 0, an opening-balance record (sortIndex = -1) is inserted
 * and the full ledger is recalculated so the balance propagates through all months.
 */
export const createStudentFeeYear = async ({
  studentId, studentName, classId, classLabel,
  schoolId, academicYear, schedule, items, holidayMonths = [], openingBalance = 0,
}) => {
  const recurringItems = items.filter((i) => !i.isOneTime);
  const totalPerCycle  = recurringItems.reduce((s, i) => s + Number(i.amount), 0);

  // Create the year entity document
  await setDoc(doc(db, "studentFeeYears", feeYearDocId(studentId, academicYear)), {
    studentId, studentName, classId, classLabel,
    schoolId, academicYear, schedule, items, totalPerCycle,
    openingBalance, closingBalance: null,
    status: "active",
    createdAt: serverTimestamp(), closedAt: null,
  });

  // Create monthly payment records
  if (items.length > 0) {
    await _createFeePaymentRecords({
      studentId, studentName, classId, classLabel,
      schoolId, academicYear, schedule, items, holidayMonths,
    });
  }

  // Create opening balance record if needed, then recalculate
  if (openingBalance !== 0) {
    await addDoc(collection(db, "feePayments"), {
      studentId, studentName, classId, classLabel,
      schoolId, academicYear,
      period:            `opening-${academicYear}`,
      periodLabel:       "Opening Balance (Previous Year)",
      sortIndex:         -1,
      totalDue:          openingBalance > 0 ? openingBalance : 0,
      amountPaid:        openingBalance < 0 ? Math.abs(openingBalance) : 0,
      carryForward:      0,
      outstanding:       openingBalance,
      status:            openingBalance > 0 ? "pending" : "paid",
      isClosed:          true, // historical transfer — locked
      isBalanceTransfer: true,
      receiptNo: null, paidAt: null, paidBy: null, collectedBy: null, notes: null,
      items: [], isHolidayMonth: false,
      createdAt: serverTimestamp(),
    });

    await recalculateStudentLedger(studentId, academicYear);
  }
};

// Backward-compatible alias used by Fees.jsx setup flow
export const createStudentFeeProfile = async (args) => {
  await createStudentFeeYear(args);
};

/* ─────────── MID-YEAR FEE CHANGES ─────────── */

export const addVariableFeeToStudent = async (studentId, feeItem, fromPeriod, academicYear) => {
  // Fetch ALL records and JS-filter — avoids Firestore strict `== false` missing null/undefined isClosed
  const snap = await getDocs(query(
    collection(db, "feePayments"),
    where("studentId", "==", studentId)
  ));

  const eligible = snap.docs.filter((d) => {
    const data = d.data();
    if (data.academicYear !== academicYear) return false;
    const { period } = data;
    if (!period || period === "opening" || period.startsWith("opening-")) return false;
    const si = data.sortIndex ?? periodToSortIndex(period);
    if (si === 99) return false;
    // Current period: always include (even if closed — user is adding it now)
    if (period === fromPeriod) return true;
    // Future periods: only if open. Use string comparison so cross-year works correctly
    // e.g. "2027-04" > "2026-07" is true even though sortIndex(Apr)=0 < sortIndex(Jul)=3
    return !data.isClosed && period > fromPeriod;
  });

  // One-time fees only go to the FIRST matching month (the current period), not all future months
  let toUpdate;
  if (feeItem.isOneTime) {
    const sorted = [...eligible].sort((a, b) =>
      (a.data().sortIndex ?? periodToSortIndex(a.data().period)) -
      (b.data().sortIndex ?? periodToSortIndex(b.data().period))
    );
    toUpdate = sorted.length > 0 ? [sorted[0]] : [];
  } else {
    toUpdate = eligible;
  }

  for (let i = 0; i < toUpdate.length; i += 200) {
    const b = writeBatch(db);
    toUpdate.slice(i, i + 200).forEach((d) => {
      const data = d.data();
      const currentItems = data.items || [];
      if (currentItems.some((it) => it.structureId === feeItem.structureId)) return;
      if (data.isHolidayMonth && feeItem.chargedDuringHolidays === false) return;
      b.update(d.ref, {
        items:    [...currentItems, feeItem],
        totalDue: (data.totalDue || 0) + Number(feeItem.amount),
      });
    });
    await b.commit();
  }

  // Sync the year entity
  const yearRef  = doc(db, "studentFeeYears", feeYearDocId(studentId, academicYear));
  const yearSnap = await getDoc(yearRef);
  if (yearSnap.exists()) {
    const pd = yearSnap.data();
    if (!(pd.items || []).some((i) => i.structureId === feeItem.structureId)) {
      const updatedItems   = [...(pd.items || []), feeItem];
      const recurringTotal = updatedItems.filter((i) => !i.isOneTime).reduce((s, i) => s + Number(i.amount), 0);
      await updateDoc(yearRef, { items: updatedItems, totalPerCycle: recurringTotal });
    }
  }

  await recalculateStudentLedger(studentId, academicYear);
};

export const removeVariableFeeFromStudent = async (studentId, structureId, fromPeriod, academicYear) => {
  const snap = await getDocs(query(
    collection(db, "feePayments"),
    where("studentId", "==", studentId)
  ));

  const toUpdate = snap.docs.filter((d) => {
    const data = d.data();
    if (data.academicYear !== academicYear) return false;
    const { period, status } = data;
    if (!period || period === "opening" || period.startsWith("opening-")) return false;
    if (status === "paid") return false;
    const si = data.sortIndex ?? periodToSortIndex(period);
    if (si === 99) return false;
    if (period === fromPeriod) return true;
    return !data.isClosed && period > fromPeriod;
  });

  for (let i = 0; i < toUpdate.length; i += 200) {
    const b = writeBatch(db);
    toUpdate.slice(i, i + 200).forEach((d) => {
      const data    = d.data();
      const removed = (data.items || []).find((it) => it.structureId === structureId);
      if (!removed) return;
      b.update(d.ref, {
        items:    (data.items || []).filter((it) => it.structureId !== structureId),
        totalDue: Math.max(0, (data.totalDue || 0) - Number(removed.amount)),
      });
    });
    await b.commit();
  }

  // Sync the year entity
  const yearRef  = doc(db, "studentFeeYears", feeYearDocId(studentId, academicYear));
  const yearSnap = await getDoc(yearRef);
  if (yearSnap.exists()) {
    const pd          = yearSnap.data();
    const updatedItems  = (pd.items || []).filter((i) => i.structureId !== structureId);
    const recurringTotal = updatedItems.filter((i) => !i.isOneTime).reduce((s, i) => s + Number(i.amount), 0);
    await updateDoc(yearRef, { items: updatedItems, totalPerCycle: recurringTotal });
  }

  await recalculateStudentLedger(studentId, academicYear);
};

/* ─────────── FEE PAYMENTS ─────────── */

export const getFeePaymentsByStudent = async (studentId, academicYear) => {
  if (!studentId || !academicYear) return [];
  const snap = await getDocs(
    query(collection(db, "feePayments"), where("studentId", "==", studentId))
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return { id: d.id, ...data, sortIndex: data.sortIndex ?? periodToSortIndex(data.period) };
    })
    .filter((r) => r.academicYear === academicYear)
    .sort((a, b) => (a.sortIndex ?? 99) - (b.sortIndex ?? 99));
};

export const getFeePaymentsBySchool = async (schoolId, academicYear) => {
  if (!schoolId) return [];
  const snap = await getDocs(
    query(collection(db, "feePayments"), where("schoolId", "==", schoolId))
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return academicYear ? docs.filter((d) => d.academicYear === academicYear) : docs;
};

/**
 * Record a payment for one period. Triggers full ledger recalculation for the year.
 * academicYear is now an explicit parameter — never inferred from the record itself.
 */
export const recordPayment = async (paymentId, studentId, academicYear, { amountPaid, collectedBy, notes } = {}) => {
  const paid      = Number(amountPaid);
  const receiptNo = paid > 0 ? generateReceiptNo() : null;

  await updateDoc(doc(db, "feePayments", paymentId), {
    amountPaid:  paid,
    receiptNo,
    paidAt:      paid > 0 ? serverTimestamp() : null,
    paidBy:      paid > 0 ? "admin" : null,
    collectedBy: collectedBy || null,
    notes:       notes || null,
  });

  await recalculateStudentLedger(studentId, academicYear);
  return receiptNo;
};

/**
 * Lock a period for all students in a school.
 * After locking, recalculates each student's ledger so the closed period's
 * outstanding balance propagates as carryForward into the next month.
 */
export const closePeriod = async (schoolId, period, academicYear) => {
  if (!schoolId || !period || !academicYear) return { closed: 0, carriedForward: 0, credited: 0 };

  const snap = await getDocs(query(
    collection(db, "feePayments"),
    where("schoolId", "==", schoolId),
    where("period",   "==", period)
  ));
  if (snap.empty) return { closed: 0, carriedForward: 0, credited: 0 };

  const toClose = snap.docs.filter((d) => d.data().academicYear === academicYear);
  if (toClose.length === 0) return { closed: 0, carriedForward: 0, credited: 0 };

  // Collect unique student IDs before updating
  const studentIds = [...new Set(toClose.map((d) => d.data().studentId))];

  // Lock the records
  for (let i = 0; i < toClose.length; i += 200) {
    const b = writeBatch(db);
    toClose.slice(i, i + 200).forEach((d) => {
      if (!d.data().isClosed) b.update(d.ref, { isClosed: true });
    });
    await b.commit();
  }

  // Recalculate each student's ledger so unpaid balance carries into the next month
  await Promise.all(studentIds.map((id) => recalculateStudentLedger(id, academicYear)));

  return { closed: toClose.length, carriedForward: studentIds.length, credited: 0 };
};

/* ─────────── BALANCE & PROMOTION ─────────── */

export const getStudentNetBalance = async (studentId, academicYear) => {
  if (!studentId || !academicYear) return 0;
  const pays = await getFeePaymentsByStudent(studentId, academicYear);

  let lastSortIndex   = -2;
  let lastOutstanding = 0;
  pays.forEach((r) => {
    const si = r.sortIndex ?? periodToSortIndex(r.period);
    if (si >= 0 && si <= 11 && si > lastSortIndex) {
      lastSortIndex   = si;
      lastOutstanding = r.outstanding || 0;
    }
  });
  return Math.round(lastOutstanding);
};

/** Batch-fetch the net balance of multiple students for a specific academic year. */
export const getStudentBalancesMap = async (studentIds, academicYear) => {
  if (!studentIds?.length || !academicYear) return {};

  const latestByStudent = {};
  const chunks = [];
  for (let i = 0; i < studentIds.length; i += 30) chunks.push(studentIds.slice(i, i + 30));

  await Promise.all(chunks.map(async (chunk) => {
    const snap = await getDocs(
      query(collection(db, "feePayments"), where("studentId", "in", chunk))
    );
    snap.docs.forEach((d) => {
      const p  = d.data();
      if (p.academicYear !== academicYear) return; // isolate by year in JS
      const si = p.sortIndex ?? periodToSortIndex(p.period);
      if (si < 0 || si > 11) return;
      if (!latestByStudent[p.studentId] || si > latestByStudent[p.studentId].si) {
        latestByStudent[p.studentId] = { si, outstanding: p.outstanding || 0 };
      }
    });
  }));

  const map = {};
  Object.entries(latestByStudent).forEach(([id, { outstanding }]) => {
    const rounded = Math.round(outstanding);
    if (rounded !== 0) map[id] = rounded;
  });
  return map;
};

/**
 * Full promotion workflow for one student:
 *   1. Close old academic year → compute closingBalance
 *   2. Create new year with closingBalance as openingBalance (if carryBalance is true)
 *   3. New year gets fresh fee structure for the new class
 */
export const createFeeProfileAfterPromotion = async ({
  studentId, studentName, newClassId, newClassLabel,
  schoolId, oldAcademicYear, newAcademicYear,
  previousVariableFeeIds = [], carryBalance = true,
}) => {
  // Close old year and get the closing balance
  const closingBalance = oldAcademicYear
    ? await closeStudentFeeYear(studentId, oldAcademicYear)
    : 0;
  const openingBalance = carryBalance ? closingBalance : 0;

  // Load new class fee structures
  const [fixedFees, allVarFees, schoolSnap] = await Promise.all([
    getFixedFeeStructures(schoolId),
    getVariableFeeStructures(schoolId),
    getDoc(doc(db, "schools", schoolId)),
  ]);

  const classFixed    = fixedFees.filter((f) => f.classId === newClassId);
  const prevVarFees   = allVarFees.filter((v) => previousVariableFeeIds.includes(v.id));
  const holidayMonths = schoolSnap.exists() ? (schoolSnap.data().holidayMonths || []) : [];

  const items = [
    ...classFixed.map((f) => ({
      structureId: f.id, label: f.label, amount: f.amount, type: "fixed",
      isOneTime: f.isOneTime || false, chargedDuringHolidays: f.chargedDuringHolidays ?? true,
    })),
    ...prevVarFees.map((v) => ({
      structureId: v.id, label: v.label, amount: v.amount, type: "variable",
      isOneTime: v.isOneTime || false, chargedDuringHolidays: v.chargedDuringHolidays ?? true,
    })),
  ];

  if (items.length === 0 && openingBalance === 0) return false;

  await createStudentFeeYear({
    studentId, studentName, classId: newClassId, classLabel: newClassLabel,
    schoolId, academicYear: newAcademicYear, schedule: "monthly",
    items, holidayMonths, openingBalance,
  });

  return true;
};
