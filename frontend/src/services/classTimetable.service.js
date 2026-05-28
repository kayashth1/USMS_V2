import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ── GET ── */
export const getClassTimetable = async (classDocId) => {
  if (!classDocId) return null;
  const snap = await getDoc(doc(db, "classTimetables", classDocId));
  if (!snap.exists()) return null;
  return snap.data(); // week: { day: { [periodId]: slot } }
};

/* ── SAVE ── */
export const saveClassTimetable = async ({ classDocId, schoolId, week }) => {
  if (!classDocId || !schoolId) throw new Error("Missing timetable data");
  const ref = doc(db, "classTimetables", classDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { classDocId, schoolId, week, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { week, updatedAt: serverTimestamp() });
  }
};
