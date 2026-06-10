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

const COL = "customFieldDefs";

export const getCustomFieldDefs = async (schoolId, entity) => {
  if (!schoolId || !entity) return [];

  const q = query(
    collection(db, COL),
    where("schoolId", "==", schoolId),
    where("entity", "==", entity)
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

export const createCustomFieldDef = async (schoolId, entity, { label, type, required }) => {
  const existing = await getCustomFieldDefs(schoolId, entity);
  const order = existing.length > 0 ? Math.max(...existing.map((f) => f.order ?? 0)) + 1 : 0;

  return addDoc(collection(db, COL), {
    schoolId,
    entity,
    label: label.trim(),
    type,
    required: !!required,
    order,
    createdAt: serverTimestamp(),
  });
};

export const updateCustomFieldDef = async (id, data) => {
  await updateDoc(doc(db, COL, id), data);
};

export const deleteCustomFieldDef = async (id) => {
  await deleteDoc(doc(db, COL, id));
};
