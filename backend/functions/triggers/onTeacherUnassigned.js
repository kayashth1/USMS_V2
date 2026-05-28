import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import admin from "../admin.js";

const db = admin.firestore();

export const onTeacherUnassigned = onDocumentDeleted(
  "teacherClassSubjects/{assignmentId}",
  async (event) => {
    const data = event.data?.data();

    if (!data?.classId || !data?.subjectId) {
      console.log("❌ Missing classId or subjectId");
      return;
    }

    const groupId = `${data.classId}_${data.subjectId}`;
    const groupRef = db.collection("doubt_groups").doc(groupId);

    console.log("🔥 Teacher unassigned → deleting doubt group:", groupId);

    const snap = await groupRef.get();
    if (!snap.exists) {
      console.log("⚠️ Doubt group already deleted:", groupId);
      return;
    }

    // ✅ Recursively delete group + members subcollection
    await admin.firestore().recursiveDelete(groupRef);

    console.log("✅ Doubt group fully deleted (with members):", groupId);
  }
);
