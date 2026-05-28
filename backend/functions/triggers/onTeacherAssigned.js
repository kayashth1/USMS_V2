import { onDocumentCreated } from "firebase-functions/v2/firestore";
import admin from "../admin.js";
import { createOrUpdateDoubtGroup } from "../helpers/doubtGroup.helper.js";

const db = admin.firestore();

export const onTeacherAssigned = onDocumentCreated(
  "teacherClassSubjects/{docId}",
  async (event) => {
    const data = event.data.data();

    const teacherSnap = await db
      .collection("teachers")
      .doc(data.teacherId)
      .get();

    if (!teacherSnap.exists) return;

    const studentsSnap = await db
      .collection("students")
      .where("classId", "==", data.classId)
      .get();

    const teacher = {
      uid: data.teacherId,
      name: teacherSnap.data().fullName || "",
    };

    const students = studentsSnap.docs.map((d) => ({
      uid: d.id,
      name: d.data().fullName || "",
    }));

    await createOrUpdateDoubtGroup({
      classId: data.classId,
      subjectId: data.subjectId,
      teacher,
      students,
    });
  }
);
