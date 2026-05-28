import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";

/* =========================================
   GET SUBJECTS FOR A STUDENT
   (UPDATED: classId-based, SAME FUNCTION NAME)
========================================= */
export const getSubjectsForStudent = async ({
  classId,
  schoolId,
}) => {
  if (!classId || !schoolId) return [];

  // 1️⃣ Get classSubjects using classId
  const q = query(
    collection(db, "classSubjects"),
    where("classId", "==", classId),
    where("schoolId", "==", schoolId)
  );

  const classSubjectSnap = await getDocs(q);
  if (classSubjectSnap.empty) return [];

  // 2️⃣ Extract subjectIds
  const subjectIds = classSubjectSnap.docs.map(
    (d) => d.data().subjectId
  );

  // 3️⃣ Fetch actual subject documents
  const subjects = await Promise.all(
    subjectIds.map(async (subjectId) => {
      const ref = doc(db, "subjects", subjectId);
      const snap = await getDoc(ref);

      return snap.exists()
        ? { id: snap.id, ...snap.data() }
        : null;
    })
  );

  // 4️⃣ Remove nulls
  return subjects.filter(Boolean);
};
