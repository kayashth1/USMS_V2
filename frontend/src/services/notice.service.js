import { getAuth } from "firebase/auth";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage"

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

import { db } from "@/config/firebase";


/* ================= CREATE NOTICE ================= */
export const createNotice = async ({
  title,
  message,
  targetAudience,
  attachments,
}) => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const principalId = localStorage.getItem("principalId");

  const res = await fetch(
    "https://createnotice-z4likafkwq-uc.a.run.app",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        message,
        targetAudience,
        attachments,
        schoolId,
        createdBy: principalId,
        createdByRole: "principal",
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create notice");
  return data;
};


/* ================= DELETE NOTICE ================= */
export const deleteNotice = async (noticeId) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  if (!schoolId) {
    throw new Error("schoolId missing");
  }

  const res = await fetch(
    "https://deletenotice-z4likafkwq-uc.a.run.app",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noticeId,
        schoolId,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete notice");

  return data;
};


/* ================= UPLOAD NOTICE ATTACHMENT ================= */
export const uploadNoticeAttachment = async (file) => {
  // ✅ Get schoolId from localStorage
  const schoolId = localStorage.getItem("principalSchoolId");

  if (!schoolId) {
    throw new Error("schoolId missing in localStorage");
  }

  const storage = getStorage();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // ✅ Safe storage path
  const storageRef = ref(
    storage,
    `notices/${schoolId}/${year}/${month}/${Date.now()}_${file.name}`
  );

  // ✅ Upload file
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    name: file.name,
    url,
    type: file.type.startsWith("image") ? "image" : "pdf",
    size: file.size,
  };
};

/* ================= GET NOTICES BY SCHOOL ================= */
export const getRecentNoticesBySchool = async (schoolId, count = 4) => {
  if (!schoolId) return [];

  const q = query(
    collection(db, "notices"),
    where("schoolId", "==", schoolId),
    orderBy("createdAt", "desc"),
    limit(count)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
};

