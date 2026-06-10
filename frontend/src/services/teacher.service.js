// src/services/teacher.service.js

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/config/firebase";

export const getTeachersBySchool = async (schoolId) => {
  if (!schoolId) return [];

  const q = query(
    collection(db, "teachers"),
    where("schoolId", "==", schoolId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};


/* =====================================================
   CREATE TEACHER (DEMO ONLY – FRONTEND)
===================================================== */
export const createTeacher = async (teacherData) => {
  const res = await fetch(
    "https://createteacher-z4likafkwq-uc.a.run.app",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teacherData),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to create teacher");
  }

  return data;
};


/* =====================================================
   GET SINGLE TEACHER
===================================================== */
export const getTeacherById = async (teacherId) => {
  const ref = doc(db, "teachers", teacherId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
};

/* =====================================================
   UPDATE TEACHER
===================================================== */
export const updateTeacher = async (teacherId, updatedData) => {
  const ref = doc(db, "teachers", teacherId);

  await updateDoc(ref, {
    ...updatedData,
    updatedAt: serverTimestamp(),
  });
};

/* =====================================================
   PERMANENT DELETE TEACHER
===================================================== */
export const deleteTeacher = async (teacherId) => {
  const res = await fetch(
    "https://deleteteacher-z4likafkwq-uc.a.run.app",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to delete teacher");
  }

  return data;
};
