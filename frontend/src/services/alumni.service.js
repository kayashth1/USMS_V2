import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";

export const getAlumniBySchool = async (schoolId) => {
  if (!schoolId) return [];
  const q = query(
    collection(db, "students"),
    where("schoolId",    "==", schoolId),
    where("isGraduated", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
