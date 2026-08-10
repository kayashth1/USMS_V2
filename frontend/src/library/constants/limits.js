import { FileType } from "./enums.js";

export const MAX_FILE_SIZE_BYTES = {
  [FileType.PDF]:    50  * 1024 * 1024,   //  50 MB
  [FileType.DOC]:    50  * 1024 * 1024,
  [FileType.DOCX]:   50  * 1024 * 1024,
  [FileType.PPT]:   100  * 1024 * 1024,   // 100 MB
  [FileType.PPTX]:  100  * 1024 * 1024,
  [FileType.XLS]:    50  * 1024 * 1024,
  [FileType.XLSX]:   50  * 1024 * 1024,
  [FileType.JPG]:    10  * 1024 * 1024,   //  10 MB
  [FileType.PNG]:    10  * 1024 * 1024,
  [FileType.WEBP]:   10  * 1024 * 1024,
  [FileType.MP3]:   100  * 1024 * 1024,
  [FileType.MP4]:  1000  * 1024 * 1024,   //   1 GB
  [FileType.ZIP]:   500  * 1024 * 1024,   // 500 MB
};

export const MAX_COVER_IMAGE_BYTES        = 5 * 1024 * 1024;   // 5 MB
export const MAX_RESOURCES_PER_COLLECTION = 200;
export const MAX_TAGS_PER_RESOURCE        = 20;
