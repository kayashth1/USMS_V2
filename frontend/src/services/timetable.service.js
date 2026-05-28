import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ================= DEFAULT WEEK ================= */
const DEFAULT_WEEK = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
};

/* ======================================================
   GET TEACHER TIMETABLE
====================================================== */
export const getTeacherTimetable = async (teacherId) => {
  if (!teacherId) return null;

  const ref = doc(db, "teacherTimetables", teacherId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data();

  return {
    id: snap.id,
    ...data,
    // ✅ GUARANTEE week shape
    week: {
      ...DEFAULT_WEEK,
      ...(data.week || {}),
    },
  };
};

/* ======================================================
   CREATE / UPDATE TEACHER TIMETABLE
====================================================== */
export const saveTeacherTimetable = async ({
  teacherId,
  schoolId,
  week,
}) => {
  if (!teacherId || !schoolId || !week) {
    throw new Error("Missing timetable data");
  }

  const ref = doc(db, "teacherTimetables", teacherId);
  const snap = await getDoc(ref);

  const safeWeek = {
    ...DEFAULT_WEEK,
    ...week,
  };

  // ✅ Create
  if (!snap.exists()) {
    await setDoc(ref, {
      teacherId,
      schoolId,
      isActive: true,
      week: safeWeek,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  // ✅ Update
  await updateDoc(ref, {
    week: safeWeek,
    updatedAt: serverTimestamp(),
  });
};

/* ======================================================
   ADD SLOT TO A DAY
====================================================== */
export const addSlotToDay = ({
  timetable,
  day,
  slot,
}) => {
  if (!timetable || !day || !slot) return timetable;

  const updated = structuredClone(timetable);

  // ✅ FULL SAFETY
  if (!updated.week) {
    updated.week = structuredClone(DEFAULT_WEEK);
  }

  if (!updated.week[day]) {
    updated.week[day] = [];
  }

  updated.week[day].push(slot);

  return updated;
};

/* ======================================================
   REMOVE SLOT
====================================================== */
export const removeSlotFromDay = ({
  timetable,
  day,
  index,
}) => {
  if (
    !timetable ||
    !timetable.week ||
    !timetable.week[day]
  ) {
    return timetable;
  }

  const updated = structuredClone(timetable);
  updated.week[day].splice(index, 1);

  return updated;
};
