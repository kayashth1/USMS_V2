/**
 * Financial Reports Service
 *
 * Read-only Firestore queries for all four financial report types.
 * No writes — never modifies any existing collection.
 *
 * Required composite indexes (create in Firebase Console if missing):
 *   feeInstallments:    schoolId ASC, academicYear ASC
 *   feeRevisions:       schoolId ASC, academicYear ASC, status ASC
 *   feePayments:        schoolId ASC, academicYear ASC, status ASC, paymentDate DESC (likely exists)
 *   studentFeeProfiles: schoolId ASC, academicYear ASC                              (likely exists)
 */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "@/fees-v2/constants/collections.js";
import { PaymentStatus } from "@/fees-v2/constants/enums.js";
import { getAcademicYearsBySchool, getProfile } from "@/fees-v2";

// ── Internal helpers ──────────────────────────────────────────────────────────

export function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
}

function _studentName(s) {
  if (!s) return "—";
  const full = s.fullName ?? s.name ?? "";
  if (full.trim()) return full.trim();
  return [s.firstName, s.lastName].filter(Boolean).join(" ") || "—";
}

function _admissionId(s) {
  return s?.admissionId ?? s?.admissionNo ?? s?.enrollmentId ?? "—";
}

async function _fetchStudentMap(studentIds) {
  const unique = [...new Set(studentIds.filter(Boolean))];
  if (!unique.length) return {};
  const snaps = await Promise.all(unique.map(id => getDoc(doc(db, "students", id))));
  const map = {};
  snaps.forEach(s => { if (s.exists()) map[s.id] = { id: s.id, ...s.data() }; });
  return map;
}

function _buildClassOptions(profiles) {
  const seen = new Map();
  profiles.forEach(p => {
    if (p.classId && p.classLabel) seen.set(p.classId, p.classLabel);
  });
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── 1. Monthly Collection ─────────────────────────────────────────────────────

/**
 * Returns confirmed payments for a school/year with optional filters.
 *
 * @param {string} schoolId
 * @param {string} academicYear   "YYYY-YY"
 * @param {{ month?: number, classId?: string, paymentMode?: string }} filters
 * @returns {Promise<{ rows: Object[], classOptions: Object[], summary: Object }>}
 */
export async function getMonthlyCollection(schoolId, academicYear, filters = {}) {
  const { month, classId, paymentMode } = filters;

  const [paySnap, profileSnap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.FEE_PAYMENTS),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
      where("status",       "==", PaymentStatus.CONFIRMED),
      orderBy("paymentDate", "desc"),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
    )),
  ]);

  const allProfiles = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const profileMap  = {};
  allProfiles.forEach(p => { profileMap[p.studentId] = p; });

  const classOptions = _buildClassOptions(allProfiles);

  let payments = paySnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (month != null) {
    payments = payments.filter(p => {
      const d = toDate(p.paymentDate);
      return d && (d.getMonth() + 1) === Number(month);
    });
  }
  if (paymentMode) {
    payments = payments.filter(p => p.paymentMode === paymentMode);
  }
  if (classId) {
    payments = payments.filter(p => profileMap[p.studentId]?.classId === classId);
  }

  const studentIds = [...new Set(payments.map(p => p.studentId))];
  const studentMap = await _fetchStudentMap(studentIds);

  const rows = payments.map(p => ({
    id:          p.id,
    receiptNo:   p.receiptNo    ?? "—",
    studentId:   p.studentId,
    studentName: _studentName(studentMap[p.studentId]),
    admissionId: _admissionId(studentMap[p.studentId]),
    class:       profileMap[p.studentId]?.classLabel ?? "—",
    classId:     profileMap[p.studentId]?.classId   ?? "",
    paymentDate: toDate(p.paymentDate),
    paymentMode: p.paymentMode  ?? "—",
    amount:      Number(p.paymentAmount ?? 0),
    collectedBy: p.collectedBy  ?? "—",
  }));

  const totalCollection  = rows.reduce((s, r) => s + r.amount, 0);
  const transactionCount = rows.length;
  const averagePayment   = transactionCount > 0 ? Math.round(totalCollection / transactionCount) : 0;

  // Daily trend (sorted ascending)
  const byDay = {};
  rows.forEach(r => {
    if (!r.paymentDate) return;
    const key = r.paymentDate.toISOString().slice(0, 10);
    byDay[key] = (byDay[key] ?? 0) + r.amount;
  });
  const trend = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  return { rows, classOptions, summary: { totalCollection, transactionCount, averagePayment, trend } };
}

// ── 2. Outstanding Report ─────────────────────────────────────────────────────

/**
 * Computes outstanding balances for all students in a school/year.
 * Fetches profiles + all installments in 2 parallel queries.
 *
 * @param {string} schoolId
 * @param {string} academicYear
 * @param {{ classId?: string, minOutstanding?: number }} filters
 * @returns {Promise<{ rows: Object[], classOptions: Object[], summary: Object }>}
 */
export async function getOutstandingReport(schoolId, academicYear, filters = {}) {
  const { classId, minOutstanding } = filters;

  const [profileSnap, instSnap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.FEE_INSTALLMENTS),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
    )),
  ]);

  const allProfiles  = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const classOptions = _buildClassOptions(allProfiles);

  // installment balance map: profileId → total non-cancelled balance
  const instBalanceMap = {};
  instSnap.docs.forEach(d => {
    const data = d.data();
    if (data.status === "cancelled") return;
    instBalanceMap[data.feeProfileId] =
      (instBalanceMap[data.feeProfileId] ?? 0) + (typeof data.balance === "number" ? data.balance : 0);
  });

  let profiles = classId ? allProfiles.filter(p => p.classId === classId) : allProfiles;

  const studentIds = [...new Set(profiles.map(p => p.studentId))];
  const studentMap = await _fetchStudentMap(studentIds);

  const rows = [];
  profiles.forEach(profile => {
    const openingRemaining = Math.max(
      0,
      (profile.openingOutstanding ?? 0) - (profile.openingPaid ?? 0)
    );
    const installmentBalance = instBalanceMap[profile.id] ?? 0;
    const outstanding        = openingRemaining + installmentBalance;

    if (outstanding <= 0) return;
    if (minOutstanding != null && outstanding < Number(minOutstanding)) return;

    const student = studentMap[profile.studentId];
    rows.push({
      studentId:          profile.studentId,
      studentName:        _studentName(student),
      admissionId:        _admissionId(student),
      class:              profile.classLabel ?? "—",
      classId:            profile.classId    ?? "",
      outstanding,
      openingOutstanding: openingRemaining,
      installmentBalance,
      profileId:          profile.id,
    });
  });

  rows.sort((a, b) => b.outstanding - a.outstanding);

  const outstandingTotal   = rows.reduce((s, r) => s + r.outstanding, 0);
  const studentsPending    = rows.length;
  const averageOutstanding = studentsPending > 0 ? Math.round(outstandingTotal / studentsPending) : 0;

  return { rows, classOptions, summary: { outstandingTotal, studentsPending, averageOutstanding } };
}

// ── 3. Student Ledger ─────────────────────────────────────────────────────────

/**
 * Builds a complete financial timeline for one student in one academic year.
 * Uses the deterministic profile ID (${studentId}_${academicYearId}) for a direct lookup.
 *
 * @param {string} studentId
 * @param {string} academicYear  "YYYY-YY"
 * @param {string} schoolId
 * @returns {Promise<{ profile: Object|null, student: Object|null, events: Object[], currentBalance: number }>}
 */
export async function getStudentLedger(studentId, academicYear, schoolId) {
  // Resolve profile via deterministic ID (requires academicYearId)
  const years   = await getAcademicYearsBySchool(schoolId);
  const yearDoc = years.find(y => y.year === academicYear);

  let profile = null;
  if (yearDoc) {
    profile = await getProfile(`${studentId}_${yearDoc.id}`);
  }
  // Fallback: query by studentId + academicYear (needs composite index)
  if (!profile) {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
      where("studentId",    "==", studentId),
      where("academicYear", "==", academicYear),
    ));
    if (!snap.empty) profile = { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  if (!profile) return { profile: null, student: null, events: [], currentBalance: 0 };

  // 4 parallel fetches scoped to this profile
  const [instSnap, paySnap, revSnap, studentSnap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.FEE_INSTALLMENTS),
      where("feeProfileId", "==", profile.id),
      orderBy("installmentNumber", "asc"),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.FEE_PAYMENTS),
      where("feeProfileId", "==", profile.id),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.FEE_REVISIONS),
      where("profileId", "==", profile.id),
    )),
    getDoc(doc(db, "students", studentId)),
  ]);

  const student      = studentSnap.exists() ? { id: studentSnap.id, ...studentSnap.data() } : null;
  const installments = instSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payments     = paySnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(a.paymentDate)?.getTime() ?? 0) - (toDate(b.paymentDate)?.getTime() ?? 0));
  const revisions    = revSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const events = [];

  // Profile creation
  events.push({
    date:        toDate(profile.createdAt) ?? new Date(0),
    type:        "profile_created",
    description: "Fee profile created",
    debit: 0, credit: 0,
    meta: { netAnnualFee: profile.netAnnualFee, schedule: profile.schedule },
  });

  if ((profile.openingOutstanding ?? 0) > 0) {
    events.push({
      date:        toDate(profile.createdAt) ?? new Date(0),
      type:        "opening_outstanding",
      description: "Balance carry forward (prior year outstanding)",
      debit: profile.openingOutstanding, credit: 0, meta: {},
    });
  }

  if ((profile.openingCredit ?? 0) > 0) {
    events.push({
      date:        toDate(profile.createdAt) ?? new Date(0),
      type:        "opening_credit",
      description: "Opening credit from prior year",
      debit: 0, credit: profile.openingCredit, meta: {},
    });
  }

  // Installment charges
  installments.forEach(inst => {
    if (inst.status === "cancelled") return;
    events.push({
      date:        toDate(inst.dueDate) ?? new Date(0),
      type:        "installment",
      description: `Installment due — ${inst.periodLabel ?? inst.period ?? ""}`,
      debit:  inst.netAmount ?? 0,
      credit: 0,
      meta: {
        period: inst.period, periodLabel: inst.periodLabel,
        installmentNumber: inst.installmentNumber,
        status: inst.status, balance: inst.balance,
      },
    });
  });

  // Payments (confirmed and cancelled)
  payments.forEach(pmt => {
    const cancelled = pmt.status === "cancelled";
    events.push({
      date:        toDate(pmt.paymentDate) ?? new Date(0),
      type:        cancelled ? "payment_cancelled" : "payment",
      description: cancelled
        ? `Payment cancelled — ${pmt.receiptNo ?? ""}`
        : `Payment received — ${pmt.receiptNo ?? ""}`,
      debit:  cancelled ? (pmt.paymentAmount ?? 0) : 0,
      credit: cancelled ? 0 : (pmt.paymentAmount ?? 0),
      meta: {
        receiptNo:        pmt.receiptNo,
        paymentMode:      pmt.paymentMode,
        collectedBy:      pmt.collectedBy,
        cancellationNote: pmt.cancellationNote,
      },
    });
  });

  // Applied revisions (informational — balance reflects post-revision installment netAmounts)
  revisions
    .filter(r => r.status === "applied" && r.appliedAt)
    .forEach(rev => {
      events.push({
        date:        toDate(rev.appliedAt),
        type:        "revision",
        description: `Fee revision applied — ${rev.reason ?? ""}`,
        debit: 0, credit: 0,
        meta: { revisionId: rev.id, reason: rev.reason, appliedBy: rev.appliedBy },
      });
    });

  // Sort chronologically; for same-date events keep profile_created first
  events.sort((a, b) => {
    const diff = (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
    if (diff !== 0) return diff;
    const order = ["profile_created", "opening_outstanding", "opening_credit"];
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Running balance
  let balance = 0;
  events.forEach(e => {
    balance += (e.debit ?? 0) - (e.credit ?? 0);
    e.balance = balance;
  });

  return { profile, student, events, currentBalance: balance };
}

// ── 4. Scholarship Report ─────────────────────────────────────────────────────

const SCHOLARSHIP_TYPES = new Set([
  "scholarship", "concession", "sibling_discount", "staff_benefit", "government_scheme",
]);

/**
 * Returns all scholarship/concession adjustments across profiles for a school/year.
 *
 * @param {string} schoolId
 * @param {string} academicYear
 * @param {{ classId?: string }} filters
 * @returns {Promise<{ rows: Object[], classOptions: Object[] }>}
 */
export async function getScholarshipReport(schoolId, academicYear, filters = {}) {
  const { classId } = filters;

  const profileSnap = await getDocs(query(
    collection(db, COLLECTIONS.STUDENT_FEE_PROFILES),
    where("schoolId",     "==", schoolId),
    where("academicYear", "==", academicYear),
  ));

  const allProfiles  = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const classOptions = _buildClassOptions(allProfiles);

  const profiles = allProfiles.filter(p => {
    if (classId && p.classId !== classId) return false;
    return Array.isArray(p.feeAdjustments) && p.feeAdjustments.some(a => SCHOLARSHIP_TYPES.has(a.type));
  });

  if (!profiles.length) return { rows: [], classOptions };

  // Fetch applied revisions to get appliedBy / appliedAt metadata
  const [revSnap, studentMap] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.FEE_REVISIONS),
      where("schoolId",     "==", schoolId),
      where("academicYear", "==", academicYear),
      where("status",       "==", "applied"),
    )),
    _fetchStudentMap([...new Set(profiles.map(p => p.studentId))]),
  ]);

  const revByProfile = {};
  revSnap.docs.forEach(d => {
    const data = d.data();
    if (!revByProfile[data.profileId]) revByProfile[data.profileId] = [];
    revByProfile[data.profileId].push({ id: d.id, ...data });
  });

  const rows = [];
  for (const profile of profiles) {
    const student   = studentMap[profile.studentId];
    const revisions = revByProfile[profile.id] ?? [];

    for (const adj of profile.feeAdjustments) {
      if (!SCHOLARSHIP_TYPES.has(adj.type)) continue;

      // Find the revision that added this adjustment
      const matchRev = revisions.find(r =>
        Array.isArray(r.changes) &&
        r.changes.some(c =>
          (c.type === "add_adjustment") &&
          (c.changeDetails?.adjustmentType === adj.type || c.changeDetails?.type === adj.type)
        )
      );

      rows.push({
        studentId:       profile.studentId,
        studentName:     _studentName(student),
        admissionId:     _admissionId(student),
        class:           profile.classLabel ?? "—",
        classId:         profile.classId    ?? "",
        scholarshipType: adj.type,
        label:           adj.label ?? adj.type,
        calculationType: adj.calculationType ?? "fixed_amount",
        value:           adj.value ?? 0,
        annualAmount:    adj.computedAmount ?? 0,
        recurring:       !(adj.isOneTime ?? false),
        appliedBy:       matchRev?.appliedBy ?? profile.createdBy ?? "—",
        revisionDate:    toDate(matchRev?.appliedAt) ?? toDate(profile.createdAt),
        status:          profile.status,
        profileId:       profile.id,
      });
    }
  }

  rows.sort((a, b) => a.class.localeCompare(b.class) || a.studentName.localeCompare(b.studentName));
  return { rows, classOptions };
}
