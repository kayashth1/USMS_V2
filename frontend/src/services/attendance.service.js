/**
 * Attendance Service — Admin Panel
 *
 * Read-only against the attendance Firestore path written by the Teacher App.
 * Schema (canonical source: Teacher App attendance_remote_datasource.dart):
 *
 *   attendance/{schoolId}/academicYears/{academicYearId}/classes/{classId}/months/{month}
 *
 *   month doc ID  : 2-char zero-padded calendar month, e.g. "07"
 *   day key       : "yyyy-MM-dd" string, e.g. "2026-07-30"
 *   day value     : { records: { [studentId]: boolean }, teacherId, subjectId, periodId, markedAt }
 *
 * The only write in this file is saveAttendanceSettings — stored in schools/{schoolId}.
 * NO attendance records are ever created, modified, or deleted from the Admin Panel.
 */

import { db } from "@/config/firebase";
import {
  doc, getDoc, getDocs, collection,
  query, where, limit, updateDoc,
} from "firebase/firestore";

// ── Path builders ─────────────────────────────────────────────────────────────

function _monthRef(schoolId, ayId, classId, month) {
  return doc(db, "attendance", schoolId, "academicYears", ayId, "classes", classId, "months", month);
}

function _monthsColRef(schoolId, ayId, classId) {
  return collection(db, "attendance", schoolId, "academicYears", ayId, "classes", classId, "months");
}

// ── Date helpers (exported for UI components) ─────────────────────────────────

export function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function currentMonthStr() {
  return String(new Date().getMonth() + 1).padStart(2, "0");
}

// ── Academic Year ─────────────────────────────────────────────────────────────

/**
 * Returns the Firestore document ID of the active academic year.
 * Matches what the Teacher App resolves via AcademicYearContext.
 */
export async function resolveActiveAcademicYearId(schoolId) {
  const q = query(
    collection(db, "academicYears"),
    where("schoolId", "==", schoolId),
    where("status", "==", "active"),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

export async function getAcademicYearsForSchool(schoolId) {
  const q = query(collection(db, "academicYears"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.year.localeCompare(a.year)); // newest first
}

// ── Core reads ────────────────────────────────────────────────────────────────

export async function getMonthAttendance(schoolId, academicYearId, classId, month) {
  const snap = await getDoc(_monthRef(schoolId, academicYearId, classId, month));
  return snap.exists() ? snap.data() : null;
}

export async function getAllMonthsAttendance(schoolId, academicYearId, classId) {
  const snap = await getDocs(_monthsColRef(schoolId, academicYearId, classId));
  const result = {};
  snap.forEach((d) => { result[d.id] = d.data(); });
  return result;
}

// ── Today's operational status ────────────────────────────────────────────────

/**
 * For each classId, returns whether attendance was recorded today and the day-level data.
 * Used by the operational dashboard to show principals which classes are done/pending.
 *
 * @param {string}   schoolId
 * @param {string}   academicYearId
 * @param {string[]} classIds  — Firestore document IDs from the classes collection
 * @returns {Promise<Array<{classId, recorded, present, absent, total, teacherId, subjectId, periodId, markedAt}>>}
 */
export async function getSchoolTodayStatus(schoolId, academicYearId, classIds) {
  const today = todayDateStr();
  const month = currentMonthStr();

  return Promise.all(
    classIds.map(async (classId) => {
      const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
      const dayData = data?.days?.[today] ?? null;

      if (!dayData) {
        return { classId, recorded: false, present: 0, absent: 0, total: 0, teacherId: null, subjectId: null, periodId: null, markedAt: null };
      }

      const records = dayData.records ?? {};
      const vals = Object.values(records);
      return {
        classId,
        recorded: true,
        present: vals.filter(Boolean).length,
        absent: vals.filter((v) => v === false).length,
        total: vals.length,
        teacherId: dayData.teacherId ?? null,
        subjectId: dayData.subjectId ?? null,
        periodId: dayData.periodId ?? null,
        markedAt: dayData.markedAt ?? null,
      };
    })
  );
}

// ── Monthly aggregation ───────────────────────────────────────────────────────

function _computeMonthSummary(monthData) {
  if (!monthData) {
    return { workingDays: 0, attendancePct: 0, totalPresent: 0, totalAbsent: 0, byStudent: {}, days: {} };
  }

  const days = monthData.days ?? {};
  const byStudent = {};

  Object.values(days).forEach((dayData) => {
    Object.entries(dayData.records ?? {}).forEach(([studentId, present]) => {
      if (!byStudent[studentId]) byStudent[studentId] = { present: 0, absent: 0 };
      if (present) byStudent[studentId].present++;
      else byStudent[studentId].absent++;
    });
  });

  const workingDays = Object.keys(days).length;
  const studentIds = Object.keys(byStudent);
  const totalPresent = studentIds.reduce((s, id) => s + byStudent[id].present, 0);
  const totalAbsent = studentIds.reduce((s, id) => s + byStudent[id].absent, 0);
  const maxPossible = workingDays * studentIds.length;

  return {
    workingDays,
    attendancePct: maxPossible > 0 ? Math.round((totalPresent / maxPossible) * 100) : 0,
    totalPresent,
    totalAbsent,
    byStudent,
    days,
  };
}

export async function getClassMonthlySummary(schoolId, academicYearId, classId, month) {
  const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
  return _computeMonthSummary(data);
}

/**
 * Fetches monthly summaries for all classes in parallel.
 * Used to populate the class performance table on the dashboard.
 */
export async function getSchoolMonthlySummary(schoolId, academicYearId, classIds, month) {
  return Promise.all(
    classIds.map(async (classId) => {
      const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
      return { classId, ..._computeMonthSummary(data) };
    })
  );
}

// ── Student attendance ────────────────────────────────────────────────────────

export async function getStudentMonthlySummary(schoolId, academicYearId, classId, studentId, month) {
  const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
  if (!data) return { present: 0, absent: 0, workingDays: 0, pct: 0, byDate: {} };

  const days = data.days ?? {};
  const byDate = {};
  let present = 0, absent = 0;

  Object.entries(days).forEach(([date, dayData]) => {
    const records = dayData.records ?? {};
    if (studentId in records) {
      byDate[date] = records[studentId];
      if (records[studentId]) present++;
      else absent++;
    }
  });

  const total = present + absent;
  return {
    present, absent,
    workingDays: Object.keys(days).length,
    pct: total > 0 ? Math.round((present / total) * 100) : 0,
    byDate,
  };
}

export async function getStudentYearlyAttendance(schoolId, academicYearId, classId, studentId) {
  const allMonths = await getAllMonthsAttendance(schoolId, academicYearId, classId);
  let totalPresent = 0, totalAbsent = 0;
  const byMonth = {};

  Object.entries(allMonths).forEach(([month, monthData]) => {
    let mp = 0, ma = 0;
    Object.values(monthData.days ?? {}).forEach((dayData) => {
      const val = (dayData.records ?? {})[studentId];
      if (val === true) { mp++; totalPresent++; }
      else if (val === false) { ma++; totalAbsent++; }
    });
    byMonth[month] = { present: mp, absent: ma };
  });

  const total = totalPresent + totalAbsent;
  return {
    totalPresent, totalAbsent, total,
    pct: total > 0 ? Math.round((totalPresent / total) * 100) : 0,
    byMonth,
  };
}

// ── Teacher activity log ──────────────────────────────────────────────────────

/**
 * Returns a sorted list of all days attendance was recorded for one class in a month.
 * Each entry includes who recorded it, when, and the present/absent counts.
 */
export async function getClassTeacherActivityLog(schoolId, academicYearId, classId, month) {
  const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
  if (!data) return [];

  return Object.entries(data.days ?? {})
    .map(([date, dayData]) => {
      const vals = Object.values(dayData.records ?? {});
      return {
        date,
        teacherId: dayData.teacherId ?? null,
        subjectId: dayData.subjectId ?? null,
        periodId: dayData.periodId ?? null,
        markedAt: dayData.markedAt ?? null,
        present: vals.filter(Boolean).length,
        absent: vals.filter((v) => v === false).length,
        total: vals.length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Single-read helper for ClassAttendance page.
 * Fetches one month document and returns the raw days map, pre-computed summary,
 * and a sorted activity log — all from a single Firestore read.
 */
export async function getClassMonthFullData(schoolId, academicYearId, classId, month) {
  const data = await getMonthAttendance(schoolId, academicYearId, classId, month);
  const summary = _computeMonthSummary(data);

  const activityLog = Object.entries(data?.days ?? {})
    .map(([date, dayData]) => {
      const vals = Object.values(dayData.records ?? {});
      return {
        date,
        teacherId: dayData.teacherId ?? null,
        subjectId: dayData.subjectId ?? null,
        periodId:  dayData.periodId  ?? null,
        markedAt:  dayData.markedAt  ?? null,
        present:   vals.filter(Boolean).length,
        absent:    vals.filter((v) => v === false).length,
        total:     vals.length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    raw:        data,           // full month doc or null
    days:       data?.days ?? {},
    activityLog,
    ...summary,                 // workingDays, attendancePct, byStudent, totalPresent, totalAbsent
  };
}

// ── Attendance Settings ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  openBeforeMinutes: 10,   // how many minutes before period start the teacher can open attendance
  closeAfterMinutes: 15,   // how many minutes after period start the window closes
  lockImmediately: false,  // if true, attendance cannot be changed after saving
  allowCorrections: false, // placeholder — correction request flow not implemented yet
};

export async function getAttendanceSettings(schoolId) {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return { ...DEFAULT_SETTINGS };
  return snap.data().attendanceSettings ?? { ...DEFAULT_SETTINGS };
}

export async function saveAttendanceSettings(schoolId, settings) {
  await updateDoc(doc(db, "schools", schoolId), { attendanceSettings: settings });
}
