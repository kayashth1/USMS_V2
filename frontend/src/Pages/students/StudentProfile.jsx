import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { getSubjectsForStudent } from "@/services/studentClassSubjects.service";

const StudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [classLabel, setClassLabel] = useState("-");
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= FETCH STUDENT + CLASS ================= */
  useEffect(() => {
    const fetchStudent = async () => {
      try {
        const snap = await getDoc(
          doc(db, "students", studentId)
        );

        if (!snap.exists()) {
          setStudent(null);
          return;
        }

        const data = { id: snap.id, ...snap.data() };
        setStudent(data);

        // 🔥 Fetch class info via classId
        if (data.classId) {
          const classSnap = await getDoc(
            doc(db, "classes", data.classId)
          );

          if (classSnap.exists()) {
            const c = classSnap.data();
            setClassLabel(`${c.grade}-${c.section}`);
          }
        }
      } catch (err) {
        console.error("Failed to fetch student:", err);
        setStudent(null);
      } finally {
        setLoading(false);
      }
    };

    if (studentId) fetchStudent();
  }, [studentId]);

  /* ================= FETCH SUBJECTS ================= */
  useEffect(() => {
    if (!student?.classId || !student?.schoolId) return;

    const loadSubjects = async () => {
      try {
        const data = await getSubjectsForStudent ({
          classId: student.classId,   // 🔥 FIXED
          schoolId: student.schoolId,
        });
        console.log("Fetched subjects:", data);
        setSubjects(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        setSubjects([]);
      }
    };

    loadSubjects();
  }, [student]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!student) return <p className="p-6">Student not found</p>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        ← Back
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {student.fullName}
          </h1>
          <p className="text-gray-500">{classLabel}</p>
        </div>

        <Badge className="bg-green-100 text-green-700">
          Active
        </Badge>
      </div>

      {/* Student Info */}
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Info label="Roll Number" value={student.roll} />
          <Info label="Email" value={student.email} />
          <Info label="Parent Name" value={student.parentName} />
          <Info label="Contact" value={student.contact} />
          <Info label="School ID" value={student.schoolId} />
        </CardContent>
      </Card>

      {/* Subjects */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Subjects
          </h2>

          {subjects.length === 0 ? (
            <p className="text-gray-500">
              No subjects assigned to this class yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {subjects.map((s) => (
                <div
                  key={s.id}
                  className="border rounded-md p-3 bg-gray-50"
                >
                  <p className="font-medium">{s.name}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-medium">{value || "-"}</p>
  </div>
);

export default StudentProfile;
