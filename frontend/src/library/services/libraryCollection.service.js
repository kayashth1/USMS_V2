import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { LIBRARY_COLLECTIONS } from "../constants/collections.js";
import { getResourcesByIds } from "./libraryResource.service.js";
import { MAX_RESOURCES_PER_COLLECTION } from "../constants/limits.js";

const col = () => collection(db, LIBRARY_COLLECTIONS.COLLECTIONS);

// ── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new resource collection (SuperAdmin only).
 *
 * @param {object} data
 * @param {string} data.name
 * @param {string} [data.description]
 * @param {string} [data.subject]
 * @param {string} [data.board]
 * @param {string[]} [data.classIds]
 * @param {string} [data.coverImageUrl]
 * @param {string[]} [data.tags]
 * @param {string[]} [data.resourceIds]   - Initial resources to include
 * @param {string} data.createdBy
 * @returns {Promise<string>} collectionId
 */
export async function createCollection(data) {
  const docRef = await addDoc(col(), {
    name:              data.name,
    description:       data.description      ?? "",
    subject:           data.subject          ?? "",
    board:             data.board            ?? "",
    classIds:          data.classIds         ?? [],
    coverImageUrl:     data.coverImageUrl    ?? null,
    tags:              data.tags             ?? [],
    resourceIds:       data.resourceIds      ?? [],
    visibility:        data.visibility       ?? "free",
    selectedSchoolIds: data.selectedSchoolIds ?? [],
    isActive:          true,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
    createdBy:         data.createdBy,
  });
  return docRef.id;
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getCollection(collectionId) {
  const snap = await getDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get all active collections.
 * @param {object} [filters]
 * @param {string} [filters.subject]
 * @param {string} [filters.board]
 * @param {boolean} [filters.includeInactive]
 */
export async function getAllCollections(filters = {}) {
  const constraints = [];
  if (!filters.includeInactive) constraints.push(where("isActive", "==", true));
  if (filters.subject) constraints.push(where("subject", "==", filters.subject));
  if (filters.board)   constraints.push(where("board",   "==", filters.board));
  constraints.push(orderBy("createdAt", "desc"));

  const snap = await getDocs(query(col(), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a collection with its fully-hydrated resource documents.
 * Resources are returned in sort order (array index = sortOrder - 1).
 * @returns {{ collection: object, resources: object[] }}
 */
export async function getCollectionWithResources(collectionId) {
  const c = await getCollection(collectionId);
  if (!c) return null;

  const orderedIds = c.resourceIds ?? [];
  const fetched    = await getResourcesByIds(orderedIds);
  const byId       = Object.fromEntries(fetched.map((r) => [r.id, r]));

  // Preserve the explicit sort order stored in the array
  const resources = orderedIds.map((id) => byId[id]).filter(Boolean);
  return { collection: c, resources };
}

// ── Manage resources ───────────────────────────────────────────────────────

/**
 * Add a resource to a collection.
 *
 * @param {string} collectionId
 * @param {string} resourceId
 * @param {number|null} [insertAt] - 0-based index to insert at. Omit to append at the end.
 */
export async function addResourceToCollection(collectionId, resourceId, insertAt = null) {
  const c = await getCollection(collectionId);
  if (!c) throw new Error("Collection not found.");

  const current = c.resourceIds ?? [];
  if (current.includes(resourceId)) return; // already present — no-op
  if (current.length >= MAX_RESOURCES_PER_COLLECTION) {
    throw new Error(`A collection may not exceed ${MAX_RESOURCES_PER_COLLECTION} resources.`);
  }

  let updated;
  if (insertAt !== null && insertAt >= 0 && insertAt <= current.length) {
    updated = [...current.slice(0, insertAt), resourceId, ...current.slice(insertAt)];
  } else {
    updated = [...current, resourceId]; // default: append (highest sort order)
  }

  await updateDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId), {
    resourceIds: updated,
    updatedAt:   serverTimestamp(),
  });
}

export async function removeResourceFromCollection(collectionId, resourceId) {
  const c = await getCollection(collectionId);
  if (!c) return;

  const updated = (c.resourceIds ?? []).filter((id) => id !== resourceId);
  await updateDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId), {
    resourceIds: updated,
    updatedAt:   serverTimestamp(),
  });
}

/**
 * Replace the resource order in a collection (drag-to-reorder in the UI).
 * The provided array must contain exactly the same IDs already in the collection —
 * no additions, no removals.
 *
 * @param {string}   collectionId
 * @param {string[]} orderedResourceIds - Full list in the desired order
 */
export async function reorderCollectionResources(collectionId, orderedResourceIds) {
  const c = await getCollection(collectionId);
  if (!c) throw new Error("Collection not found.");

  const existing = new Set(c.resourceIds ?? []);
  if (
    orderedResourceIds.length !== existing.size ||
    !orderedResourceIds.every((id) => existing.has(id))
  ) {
    throw new Error(
      "reorderCollectionResources must receive the same set of resource IDs, only reordered."
    );
  }

  await updateDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId), {
    resourceIds: orderedResourceIds,
    updatedAt:   serverTimestamp(),
  });
}

// ── Update / Deactivate / Delete ───────────────────────────────────────────

export async function updateCollection(collectionId, updates) {
  const { createdAt, createdBy, resourceIds, ...safeUpdates } = updates;
  await updateDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId), {
    ...safeUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function setCollectionActive(collectionId, isActive) {
  await updateDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a collection entirely (SuperAdmin only).
 * Also removes school-level collection assignments for this collection.
 */
export async function deleteCollection(collectionId) {
  const assignSnap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.SCHOOL_COLLECTION_ASSIGNMENTS),
    where("collectionId", "==", collectionId)
  ));
  await Promise.all(assignSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, LIBRARY_COLLECTIONS.COLLECTIONS, collectionId));
}
