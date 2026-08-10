import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { getActiveAcademicYear, getProfileByStudentAndYear } from "@/fees-v2";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { getSubjectsForStudent } from "@/services/studentClassSubjects.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";
import EditStudentDialog from "@/components/students/EditStudentDialog";
import StudentAttendanceSummary from "@/components/attendance/StudentAttendanceSummary";

const StudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student,    setStudent]    = useState(null);
  const [classLabel, setClassLabel] = useState("-");
  const [subjects,   setSubjects]   = useState([]);
  const [feeItems,   setFeeItems]   = useState(null); // null = not loaded yet
  const [loading,    setLoading]    = useState(true);
  const [editOpen,   setEditOpen]   = useState(false);

  const schoolId = localStorage.getItem("principalSchoolId");
  const { defs: customDefs } = useCustomFieldDefs(schoolId, "student");

  /* ================= FETCH STUDENT + CLASS ================= */
  const fetchStudent = async () => {
    try {
      const snap = await getDoc(doc(db, "students", studentId));
      if (!snap.exists()) { setStudent(null); return; }

      const data = { id: snap.id, ...snap.data() };
      setStudent(data);

      const [classSnap, activeYear] = await Promise.all([
        data.classId ? getDoc(doc(db, "classes", data.classId)) : Promise.resolve(null),
        schoolId ? getActiveAcademicYear(schoolId).catch(() => null) : Promise.resolve(null),
      ]);

      if (classSnap?.exists()) {
        const c = classSnap.data();
        setClassLabel(`${c.grade}-${c.section}`);
      }

      // Reads the real Fees V2 profile (studentFeeProfiles), not the old
      // studentFeeYears collection — a student enrolled before 2026-08-08
      // via the old AddStudentDialog path won't have one of these; that's
      // expected, not a bug in this read.
      const profile = activeYear
        ? await getProfileByStudentAndYear(snap.id, activeYear.id)
        : null;
      setFeeItems(profile || {});
    } catch (err) {
      console.error("Failed to fetch student:", err);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (studentId) fetchStudent(); }, [studentId]); // eslint-disable-line

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

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-20 bg-gray-100 rounded" />
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-gray-100 rounded" />
          <div className="h-4 w-28 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
      </div>
      <Card><CardContent className="p-6 grid grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-5 w-40 bg-gray-100 rounded" />
          </div>
        ))}
      </CardContent></Card>
      <Card><CardContent className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </CardContent></Card>
    </div>
  );
  if (!student) return <p className="p-6 text-gray-500">Student not found</p>;

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

        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-700">Active</Badge>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      {/* Student Info */}
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Info label="Roll Number" value={student.roll} />
          <Info label="Email" value={student.email} />
          <Info label="Parent Name" value={student.parentName} />
          <Info label="Contact" value={student.contact} />
        </CardContent>
      </Card>

      {/* Custom Fields */}
      {customDefs.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Additional Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {customDefs.map((field) => (
                <Info
                  key={field.id}
                  label={field.label}
                  value={student.customFields?.[field.id]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subjects */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Subjects</h2>
          {subjects.length === 0 ? (
            <p className="text-gray-500">No subjects assigned to this class yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {subjects.map((s) => (
                <div key={s.id} className="border rounded-md p-3 bg-gray-50">
                  <p className="font-medium">{s.name}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance */}
      {student.classId && (
        <StudentAttendanceSummary
          schoolId={schoolId}
          classId={student.classId}
          studentId={student.id}
        />
      )}

      {/* Fee Breakdown */}
      <FeeBreakdown feeProfile={feeItems} />

      <EditStudentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
        onSuccess={fetchStudent}
      />
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-medium">{value || "—"}</p>
  </div>
);

const FeeBreakdown = ({ feeProfile }) => {
  if (!feeProfile || !feeProfile.feeLineItems?.length) return null;

  const recurring = feeProfile.feeLineItems.filter((i) => !i.isOneTime);
  const oneTime   = feeProfile.feeLineItems.filter((i) =>  i.isOneTime);
  const cycleWord = feeProfile.schedule === "quarterly" ? "quarter" : "month";
  const totalPerCycle = recurring.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fee Structure</h2>
          <span className="text-xs text-gray-400 capitalize">{feeProfile.schedule} · {feeProfile.academicYear}</span>
        </div>

        <div className="divide-y border rounded-lg overflow-hidden">
          {recurring.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm bg-white">
              <span className="text-gray-700">{item.label || item.name}</span>
              <span className="font-medium text-gray-800">₹{Number(item.amount).toLocaleString()}<span className="text-xs text-gray-400">/{cycleWord}</span></span>
            </div>
          ))}
          {oneTime.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm bg-white">
              <span className="text-gray-700">
                {item.label || item.name}
                <span className="ml-2 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">One-time</span>
              </span>
              <span className="font-medium text-amber-700">₹{Number(item.amount).toLocaleString()}</span>
            </div>
          ))}
          {recurring.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-indigo-50">
              <span className="font-semibold text-indigo-700">Total / {cycleWord}</span>
              <span className="font-bold text-indigo-700">₹{totalPerCycle.toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentProfile;
