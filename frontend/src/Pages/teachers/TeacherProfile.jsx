import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

import { getAssignmentsForTeacher } from "@/services/teacherClassSubject.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import TeacherTimetableTab from "@/components/teachers/TeacherTimetableTab";
import EditTeacherDialog from "@/components/teachers/EditTeacherDialog";

const TeacherProfile = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();

  const [teacher,     setTeacher]     = useState(null);
  const [school,      setSchool]      = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editOpen,    setEditOpen]    = useState(false);

  const schoolId = localStorage.getItem("principalSchoolId");
  const { defs: customDefs } = useCustomFieldDefs(schoolId, "teacher");

  /* ================= FETCH TEACHER ================= */
  const fetchTeacher = async () => {
    try {
      if (!teacherId) return;
      const snap = await getDoc(doc(db, "teachers", teacherId));
      setTeacher(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    } catch (err) {
      console.error("Failed to fetch teacher:", err);
      setTeacher(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeacher(); }, [teacherId]); // eslint-disable-line

  /* ================= FETCH SCHOOL ================= */
  useEffect(() => {
    const fetchSchool = async () => {
      if (!teacher?.schoolId) return;

      try {
        const snap = await getDoc(
          doc(db, "schools", teacher.schoolId)
        );
        setSchool(snap.exists() ? snap.data() : null);
      } catch (err) {
        console.error("Failed to fetch school:", err);
        setSchool(null);
      }
    };

    fetchSchool();
  }, [teacher]);

  /* ================= FETCH ASSIGNED CLASSES + SUBJECTS ================= */
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        if (!teacher?.id || !teacher?.schoolId) return;

        const raw = await getAssignmentsForTeacher({
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
        });

        // Resolve class + subject labels
        const resolved = await Promise.all(
          raw.map(async (a) => {
            const classSnap = await getDoc(
              doc(db, "classes", a.classId)
            );
            const subjectSnap = await getDoc(
              doc(db, "subjects", a.subjectId)
            );

            return {
              id: a.id,
              classLabel: classSnap.exists()
                ? `${classSnap.data().grade}-${classSnap.data().section}`
                : "Unknown Class",
              subjectName: subjectSnap.exists()
                ? subjectSnap.data().name
                : "Unknown Subject",
            };
          })
        );

        setAssignments(resolved);
      } catch (err) {
        console.error("Failed to fetch assignments:", err);
        setAssignments([]);
      }
    };

    fetchAssignments();
  }, [teacher]);

  /* ================= STATES ================= */
  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-20 bg-gray-100 rounded" />
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
      </div>
      <Card><CardContent className="p-6 grid grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-5 w-40 bg-gray-100 rounded" />
          </div>
        ))}
      </CardContent></Card>
      <Card><CardContent className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded" />
        ))}
      </CardContent></Card>
    </div>
  );
  if (!teacher) return <p className="p-6 text-gray-500">Teacher not found</p>;

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-2"
          >
            ← Back
          </Button>

          <h1 className="text-2xl font-semibold">
            {teacher.fullName}
          </h1>
        </div>

        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      </div>

      {/* ===== Profile Summary ===== */}
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Info label="Employee ID" value={teacher.employeeId} />
          <Info label="Joining Date" value={teacher.joiningDate} />
          <Info label="Email" value={teacher.email} />
          <Info label="Phone" value={teacher.phone} />
          <Info label="School" value={school?.name} />
          <Info label="Address" value={teacher.address} />
        </CardContent>
      </Card>

      {/* ===== Custom Fields ===== */}
      {customDefs.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Additional Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {customDefs.map((field) => (
                <Info
                  key={field.id}
                  label={field.label}
                  value={teacher.customFields?.[field.id]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Tabs ===== */}
      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">Assigned Classes</TabsTrigger>
          <TabsTrigger value="notices">Notices</TabsTrigger>
          <TabsTrigger value="materials">Study Materials</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="p-6 text-gray-600">
              Performance analytics and attendance summary will appear here.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes">
          <Card>
            <CardContent className="p-6 space-y-3">
              {assignments.length === 0 ? (
                <p className="text-gray-500">
                  No classes assigned yet.
                </p>
              ) : (
                assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border rounded-md p-3"
                  >
                    <div>
                      <p className="font-medium">
                        Class {a.classLabel}
                      </p>
                      <p className="text-sm text-gray-500">
                        Subject: {a.subjectName}
                      </p>
                    </div>
                    <Badge variant="secondary">Assigned</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notices">
          <Card>
            <CardContent className="p-6">
              Notices sent by this teacher will appear here.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardContent className="p-6">
              Uploaded study materials will appear here.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timetable">
  <TeacherTimetableTab
    teacherId={teacher.id}
    schoolId={teacher.schoolId}
  />
</TabsContent>

      </Tabs>

      <EditTeacherDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        teacher={teacher}
        onUpdated={fetchTeacher}
      />
    </div>
  );
};

/* ================= SMALL INFO COMPONENT ================= */
const Info = ({ label, value }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-medium">{value || "-"}</p>
  </div>
);

export default TeacherProfile;
