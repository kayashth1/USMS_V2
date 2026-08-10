import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ================= GET ALL ASSIGNMENTS (ADMIN / SCHOOL VIEW) ================= */
export const getTeacherAssignments = async (schoolId) => {
  if (!schoolId) return [];

  const q = query(
    collection(db, "teacherClassSubjects"),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
};

/* ================= GET ASSIGNMENTS FOR ONE TEACHER (PROFILE VIEW) ================= */
export const getAssignmentsForTeacher = async ({
  teacherId,
  schoolId,
}) => {
  if (!teacherId || !schoolId) return [];

  const q = query(
    collection(db, "teacherClassSubjects"),
    where("teacherId", "==", teacherId),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
};

/* ================= ASSIGN TEACHER ================= */
export const assignTeacher = async ({
  teacherId,
  classId,
  subjectId,
  schoolId,
}) => {
  if (!teacherId || !classId || !subjectId || !schoolId) {
    throw new Error("Missing required assignment fields");
  }

  const existing = await getDocs(query(
    collection(db, "teacherClassSubjects"),
    where("teacherId",  "==", teacherId),
    where("classId",    "==", classId),
    where("subjectId",  "==", subjectId),
    where("schoolId",   "==", schoolId)
  ));
  if (!existing.empty) return;

  await addDoc(collection(db, "teacherClassSubjects"), {
    teacherId,
    classId,
    subjectId,
    schoolId,
    createdAt: serverTimestamp(),
  });
};

/* ================= REMOVE ASSIGNMENT (MANUAL) ================= */
export const removeTeacherAssignment = async (docId) => {
  if (!docId) return;
  await deleteDoc(doc(db, "teacherClassSubjects", docId));
};

/* ================= REMOVE ASSIGNMENTS FOR CLASS + SUBJECT (AUTO CASCADE) ================= */
export const removeTeacherAssignmentsForClassSubject = async ({
  classId,
  subjectId,
  schoolId,
}) => {
  if (!classId || !subjectId || !schoolId) return;

  const q = query(
    collection(db, "teacherClassSubjects"),
    where("classId", "==", classId),
    where("subjectId", "==", subjectId),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);

  for (const d of snap.docs) {
    await deleteDoc(doc(db, "teacherClassSubjects", d.id));
    // 🔥 Triggers onTeacherUnassigned → doubt group deletion
  }
};
