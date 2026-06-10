import {
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  FieldPath,
} from "firebase/firestore";
import { db } from "@/config/firebase";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Returns { [teacherId]: { monday: [...], tuesday: [...], ... } }
// Each slot: { periodId, subjectId, subjectName }
const extractTeacherSlots = (week) => {
  const result = {};
  for (const day of DAYS) {
    for (const [periodId, slot] of Object.entries(week?.[day] ?? {})) {
      if (!slot?.teacherId) continue;
      if (!result[slot.teacherId]) {
        result[slot.teacherId] = Object.fromEntries(DAYS.map((d) => [d, []]));
      }
      result[slot.teacherId][day].push({
        periodId,
        subjectId:   slot.subjectId   ?? null,
        subjectName: slot.subjectName ?? null,
      });
    }
  }
  return result;
};

/* ── GET ── */
export const getClassTimetable = async (classDocId) => {
  if (!classDocId) return null;
  const snap = await getDoc(doc(db, "classTimetables", classDocId));
  return snap.exists() ? snap.data() : null;
};

/* ── SAVE ──
   Writes class timetable + auto-syncs all affected teacher timetable docs
   in one batch. Cost: 1 read (old class doc) + N+1 batch writes.
*/
export const saveClassTimetable = async ({ classDocId, schoolId, week, className }) => {
  if (!classDocId || !schoolId) throw new Error("Missing timetable data");

  // 1 read — needed to find teachers who were removed from this class
  const classRef = doc(db, "classTimetables", classDocId);
  const oldSnap  = await getDoc(classRef);
  const oldWeek  = oldSnap.exists() ? (oldSnap.data().week ?? {}) : {};

  const oldTeacherMap = extractTeacherSlots(oldWeek);
  const newTeacherMap = extractTeacherSlots(week);
  // Teachers in old timetable but not in new — their class entry needs clearing
  const removedIds = Object.keys(oldTeacherMap).filter((id) => !newTeacherMap[id]);

  const batch = writeBatch(db);
  const emptyWeek = Object.fromEntries(DAYS.map((d) => [d, []]));
  const classLabel = className ?? classDocId;

  // ── Class timetable ──
  if (!oldSnap.exists()) {
    batch.set(classRef, {
      classDocId, schoolId, week,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(classRef, { week, updatedAt: serverTimestamp() });
  }

  // ── Add/update teacher entries (mergeFields keeps other classes intact) ──
  for (const [teacherId, teacherWeek] of Object.entries(newTeacherMap)) {
    batch.set(
      doc(db, "teacherTimetables", teacherId),
      {
        teacherId,
        schoolId,
        byClass: { [classDocId]: { className: classLabel, ...teacherWeek } },
      },
      { mergeFields: ["teacherId", "schoolId", new FieldPath("byClass", classDocId)] }
    );
  }

  // ── Clear class entry for removed teachers (write empty arrays, no deleteField needed) ──
  for (const teacherId of removedIds) {
    batch.set(
      doc(db, "teacherTimetables", teacherId),
      {
        teacherId,
        schoolId,
        byClass: { [classDocId]: { className: classLabel, ...emptyWeek } },
      },
      { mergeFields: ["teacherId", "schoolId", new FieldPath("byClass", classDocId)] }
    );
  }

  await batch.commit();
};
