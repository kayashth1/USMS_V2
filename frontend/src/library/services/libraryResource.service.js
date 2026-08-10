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
  arrayRemove,
  documentId,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { LIBRARY_COLLECTIONS } from "../constants/collections.js";
import { deleteStorageFile } from "./libraryStorage.service.js";

const col = () => collection(db, LIBRARY_COLLECTIONS.RESOURCES);

// ── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new library resource record (SuperAdmin only).
 *
 * Call uploadResourceFile + uploadCoverImage first to get the storage fields,
 * then pass the combined metadata here.
 *
 * @param {object} data
 * @param {string} data.name
 * @param {string} data.description
 * @param {string} data.subject
 * @param {string[]} [data.classIds]         - Which grades this suits (optional)
 * @param {string} data.board                - Board enum value
 * @param {string} data.language
 * @param {string} [data.author]
 * @param {string} [data.publisher]
 * @param {string} [data.coverImagePath]     - Storage path
 * @param {string} [data.coverImageUrl]
 * @param {string} data.fileType             - FileType enum value
 * @param {number} data.fileSize             - Bytes
 * @param {string} data.storagePath          - Storage path of the resource file
 * @param {string} data.downloadUrl
 * @param {string[]} [data.tags]
 * @param {string} data.visibility           - Visibility enum value (free|premium|selected_schools)
 * @param {string[]} [data.selectedSchoolIds] - Only used when visibility === "selected_schools"
 * @param {string} data.createdBy            - SuperAdmin UID
 * @returns {Promise<string>} resourceId
 */
export async function createResource(data) {
  const docRef = await addDoc(col(), {
    name:           data.name,
    description:    data.description ?? "",
    subject:        data.subject,
    classIds:       data.classIds        ?? [],
    board:          data.board,
    language:       data.language        ?? "English",
    author:         data.author          ?? "",
    publisher:      data.publisher       ?? "",
    coverImagePath: data.coverImagePath  ?? null,
    coverImageUrl:  data.coverImageUrl   ?? null,
    fileType:       data.fileType,
    fileSize:       data.fileSize,
    storagePath:    data.storagePath,
    downloadUrl:    data.downloadUrl,
    tags:              data.tags              ?? [],
    visibility:        data.visibility,
    selectedSchoolIds: data.selectedSchoolIds ?? [],
    isActive:          true,
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
    createdBy:      data.createdBy,
  });
  return docRef.id;
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getResource(resourceId) {
  const snap = await getDoc(doc(db, LIBRARY_COLLECTIONS.RESOURCES, resourceId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Fetch multiple resources by their IDs (batched, avoids N+1).
 * Handles batches of up to 30 (Firestore `in` limit).
 */
export async function getResourcesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(col(), where(documentId(), "in", chunk)))
    )
  );
  const map = {};
  for (const snap of results) {
    for (const d of snap.docs) map[d.id] = { id: d.id, ...d.data() };
  }
  return unique.map((id) => map[id]).filter(Boolean);
}

/**
 * Get all active resources, with optional filters.
 *
 * @param {object} [filters]
 * @param {string} [filters.subject]
 * @param {string} [filters.board]
 * @param {string} [filters.fileType]
 * @param {boolean} [filters.includeInactive]
 */
export async function getAllResources(filters = {}) {
  const constraints = [];

  if (!filters.includeInactive) {
    constraints.push(where("isActive", "==", true));
  }
  if (filters.subject)    constraints.push(where("subject",    "==", filters.subject));
  if (filters.board)      constraints.push(where("board",      "==", filters.board));
  if (filters.fileType)   constraints.push(where("fileType",   "==", filters.fileType));
  if (filters.visibility) constraints.push(where("visibility", "==", filters.visibility));

  constraints.push(orderBy("createdAt", "desc"));

  const snap = await getDocs(query(col(), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Update ─────────────────────────────────────────────────────────────────

/**
 * Update metadata fields on a resource (SuperAdmin only).
 * Pass only the fields to change. storagePath and downloadUrl cannot be changed
 * here — to replace a file, delete and re-create the resource.
 */
export async function updateResource(resourceId, updates) {
  const { storagePath, downloadUrl, createdAt, createdBy, ...safeUpdates } = updates;
  await updateDoc(doc(db, LIBRARY_COLLECTIONS.RESOURCES, resourceId), {
    ...safeUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function setResourceActive(resourceId, isActive) {
  await updateDoc(doc(db, LIBRARY_COLLECTIONS.RESOURCES, resourceId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

// ── Delete ─────────────────────────────────────────────────────────────────

/**
 * Fully delete a resource (SuperAdmin only — hard delete).
 *
 * Cascade order:
 *   1. Remove resourceId from every libraryCollection that references it
 *   2. Delete all schoolResourceAssignment docs for this resource
 *   3. Delete all classResourceAssignment docs for this resource
 *   4. Delete the libraryResources Firestore document
 *   5. Delete the file and cover image from Firebase Storage
 */
export async function deleteResource(resourceId) {
  const resource = await getResource(resourceId);
  if (!resource) return;

  await Promise.all([
    _removeFromAllCollections(resourceId),
    _deleteResourceAssignments(resourceId),
  ]);

  await deleteDoc(doc(db, LIBRARY_COLLECTIONS.RESOURCES, resourceId));

  if (resource.storagePath)    await deleteStorageFile(resource.storagePath);
  if (resource.coverImagePath) await deleteStorageFile(resource.coverImagePath);
}

/**
 * Replace the resource file in Storage and update Firestore.
 * Old Storage file is deleted after the new one is confirmed.
 */
export async function replaceResourceFile(resourceId, file, fileType, onProgress) {
  const resource = await getResource(resourceId);
  if (!resource) throw new Error("Resource not found.");

  const { storagePath, downloadUrl, fileSize } = await uploadResourceFile(file, fileType, onProgress);

  await updateDoc(doc(db, LIBRARY_COLLECTIONS.RESOURCES, resourceId), {
    storagePath,
    downloadUrl,
    fileSize,
    fileType,
    updatedAt: serverTimestamp(),
  });

  if (resource.storagePath && resource.storagePath !== storagePath) {
    await deleteStorageFile(resource.storagePath);
  }
}

async function _removeFromAllCollections(resourceId) {
  const snap = await getDocs(query(
    collection(db, LIBRARY_COLLECTIONS.COLLECTIONS),
    where("resourceIds", "array-contains", resourceId)
  ));
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(d.ref, { resourceIds: arrayRemove(resourceId) })
    )
  );
}

async function _deleteResourceAssignments(resourceId) {
  const { SCHOOL_RESOURCE_ASSIGNMENTS, CLASS_RESOURCE_ASSIGNMENTS } = LIBRARY_COLLECTIONS;

  const [schoolSnap, classSnap] = await Promise.all([
    getDocs(query(
      collection(db, SCHOOL_RESOURCE_ASSIGNMENTS),
      where("resourceId", "==", resourceId)
    )),
    getDocs(query(
      collection(db, CLASS_RESOURCE_ASSIGNMENTS),
      where("resourceId", "==", resourceId)
    )),
  ]);

  await Promise.all([
    ...schoolSnap.docs.map((d) => deleteDoc(d.ref)),
    ...classSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);
}
