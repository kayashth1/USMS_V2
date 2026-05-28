import { onDocumentWritten } from "firebase-functions/v2/firestore";
import admin from "../admin.js";

const db = admin.firestore();

export const onStudentClassAssigned = onDocumentWritten(
  "students/{studentId}",
  async (event) => {
    const before = event.data.before?.data();
    const after = event.data.after?.data();

    if (!after?.classId) return;
    if (before?.classId === after.classId) return;

    const groupsSnap = await db
      .collection("doubt_groups")
      .where("classId", "==", after.classId)
      .get();

    const batch = db.batch();

    for (const g of groupsSnap.docs) {
      const groupRef = g.ref;

      // ✅ FIXED student-add logic (single place)
      const groupSnap = await groupRef.get();
      if (!groupSnap.exists) continue;

      const data = groupSnap.data();
      const members = data.members || {};

      if (!members[event.params.studentId]) {
        members[event.params.studentId] = "student";

        await groupRef.update({
          members
        });
      }

      // Add to subcollection (unchanged)
      batch.set(
        groupRef.collection("members").doc(event.params.studentId),
        {
          role: "student",
          name: after.fullName || "",
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
);
