import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "@/config/firebase";
import { FILE_TYPE_FOLDERS } from "../constants/enums.js";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_COVER_IMAGE_BYTES,
} from "../constants/limits.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getExtension(file) {
  return file.name.split(".").pop().toLowerCase();
}

function storagePath(folder, ext) {
  return `library/${folder}/${generateId()}.${ext}`;
}

// ── Resumable upload ───────────────────────────────────────────────────────

/**
 * Upload a library resource file to Firebase Storage.
 *
 * @param {File}   file       - The file to upload
 * @param {string} fileType   - One of the FileType enum values
 * @param {Function} onProgress - Optional callback({ bytesTransferred, totalBytes, percentage })
 * @returns {Promise<{ storagePath: string, downloadUrl: string, fileSize: number }>}
 */
export function uploadResourceFile(file, fileType, onProgress) {
  const maxBytes = MAX_FILE_SIZE_BYTES[fileType];
  if (maxBytes && file.size > maxBytes) {
    return Promise.reject(
      new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit for this type.`)
    );
  }

  const folder  = FILE_TYPE_FOLDERS[fileType];
  if (!folder) return Promise.reject(new Error(`Unknown file type: ${fileType}`));

  const ext  = getExtension(file);
  const path = storagePath(folder, ext);
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: { originalName: file.name },
    });

    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snap.bytesTransferred,
            totalBytes:       snap.totalBytes,
            percentage:       Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          });
        }
      },
      reject,
      async () => {
        const downloadUrl = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath: path, downloadUrl, fileSize: file.size });
      }
    );
  });
}

/**
 * Upload a cover image for a library resource.
 *
 * @param {File}     file       - Image file (JPG/PNG/WEBP)
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<{ coverImagePath: string, coverImageUrl: string }>}
 */
export function uploadCoverImage(file, onProgress) {
  if (file.size > MAX_COVER_IMAGE_BYTES) {
    return Promise.reject(
      new Error(`Cover image exceeds the ${MAX_COVER_IMAGE_BYTES / 1024 / 1024} MB limit.`)
    );
  }

  const ext  = getExtension(file);
  const path = `library/covers/${generateId()}.${ext}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snap.bytesTransferred,
            totalBytes:       snap.totalBytes,
            percentage:       Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          });
        }
      },
      reject,
      async () => {
        const coverImageUrl = await getDownloadURL(task.snapshot.ref);
        resolve({ coverImagePath: path, coverImageUrl });
      }
    );
  });
}

/**
 * Delete a file from Firebase Storage by its storage path.
 * Silently succeeds if the file no longer exists.
 */
export async function deleteStorageFile(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (e) {
    if (e.code !== "storage/object-not-found") throw e;
  }
}
