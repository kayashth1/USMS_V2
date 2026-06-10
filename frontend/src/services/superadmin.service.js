import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

// Replace these with your actual deployed Cloud Run / Cloud Function URLs
const CREATE_SCHOOL_URL = "https://us-central1-usms-v2.cloudfunctions.net/createSchool";
const DELETE_SCHOOL_URL = "https://us-central1-usms-v2.cloudfunctions.net/deleteSchool";

/* ── GET ALL SCHOOLS ── */
export const getAllSchools = async () => {
  const snap = await getDocs(collection(db, "schools"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/* ── GET SINGLE SCHOOL ── */
export const getSchool = async (schoolId) => {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

/* ── GET PRINCIPAL FOR SCHOOL ── */
export const getPrincipalBySchool = async (schoolId) => {
  const q = query(
    collection(db, "principals"),
    where("schoolId", "==", schoolId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

/* ── AGGREGATE STATS ── */
export const getPlatformStats = async () => {
  const [schoolsSnap, studentsSnap, teachersSnap] = await Promise.all([
    getCountFromServer(collection(db, "schools")),
    getCountFromServer(collection(db, "students")),
    getCountFromServer(collection(db, "teachers")),
  ]);

  const allSchools = await getAllSchools();
  const activeSchools = allSchools.filter((s) => s.isActive !== false).length;

  return {
    totalSchools:   schoolsSnap.data().count,
    activeSchools,
    totalStudents:  studentsSnap.data().count,
    totalTeachers:  teachersSnap.data().count,
  };
};

/* ── SCHOOL ENTITY COUNTS ── */
export const getSchoolEntityCounts = async (schoolId) => {
  const [studentsSnap, teachersSnap] = await Promise.all([
    getCountFromServer(query(collection(db, "students"), where("schoolId", "==", schoolId))),
    getCountFromServer(query(collection(db, "teachers"), where("schoolId", "==", schoolId))),
  ]);
  return {
    students: studentsSnap.data().count,
    teachers: teachersSnap.data().count,
  };
};

/* ── RECENT SCHOOLS (last 5) ── */
export const getRecentSchools = async () => {
  const q = query(
    collection(db, "schools"),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/* ── UPDATE SUBSCRIPTION ── */
export const updateSchoolSubscription = async (schoolId, { plan, planExpiresAt, isActive }) => {
  await updateDoc(doc(db, "schools", schoolId), {
    plan,
    planExpiresAt: planExpiresAt || null,
    isActive,
    updatedAt: serverTimestamp(),
  });
};

/* ── CREATE SCHOOL (via Cloud Function) ── */
export const createSchool = async (data) => {
  const res = await fetch(CREATE_SCHOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to create school");
  return result;
};

/* ── DELETE SCHOOL (via Cloud Function) ── */
export const deleteSchool = async (schoolId) => {
  const res = await fetch(DELETE_SCHOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schoolId }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to delete school");
  return result;
};
