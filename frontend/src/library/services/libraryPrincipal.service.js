/**
 * Principal-facing library service.
 * Principals browse the catalog, then assign resources/collections to classes.
 * Files are never duplicated — assignments are Firestore references only.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { LIBRARY_COLLECTIONS } from "../constants/collections.js";
import { Visibility } from "../constants/enums.js";
import { getAllResources } from "./libraryResource.service.js";
import { getAllCollections } from "./libraryCollection.service.js";
import {
  assignCollectionToSchool,
  assignResourceToSchool,
  unassignCollectionFromSchool,
} from "./libraryAssignment.service.js";

// ── Visibility filter ──────────────────────────────────────────────────────

function isVisibleToSchool(item, schoolId, schoolPlan) {
  if (item.visibility === Visibility.FREE) return true;
  if (item.visibility === Visibility.PREMIUM) return schoolPlan === "premium";
  if (item.visibility === Visibility.SELECTED_SCHOOLS) {
    return (item.selectedSchoolIds ?? []).includes(schoolId);
  }
  return false;
}

// ── Catalog queries ────────────────────────────────────────────────────────

/**
 * All active resources visible to this school (respects plan + selected_schools).
 */
export async function getSchoolCatalog(schoolId, schoolPlan) {
  const all = await getAllResources({ includeInactive: false });
  return all.filter((r) => isVisibleToSchool(r, schoolId, schoolPlan));
}

/**
 * All active collections visible to this school.
 */
export async function getSchoolCollectionsCatalog(schoolId, schoolPlan) {
  const all = await getAllCollections({ includeInactive: false });
  return all.filter((c) => isVisibleToSchool(c, schoolId, schoolPlan));
}

// ── Assignment map ─────────────────────────────────────────────────────────

/**
 * Returns { [resourceId]: string[] } — which classIds have this resource assigned.
 * Used to show assignment status on catalog cards.
 */
export async function getSchoolAssignmentMap(schoolId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS),
    where("schoolId", "==", schoolId)
  ));
  const map = {};
  for (const d of snap.docs) {
    const { resourceId, classId } = d.data();
    if (!map[resourceId]) map[resourceId] = [];
    if (!map[resourceId].includes(classId)) map[resourceId].push(classId);
  }
  return map;
}

// ── Assign resource to classes ─────────────────────────────────────────────

/**
 * Directly assign a single resource to one or more classes.
 * Marks the assignment as direct (directAssign: true) so it is NOT removed
 * when a containing collection is later de-assigned.
 */
export async function assignResourceToClasses(schoolId, classIds, resourceId, assignedBy) {
  await assignResourceToSchool(schoolId, resourceId, assignedBy);
  await Promise.all(
    classIds.map((classId) => {
      const id = `${schoolId}_${classId}_${resourceId}`;
      return setDoc(
        doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, id),
        { schoolId, classId, resourceId, assignedAt: serverTimestamp(), assignedBy, directAssign: true },
        { merge: true }
      );
    })
  );
}

// ── Assign collection to classes ───────────────────────────────────────────

/**
 * Assign an entire collection to one or more classes.
 * Each class-resource assignment records which collection created it via
 * collectionIds[]. If the document already exists (direct assign or other
 * collection), we only append to collectionIds — we never overwrite.
 */
export async function assignCollectionToClasses(
  schoolId,
  classIds,
  collectionId,
  resourceIds,
  assignedBy
) {
  await assignCollectionToSchool(schoolId, collectionId, assignedBy);
  await Promise.all(
    resourceIds.flatMap((resourceId) =>
      classIds.map(async (classId) => {
        await assignResourceToSchool(schoolId, resourceId, assignedBy);
        const id  = `${schoolId}_${classId}_${resourceId}`;
        const ref = doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          // Already assigned (direct or other collection) — just track this collection
          await updateDoc(ref, { collectionIds: arrayUnion(collectionId) });
        } else {
          await setDoc(ref, {
            schoolId, classId, resourceId,
            assignedAt: serverTimestamp(), assignedBy,
            directAssign: false,
            collectionIds: [collectionId],
          });
        }
      })
    )
  );
}

/**
 * De-assign a collection from one or more classes.
 * For each resource:
 *   - If the assignment was ONLY from this collection (no directAssign, no other
 *     collectionIds) → delete the document entirely.
 *   - Otherwise → remove this collection from collectionIds, keep the document.
 * Also removes the school-level collection assignment when no class in this
 * school still has resources from the collection assigned via this collection.
 */
export async function unassignCollectionFromClasses(
  schoolId,
  classIds,
  collectionId,
  resourceIds,
  assignedBy
) {
  await Promise.all(
    resourceIds.flatMap((resourceId) =>
      classIds.map(async (classId) => {
        const id  = `${schoolId}_${classId}_${resourceId}`;
        const ref = doc(db, LIBRARY_COLLECTIONS.CLASS_RESOURCE_ASSIGNMENTS, id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data();
        const remainingCollections = (data.collectionIds ?? []).filter((c) => c !== collectionId);

        if (!data.directAssign && remainingCollections.length === 0) {
          // Assigned solely through this collection — safe to remove entirely
          await deleteDoc(ref);
        } else {
          // Still claimed by direct assignment or another collection — keep it
          await updateDoc(ref, { collectionIds: remainingCollections });
        }
      })
    )
  );

  // Clean up school-level collection assignment
  await unassignCollectionFromSchool(schoolId, collectionId);
}

