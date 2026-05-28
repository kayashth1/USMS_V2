import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* ================= ADD SUBJECT (GLOBAL ONLY) ================= */
export const addSubject = async ({ name, schoolId }) => {
  if (!name || !schoolId) {
    throw new Error("Missing subject or school");
  }

  const trimmed = name.trim();

  // 🔒 Prevent duplicates (case-insensitive handled at UI level)
  const q = query(
    collection(db, "subjects"),
    where("schoolId", "==", schoolId),
    where("name", "==", trimmed)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error("Subject already exists");
  }

  await addDoc(collection(db, "subjects"), {
    name: trimmed,
    schoolId,
    isActive: true, // kept to avoid schema issues
    createdAt: serverTimestamp(),
  });
};

/* ================= GET SUBJECTS ================= */
export const getSubjectsBySchool = async (schoolId) => {
  const q = query(
    collection(db, "subjects"),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
};

/* ================= TOGGLE SUBJECT ================= */
export const toggleSubjectStatus = async (subjectId, isActive) => {
  await updateDoc(doc(db, "subjects", subjectId), { isActive });
};

/* ================= DELETE SUBJECT (SAFE) ================= */
export const deleteSubject = async ({ subjectId, schoolId }) => {
  // ❗ Block delete if subject is still assigned
  const q = query(
    collection(db, "classSubjects"),
    where("subjectId", "==", subjectId),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error(
      "Subject is assigned to one or more classes. Remove it from classes first."
    );
  }

  await deleteDoc(doc(db, "subjects", subjectId));
};
