import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";

export const getTimePeriodsBySchool = async (schoolId) => {
  if (!schoolId) return [];
  const q = query(collection(db, "timePeriods"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(a.order) - Number(b.order));
};

export const addTimePeriod = async ({ schoolId, name, from, to, order }) => {
  await addDoc(collection(db, "timePeriods"), {
    schoolId, name, from, to, order: Number(order),
    createdAt: serverTimestamp(),
  });
};

export const updateTimePeriod = async (id, { name, from, to, order }) => {
  await updateDoc(doc(db, "timePeriods", id), {
    name, from, to, order: Number(order),
  });
};

export const deleteTimePeriod = async (id) => {
  await deleteDoc(doc(db, "timePeriods", id));
};
