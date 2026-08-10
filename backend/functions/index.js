import { onRequest } from "firebase-functions/v2/https";
import admin from "./admin.js";

import cors from "cors";
admin.initializeApp();
const corsHandler = cors({ origin: true });

export const createTeacher = onRequest(async (req, res) => {
  // ================= CORS =================
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const {
      fullName,
      email,
      password,
      employeeId,
      phone,
      joiningDate,
      address,
      schoolId, // 🔥 REQUIRED
      customFields,
    } = req.body;

    // ================= VALIDATION =================
    if (!fullName || !email || !password || !schoolId) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // ================= CREATE AUTH USER =================
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    });

    const uid = user.uid;

    // ================= SET ROLE CLAIM =================
    await admin.auth().setCustomUserClaims(uid, {
      role: "teacher",
      schoolId, // useful later
    });

    // ================= FIRESTORE =================
    await admin.firestore().collection("teachers").doc(uid).set({
      id: uid,
      fullName,
      email,
      employeeId: employeeId || "",
      phone: phone || "",
      joiningDate: joiningDate || "",
      address: address || "",
      schoolId,               // 🔥 FOREIGN KEY
      customFields: customFields || {},
      role: "teacher",
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Create teacher error:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});


export const createStudent = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed",
      });
    }

    const {
      fullName,
      email,
      password,
      roll,
      classId,
      classLabel,
      parentName,
      contact,
      schoolId,
      customFields,
    } = req.body;

    if (!fullName || !email || !password || !schoolId || !classId) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // Create auth user
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    });

    const uid = user.uid;

    // Claims
    await admin.auth().setCustomUserClaims(uid, {
      role: "student",
      schoolId,
    });

    // Firestore
    await admin.firestore()
      .collection("students")
      .doc(uid)
      .set({
        id: uid,
        fullName,
        email,
        roll: roll || "",
        classId,
        classLabel: classLabel || "",
        parentName: parentName || "",
        contact: contact || "",
        schoolId,
        customFields: customFields || {},
        currentMonthAttendancePercentage: 0,
        role: "student",
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.json({
      success: true,
      uid,
    });
  } catch (err) {
    console.error("Create student failed:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
});


export const deleteStudent = onRequest(async (req, res) => {
  // ===== CORS =====
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }

    const db = admin.firestore();

    /* ── 1. Delete Firebase Auth account ── */
    try {
      await admin.auth().deleteUser(studentId);
    } catch (err) {
      // user-not-found is fine (already deleted or never had auth)
      if (err.code !== "auth/user-not-found") throw err;
    }

    /* ── 2. Delete main student document ── */
    await db.collection("students").doc(studentId).delete();

    /* ── 3. Delete fee profile (single doc keyed by studentId) and all year entities ── */
    await db.collection("studentFeeProfiles").doc(studentId).delete();
    const feeYearsSnap = await db.collection("studentFeeYears").where("studentId", "==", studentId).get();
    if (!feeYearsSnap.empty) {
      const b = db.batch();
      feeYearsSnap.docs.forEach((d) => b.delete(d.ref));
      await b.commit();
    }

    /* ── 4. Delete all fee payment records for this student ── */
    const paymentsSnap = await db
      .collection("feePayments")
      .where("studentId", "==", studentId)
      .get();

    if (!paymentsSnap.empty) {
      // Batch-delete in chunks of 500 (Firestore limit)
      const chunks = [];
      for (let i = 0; i < paymentsSnap.docs.length; i += 500) {
        chunks.push(paymentsSnap.docs.slice(i, i + 500));
      }
      await Promise.all(
        chunks.map((chunk) => {
          const batch = db.batch();
          chunk.forEach((d) => batch.delete(d.ref));
          return batch.commit();
        })
      );
    }

    return res.json({
      success: true,
      message: "Student and all associated data permanently deleted",
      deletedPayments: paymentsSnap.size,
    });

  } catch (error) {
    console.error("Delete student error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export const deleteTeacher = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { teacherId } = req.body;

    if (!teacherId) {
      return res.status(400).json({ error: "teacherId is required" });
    }

    await admin.auth().deleteUser(teacherId);

    await admin.firestore().collection("teachers").doc(teacherId).delete();

    return res.json({ success: true, message: "Teacher permanently deleted" });
  } catch (error) {
    console.error("Delete teacher error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export const createNotice = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const {
      title,
      message,
      targetAudience, // students | teachers | all
      attachments = [],
      schoolId,       // 👈 ACCEPT FROM FRONTEND
      createdBy,      // principalId from localStorage
      createdByRole,  // "principal"
    } = req.body;

    // ✅ BASIC VALIDATION
    if (!title || !message || !targetAudience || !schoolId) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    if (!["students", "teachers", "all"].includes(targetAudience)) {
      return res.status(400).json({
        error: "Invalid target audience",
      });
    }

    // ✅ SAVE NOTICE (NO CLAIM CHECK)
    const ref = await admin.firestore().collection("notices").add({
      title,
      message,
      targetAudience,
      attachments,
      schoolId,
      createdBy: createdBy || null,
      createdByRole: createdByRole || "principal",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      noticeId: ref.id,
    });
  } catch (err) {
    console.error("Create notice error:", err);
    return res.status(500).json({ error: err.message });
  }
});


export const deleteNotice = onRequest(async (req, res) => {
  // ================= CORS =================
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { noticeId, schoolId } = req.body;

    // ✅ Validation
    if (!noticeId || !schoolId) {
      return res.status(400).json({
        error: "noticeId and schoolId are required",
      });
    }

    const noticeRef = admin.firestore().collection("notices").doc(noticeId);
    const snap = await noticeRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Notice not found" });
    }

    // ✅ Extra safety: school match
    if (snap.data().schoolId !== schoolId) {
      return res.status(403).json({
        error: "Permission denied (school mismatch)",
      });
    }

    // ✅ Delete
    await noticeRef.delete();

    return res.json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (err) {
    console.error("Delete notice error:", err);
    return res.status(500).json({ error: err.message });
  }
});


export const createSchool = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const {
      schoolName, schoolCode, schoolEmail, schoolPhone, schoolAddress,
      principalName, principalEmail, principalPassword,
    } = req.body;

    if (!schoolName || !principalEmail || !principalPassword || !principalName) {
      return res.status(400).json({ error: "schoolName, principalName, principalEmail and principalPassword are required" });
    }

    // Create Firebase Auth user for principal
    const userRecord = await admin.auth().createUser({
      email:       principalEmail.trim(),
      password:    principalPassword,
      displayName: principalName.trim(),
    });
    const uid = userRecord.uid;

    await admin.auth().setCustomUserClaims(uid, { role: "principal" });

    // Create school document
    const schoolRef = await admin.firestore().collection("schools").add({
      name:          schoolName.trim(),
      code:          (schoolCode    || "").trim(),
      email:         (schoolEmail   || "").trim(),
      phone:         (schoolPhone   || "").trim(),
      address:       (schoolAddress || "").trim(),
      isActive:      true,
      plan:          "free",
      planExpiresAt: null,
      principalId:   uid,
      createdAt:     admin.firestore.FieldValue.serverTimestamp(),
    });
    const schoolId = schoolRef.id;

    // Create principal document
    await admin.firestore().collection("principals").doc(uid).set({
      uid,
      schoolId,
      fullName:  principalName.trim(),
      email:     principalEmail.trim(),
      isActive:  true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, schoolId, principalUid: uid });
  } catch (err) {
    console.error("createSchool error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export const deleteSchool = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const { schoolId } = req.body;
    if (!schoolId) return res.status(400).json({ error: "schoolId is required" });

    const db = admin.firestore();

    // Collect all Auth UIDs before deleting docs
    const [studentsSnap, teachersSnap, principalsSnap] = await Promise.all([
      db.collection("students").where("schoolId", "==", schoolId).get(),
      db.collection("teachers").where("schoolId", "==", schoolId).get(),
      db.collection("principals").where("schoolId", "==", schoolId).get(),
    ]);

    const authUids = [
      ...studentsSnap.docs.map((d) => d.id),
      ...teachersSnap.docs.map((d) => d.id),
      ...principalsSnap.docs.map((d) => d.id),
    ];

    // Delete Firestore docs across all collections
    const COLLECTIONS = [
      "students", "teachers", "principals", "classes", "subjects",
      "classSubjects", "teacherClassSubjects", "feeStructures",
      "studentFeeProfiles", "studentFeeYears", "feePayments", "notices", "attendance",
      "timetable", "timePeriods", "customFieldDefs", "alumni",
    ];

    await Promise.all(
      COLLECTIONS.map(async (col) => {
        const snap = await db.collection(col).where("schoolId", "==", schoolId).get();
        if (snap.empty) return;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      })
    );

    // Delete Firebase Auth accounts
    if (authUids.length > 0) {
      await admin.auth().deleteUsers(authUids);
    }

    // Delete the school document itself
    await db.collection("schools").doc(schoolId).delete();

    return res.json({ success: true, deletedAuthAccounts: authUids.length });
  } catch (err) {
    console.error("deleteSchool error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export const changeStudentPassword = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const { studentId, newPassword } = req.body;
    if (!studentId || !newPassword)
      return res.status(400).json({ error: "studentId and newPassword are required" });
    if (newPassword.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    await admin.auth().updateUser(studentId, { password: newPassword });
    return res.json({ success: true });
  } catch (error) {
    console.error("Change student password error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export const changeTeacherPassword = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const { teacherId, newPassword } = req.body;
    if (!teacherId || !newPassword)
      return res.status(400).json({ error: "teacherId and newPassword are required" });
    if (newPassword.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    await admin.auth().updateUser(teacherId, { password: newPassword });
    return res.json({ success: true });
  } catch (error) {
    console.error("Change teacher password error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export { onTeacherAssigned } from "./triggers/onTeacherAssigned.js";
export { onStudentClassAssigned } from "./triggers/onStudentClassAssigned.js";
export { onTeacherUnassigned } from "./triggers/onTeacherUnassigned.js";

