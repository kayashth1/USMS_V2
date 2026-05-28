import {
  collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ─────────── UTILS ─────────── */

export const currentAcademicYear = () => {
  const now = new Date();
  const m = now.getMonth(); // 0-indexed; April = 3
  const y = now.getFullYear();
  const startYear = m >= 3 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
};

export const generatePeriods = (schedule, academicYear) => {
  const startYear = Number(academicYear.split("-")[0]);
  if (schedule === "quarterly") {
    return [
      `Q1-${academicYear}`, // Apr–Jun
      `Q2-${academicYear}`, // Jul–Sep
      `Q3-${academicYear}`, // Oct–Dec
      `Q4-${academicYear}`, // Jan–Mar
    ];
  }
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = (3 + i) % 12; // 3=Apr … 0=Jan
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
  Q1: "Q1 (Apr–Jun)",
  Q2: "Q2 (Jul–Sep)",
  Q3: "Q3 (Oct–Dec)",
  Q4: "Q4 (Jan–Mar)",
};

export const formatPeriod = (period) => {
  if (period.startsWith("Q")) {
    const [q, ...rest] = period.split("-");
    return `${QUARTER_LABELS[q]} ${rest.join("-")}`;
  }
  const [year, month] = period.split("-");
  return `${FULL_MONTHS[Number(month) - 1]} ${year}`;
};

const generateReceiptNo = () => {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${datePart}-${rand}`;
};

/* ─────────── FEE STRUCTURES ─────────── */

export const getFixedFeeStructures = async (schoolId) => {
  if (!schoolId) return [];
  const q = query(
    collection(db, "feeStructures"),
    where("schoolId", "==", schoolId),
    where("type", "==", "fixed")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getVariableFeeStructures = async (schoolId) => {
  if (!schoolId) return [];
  const q = query(
    collection(db, "feeStructures"),
    where("schoolId", "==", schoolId),
    where("type", "==", "variable")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const addFeeStructure = async (data) => {
  await addDoc(collection(db, "feeStructures"), {
    ...data,
    amount: Number(data.amount),
    createdAt: serverTimestamp(),
  });
};

export const updateFeeStructure = async (id, data) => {
  await updateDoc(doc(db, "feeStructures", id), { ...data, amount: Number(data.amount) });
};

export const deleteFeeStructure = async (id) => {
  await deleteDoc(doc(db, "feeStructures", id));
};

/* ─────────── STUDENT FEE PROFILES ─────────── */

// Returns map: { [studentId]: profile }
export const getStudentFeeProfiles = async (schoolId) => {
  if (!schoolId) return {};
  const q = query(collection(db, "studentFeeProfiles"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
  return map;
};

export const createStudentFeeProfile = async ({
  studentId, studentName, classId, classLabel,
  schoolId, academicYear, schedule, items,
}) => {
  const recurringItems = items.filter((i) => !i.isOneTime);
  const oneTimeItems   = items.filter((i) => i.isOneTime);
  const totalPerCycle  = recurringItems.reduce((s, i) => s + Number(i.amount), 0);
  const totalOneTime   = oneTimeItems.reduce((s, i) => s + Number(i.amount), 0);

  await setDoc(doc(db, "studentFeeProfiles", studentId), {
    studentId, studentName, classId, classLabel,
    schoolId, academicYear, schedule, items, totalPerCycle,
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);

  const BASE_PAYMENT = {
    studentId, studentName, classId, classLabel, schoolId, academicYear,
    amountPaid: 0, status: "pending", carryForward: 0, isClosed: false,
    paidAt: null, paidBy: null, collectedBy: null, receiptNo: null, notes: null,
    createdAt: serverTimestamp(),
  };

  // One feePayment record per period for recurring fees
  if (totalPerCycle > 0) {
    const periods = generatePeriods(schedule, academicYear);
    periods.forEach((period) => {
      batch.set(doc(collection(db, "feePayments")), {
        ...BASE_PAYMENT, period, periodLabel: formatPeriod(period), totalDue: totalPerCycle,
      });
    });
  }

  // Single payment record for all one-time charges combined
  if (totalOneTime > 0) {
    batch.set(doc(collection(db, "feePayments")), {
      ...BASE_PAYMENT, period: "one-time", periodLabel: "One-time Charges", totalDue: totalOneTime,
    });
  }

  await batch.commit();
};

/* ─────────── CARRY-FORWARD / CLOSE PERIOD ─────────── */

const getNextPeriod = (period) => {
  if (!period || period === "one-time") return null;
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return null;
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  return `${ny}-${String(nm).padStart(2, "0")}`;
};

export const closePeriod = async (schoolId, period) => {
  if (!schoolId || !period || period === "one-time") return { closed: 0, carriedForward: 0 };

  // Load current period records
  const q = query(
    collection(db, "feePayments"),
    where("schoolId", "==", schoolId),
    where("period",   "==", period)
  );
  const snap = await getDocs(q);
  if (snap.empty) return { closed: 0, carriedForward: 0 };

  // Load next period records (keyed by studentId)
  const nextPeriod = getNextPeriod(period);
  const nextMap = {};
  if (nextPeriod) {
    const nSnap = await getDocs(query(
      collection(db, "feePayments"),
      where("schoolId", "==", schoolId),
      where("period",   "==", nextPeriod)
    ));
    nSnap.docs.forEach((d) => { nextMap[d.data().studentId] = d; });
  }

  // Collect all write operations
  const ops = [];
  let carriedForward = 0;

  snap.docs.forEach((payDoc) => {
    const p = payDoc.data();
    if (p.isClosed) return;

    ops.push({ ref: payDoc.ref, data: { isClosed: true } });

    const effectiveDue = (p.totalDue || 0) + (p.carryForward || 0);
    const unpaid = effectiveDue - (p.amountPaid || 0);

    if (unpaid > 0 && nextPeriod && nextMap[p.studentId]) {
      const nextDoc = nextMap[p.studentId];
      const existing = nextDoc.data().carryForward || 0;
      ops.push({ ref: nextDoc.ref, data: { carryForward: existing + unpaid } });
      carriedForward++;
    }
  });

  // Execute in chunks of 200 to stay within Firestore batch limit
  for (let i = 0; i < ops.length; i += 200) {
    const b = writeBatch(db);
    ops.slice(i, i + 200).forEach(({ ref, data }) => b.update(ref, data));
    await b.commit();
  }

  return { closed: snap.docs.length, carriedForward };
};

/* ─────────── FEE PAYMENTS ─────────── */

export const getFeePaymentsByStudent = async (studentId) => {
  if (!studentId) return [];
  const q = query(collection(db, "feePayments"), where("studentId", "==", studentId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.period.localeCompare(b.period));
};

export const getFeePaymentsBySchool = async (schoolId) => {
  if (!schoolId) return [];
  const q = query(collection(db, "feePayments"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const markAsPaid = async (paymentId, { totalDue, collectedBy, notes } = {}) => {
  const receiptNo = generateReceiptNo();
  await updateDoc(doc(db, "feePayments", paymentId), {
    amountPaid: totalDue,
    status: "paid",
    paidAt: serverTimestamp(),
    paidBy: "admin",
    collectedBy: collectedBy || null,
    receiptNo,
    notes: notes || null,
  });
  return receiptNo;
};

export const recordPartialPayment = async (paymentId, { totalDue, amountPaid, collectedBy, notes } = {}) => {
  const paid = Number(amountPaid);
  const status = paid >= totalDue ? "paid" : paid > 0 ? "partial" : "pending";
  const receiptNo = status === "paid" ? generateReceiptNo() : null;
  await updateDoc(doc(db, "feePayments", paymentId), {
    amountPaid: paid,
    status,
    paidAt: paid > 0 ? serverTimestamp() : null,
    paidBy: paid > 0 ? "admin" : null,
    collectedBy: collectedBy || null,
    receiptNo,
    notes: notes || null,
  });
  return receiptNo;
};
