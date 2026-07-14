// src/services/student.service.js

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/config/firebase";

/* ================= GET STUDENTS BY SCHOOL ================= */
export const getStudentsBySchool = async (schoolId) => {
  if (!schoolId) return [];

  const q = query(
    collection(db, "students"),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.isActive !== false && s.status !== "alumni");
};

/* ================= CREATE STUDENT ================= */
export const createStudent = async (data) => {
  const res = await fetch(
    "https://createstudent-z4likafkwq-uc.a.run.app/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  
  const result = await res.json();
  
  if (!res.ok) {
    throw new Error(result.error || "Failed to create student");
  }
  
  return result;
};
/* ================= UPDATE STUDENT ================= */


export const updateStudent = async (studentId, data) => {
  if (!studentId) throw new Error("Student ID missing");
  
  const ref = doc(db, "students", studentId);
  
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

/* ================= PROMOTE STUDENTS ================= */
export const promoteStudents = async ({
  studentIds,
  fromClassId,
  fromClassLabel,
  toClassId,
  toClassLabel,
  promotedBy,
}) => {
  const now = new Date().toISOString();
  const historyEntry = { fromClassId, fromClassLabel, toClassId, toClassLabel, promotedAt: now, promotedBy };

  await Promise.all(
    studentIds.map((id) =>
      updateDoc(doc(db, "students", id), {
        classId: toClassId,
        classLabel: toClassLabel,
        promotionHistory: arrayUnion(historyEntry),
        updatedAt: serverTimestamp(),
      })
    )
  );
};

/* ================= GRADUATE STUDENTS (Class 12 → Alumni) ================= */
export const graduateStudents = async ({
  studentIds,
  fromClassId,
  fromClassLabel,
  academicYear,
  graduatedBy,
}) => {
  await Promise.all(
    studentIds.map((id) =>
      updateDoc(doc(db, "students", id), {
        isActive: false,
        isGraduated: true,
        finalClassId: fromClassId,
        finalClassLabel: fromClassLabel,
        academicYear,
        graduatedBy: graduatedBy || null,
        graduatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  );
};

/* ================= DELETE STUDENT ================= */
export const deleteStudent = async (studentId) => {
  const res = await fetch(
    "https://deletestudent-z4likafkwq-uc.a.run.app",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to delete student");
  }

  return data;
};
