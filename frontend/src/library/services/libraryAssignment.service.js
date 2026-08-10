/**
 * Assignment service — references only, no file duplication.
 *
 * Document ID patterns (idempotent by design):
 *   schoolResourceAssignments : {schoolId}_{resourceId}
 *   schoolCollectionAssignments : {schoolId}_{collectionId}
 *   classResourceAssignments  : {schoolId}_{classId}_{resourceId}
 *
 * Firestore auto-IDs are 20 alphanumeric characters with no underscores,
 * so the underscore separator is always unambiguous.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { LIBRARY_COLLECTIONS } from "../constants/collections.js";
import { getResourcesByIds } from "./libraryResource.service.js";
import { getCollection } from "./libraryCollection.service.js";

// ── ID builders ────────────────────────────────────────────────────────────

const schoolResourceId     = (s, r)    => `${s}_${r}`;
const schoolCollectionId   = (s, c)    => `${s}_${c}`;
const classResourceId      = (s, cl, r) => `${s}_${cl}_${r}`;

// ── School ↔ Resource assignments ─────────────────────────────────────────

/**
 * Assign a single resource to a school (idempotent).
 * Can be called by SuperAdmin or the school's Principal.
 */
export async function assignResourceToSchool(schoolId, resourceId, assignedBy) {
  const id = schoolResourceId(schoolId, resourceId);
  await setDoc(
    doc(db, LIBRARY_COLLECTIONS.SCHOOL_RESOURCE_ASSIGNMENTS, id),
    { schoolId, resourceId, assignedAt: serverTimestamp(), assignedBy },
    { merge: true }
  );
}

export async function unassignResourceFromSchool(schoolId, resourceId) {
  await deleteDoc(
    doc(db, LIBRARY_COLLECTIONS.SCHOOL_RESOURCE_ASSIGNMENTS, schoolResourceId(schoolId, resourceId))
  );
}

export async function isResourceAssignedToSchool(schoolId, resourceId) {
  const snap = await getDoc(
    doc(db, LIBRARY_COLLECTIONS.SCHOOL_RESOURCE_ASSIGNMENTS, schoolResourceId(schoolId, resourceId))
  );
  return snap.exists();
}

/**
 * Returns all resource documents assigned to a school.
 */
export async function getSchoolAssignedResources(schoolId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.SCHOOL_RESOURCE_ASSIGNMENTS),
    where("schoolId", "==", schoolId)
  ));
  const resourceIds = snap.docs.map((d) => d.data().resourceId);
  return getResourcesByIds(resourceIds);
}

// ── School ↔ Collection assignments ───────────────────────────────────────

/**
 * Assign an entire collection to a school (idempotent).
 */
export async function assignCollectionToSchool(schoolId, collectionId, assignedBy) {
  const id = schoolCollectionId(schoolId, collectionId);
  await setDoc(
    doc(db, LIBRARY_COLLECTIONS.SCHOOL_COLLECTION_ASSIGNMENTS, id),
    { schoolId, collectionId, assignedAt: serverTimestamp(), assignedBy },
    { merge: true }
  );
}

export async function unassignCollectionFromSchool(schoolId, collectionId) {
  await deleteDoc(
    doc(db, LIBRARY_COLLECTIONS.SCHOOL_COLLECTION_ASSIGNMENTS, schoolCollectionId(schoolId, collectionId))
  );
}

/**
 * Returns all collection documents assigned to a school.
 */
export async function getSchoolAssignedCollections(schoolId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.SCHOOL_COLLECTION_ASSIGNMENTS),
    where("schoolId", "==", schoolId)
  ));
  const collectionIds = snap.docs.map((d) => d.data().collectionId);
  if (collectionIds.length === 0) return [];

  const results = await Promise.all(collectionIds.map(getCollection));
  return results.filter(Boolean);
}

// ── Class ↔ Resource assignments ──────────────────────────────────────────

/**
 * Assign a resource to a specific class within a school (idempotent).
 * The resource must already be assigned to the school first.
 */
export async function assignResourceToClass(schoolId, classId, resourceId, assignedBy) {
  const schoolAssigned = await isResourceAssignedToSchool(schoolId, resourceId);
  if (!schoolAssigned) {
    throw new Error(
      "This resource must first be assigned to the school before assigning to a class."
    );
  }

  const id = classResourceId(schoolId, classId, resourceId);
  await setDoc(
    doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, id),
    { schoolId, classId, resourceId, assignedAt: serverTimestamp(), assignedBy },
    { merge: true }
  );
}

export async function unassignResourceFromClass(schoolId, classId, resourceId) {
  await deleteDoc(
    doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, classResourceId(schoolId, classId, resourceId))
  );
}

export async function isResourceAssignedToClass(schoolId, classId, resourceId) {
  const snap = await getDoc(
    doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, classResourceId(schoolId, classId, resourceId))
  );
  return snap.exists();
}

/**
 * Returns all resource documents assigned to a specific class.
 * Used by the Flutter student app.
 */
export async function getClassAssignedResources(schoolId, classId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS),
    where("schoolId", "==", schoolId),
    where("classId",  "==", classId)
  ));
  const resourceIds = snap.docs.map((d) => d.data().resourceId);
  return getResourcesByIds(resourceIds);
}

/**
 * Bulk-assign all resources in a school's assignment list to a specific class.
 * Convenience for "assign all school resources to class X".
 */
export async function assignAllSchoolResourcesToClass(schoolId, classId, assignedBy) {
  const resources = await getSchoolAssignedResources(schoolId);
  await Promise.all(
    resources.map((r) =>
      assignResourceToClass(schoolId, classId, r.id, assignedBy).catch(() => {})
    )
  );
}

/**
 * Remove all class assignments when a class is deleted or rolled over.
 */
export async function clearClassAssignments(schoolId, classId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS),
    where("schoolId", "==", schoolId),
    where("classId",  "==", classId)
  ));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
