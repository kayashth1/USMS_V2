export const FileType = {
  PDF:  "pdf",
  DOC:  "doc",
  DOCX: "docx",
  PPT:  "ppt",
  PPTX: "pptx",
  XLS:  "xls",
  XLSX: "xlsx",
  JPG:  "jpg",
  PNG:  "png",
  WEBP: "webp",
  MP3:  "mp3",
  MP4:  "mp4",
  ZIP:  "zip",
};

// Maps each FileType to its Storage folder under library/
export const FILE_TYPE_FOLDERS = {
  [FileType.PDF]:  "pdf",
  [FileType.DOC]:  "doc",
  [FileType.DOCX]: "doc",
  [FileType.PPT]:  "ppt",
  [FileType.PPTX]: "ppt",
  [FileType.XLS]:  "xls",
  [FileType.XLSX]: "xls",
  [FileType.JPG]:  "images",
  [FileType.PNG]:  "images",
  [FileType.WEBP]: "images",
  [FileType.MP3]:  "audio",
  [FileType.MP4]:  "video",
  [FileType.ZIP]:  "zip",
};

export const ACCEPTED_MIME_TYPES = {
  [FileType.PDF]:  "application/pdf",
  [FileType.DOC]:  "application/msword",
  [FileType.DOCX]: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  [FileType.PPT]:  "application/vnd.ms-powerpoint",
  [FileType.PPTX]: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  [FileType.XLS]:  "application/vnd.ms-excel",
  [FileType.XLSX]: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  [FileType.JPG]:  "image/jpeg",
  [FileType.PNG]:  "image/png",
  [FileType.WEBP]: "image/webp",
  [FileType.MP3]:  "audio/mpeg",
  [FileType.MP4]:  "video/mp4",
  [FileType.ZIP]:  "application/zip",
};

// Human-readable labels
export const FILE_TYPE_LABELS = {
  [FileType.PDF]:  "PDF",
  [FileType.DOC]:  "Word Document",
  [FileType.DOCX]: "Word Document",
  [FileType.PPT]:  "PowerPoint",
  [FileType.PPTX]: "PowerPoint",
  [FileType.XLS]:  "Excel",
  [FileType.XLSX]: "Excel",
  [FileType.JPG]:  "Image",
  [FileType.PNG]:  "Image",
  [FileType.WEBP]: "Image",
  [FileType.MP3]:  "Audio",
  [FileType.MP4]:  "Video",
  [FileType.ZIP]:  "Archive",
};

// Who can see this resource in their catalog
export const Visibility = {
  FREE:             "free",              // All schools, no plan required
  PREMIUM:          "premium",           // Only premium-plan schools
  SELECTED_SCHOOLS: "selected_schools",  // Only schools listed in selectedSchoolIds
};

export const VISIBILITY_LABELS = {
  free:             "Free",
  premium:          "Premium",
  selected_schools: "Selected Schools",
};

export const Board = {
  CBSE:  "CBSE",
  ICSE:  "ICSE",
  STATE: "State Board",
  IB:    "IB",
  OTHER: "Other",
};

export const GRADES = [
  "Nursery", "LKG", "UKG",
  "1", "2", "3", "4", "5", "6",
  "7", "8", "9", "10", "11", "12",
];

export const SUBJECTS = [
  "English", "Mathematics", "Science", "Social Science", "Hindi",
  "Sanskrit", "Computer Science", "Physical Education", "Art & Craft",
  "Music", "General Knowledge", "Environmental Science", "Economics",
  "History", "Geography", "Political Science", "Physics", "Chemistry",
  "Biology", "Accountancy", "Business Studies",
];
