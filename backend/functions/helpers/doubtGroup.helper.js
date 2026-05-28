import admin from "../admin.js";

const db = admin.firestore();

/**
 * CREATE or UPDATE doubt group safely
 */
export const createOrUpdateDoubtGroup = async ({
  classId,
  subjectId,
  teacher,
  students = [],
}) => {
  const groupId = `${classId}_${subjectId}`;
  const groupRef = db.collection("doubt_groups").doc(groupId);

  /* ================================
     ✅ FETCH CLASS & SUBJECT NAMES
  ================================= */
  const [classSnap, subjectSnap] = await Promise.all([
    db.collection("classes").doc(classId).get(),
    db.collection("subjects").doc(subjectId).get(),
  ]);

  const className = classSnap.exists ? classSnap.data().id : classId;
  const subjectName = subjectSnap.exists ? subjectSnap.data().name : subjectId;

  // ✅ FINAL GROUP NAME (Hindi-9A style)
  const groupName = `${subjectName}-${className}`;

  const membersMap = {};

  // Teacher
  membersMap[teacher.uid] = "teacher";

  // Students
  for (const s of students) {
    membersMap[s.uid] = "student";
  }

  const batch = db.batch();

  // ---- GROUP DOC ----
  batch.set(
    groupRef,
    {
      groupId,
      groupName, // ✅ added
      classId,
      subjectId,
      teacherId: teacher.uid,
      members: membersMap,
      lastMessage: "",
      lastMessageAt: null,
      lastMessageBy: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // ---- TEACHER SUBDOC ----
  batch.set(
    groupRef.collection("members").doc(teacher.uid),
    {
      role: "teacher",
      name: teacher.name || "",
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // ---- STUDENT SUBDOCS ----
  for (const s of students) {
    batch.set(
      groupRef.collection("members").doc(s.uid),
      {
        role: "student",
        name: s.name || "",
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return groupId;
};
