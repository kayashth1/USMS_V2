// Constants
export { LIBRARY_COLLECTIONS } from "./constants/collections.js";
export {
  FileType,
  FILE_TYPE_FOLDERS,
  ACCEPTED_MIME_TYPES,
  FILE_TYPE_LABELS,
  Visibility,
  VISIBILITY_LABELS,
  Board,
  GRADES,
  SUBJECTS,
} from "./constants/enums.js";
export {
  MAX_FILE_SIZE_BYTES,
  MAX_COVER_IMAGE_BYTES,
  MAX_RESOURCES_PER_COLLECTION,
  MAX_TAGS_PER_RESOURCE,
} from "./constants/limits.js";

// Storage
export {
  uploadResourceFile,
  uploadCoverImage,
  deleteStorageFile,
} from "./services/libraryStorage.service.js";

// Resource CRUD
export {
  createResource,
  getResource,
  getResourcesByIds,
  getAllResources,
  updateResource,
  setResourceActive,
  replaceResourceFile,
  deleteResource,
} from "./services/libraryResource.service.js";

// Collection CRUD
export {
  createCollection,
  getCollection,
  getAllCollections,
  getCollectionWithResources,
  addResourceToCollection,
  removeResourceFromCollection,
  reorderCollectionResources,
  updateCollection,
  setCollectionActive,
  deleteCollection,
} from "./services/libraryCollection.service.js";

// Principal catalog + assignment helpers
export {
  getSchoolCatalog,
  getSchoolCollectionsCatalog,
  getSchoolAssignmentMap,
  assignResourceToClasses,
  assignCollectionToClasses,
  unassignCollectionFromClasses,
} from "./services/libraryPrincipal.service.js";

// Low-level assignments (superadmin / internal use)
export {
  assignResourceToSchool,
  unassignResourceFromSchool,
  isResourceAssignedToSchool,
  getSchoolAssignedResources,
  assignCollectionToSchool,
  unassignCollectionFromSchool,
  getSchoolAssignedCollections,
  assignResourceToClass,
  unassignResourceFromClass,
  isResourceAssignedToClass,
  getClassAssignedResources,
  assignAllSchoolResourcesToClass,
  clearClassAssignments,
} from "./services/libraryAssignment.service.js";
