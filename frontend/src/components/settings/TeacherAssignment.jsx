import { useEffect, useState } from "react";

import { getTeachersBySchool } from "@/services/teacher.service";
import { getClassesBySchool } from "@/services/class.service";
import { getClassSubjects } from "@/services/classSubject.service";
import {
  assignTeacher,
  getTeacherAssignments,
  removeTeacherAssignment,
} from "@/services/teacherClassSubject.service";
import { getSubjectsBySchool } from "@/services/subject.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const TeacherAssignment = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  const [classSubjects, setClassSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const classMap = Object.fromEntries(
  classes.map(c => [c.docId, c.id])
);


  /* ================= LOAD BASE ================= */
  useEffect(() => {
    if (!schoolId) return;

    getTeachersBySchool(schoolId).then(setTeachers);
    getClassesBySchool(schoolId).then(setClasses);
    getSubjectsBySchool(schoolId).then(setSubjects);
    getTeacherAssignments(schoolId).then(setAssignments);
  }, [schoolId]);

  /* ================= LOAD SUBJECTS OF CLASS ================= */
  useEffect(() => {
    if (!selectedClass || !schoolId) return;

    getClassSubjects(selectedClass, schoolId).then(setClassSubjects);
  }, [selectedClass, schoolId]);

  const availableSubjects = subjects.filter((s) =>
    classSubjects.some((cs) => cs.subjectId === s.id)
  );

  /* ================= ASSIGN ================= */
  const handleAssign = async () => {
    await assignTeacher({
      teacherId: selectedTeacher,
      classId: selectedClass,
      subjectId: selectedSubject,
      schoolId,
    });

    const data = await getTeacherAssignments(schoolId);
    setAssignments(data);
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">

        <div>
          <h2 className="text-lg font-semibold">
            Teacher → Section → Subject
          </h2>
          <p className="text-sm text-gray-500">
            Assign teachers to subjects for each section
          </p>
        </div>

        {/* Assignment Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
            <SelectTrigger>
              <SelectValue placeholder="Select Teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger>
              <SelectValue placeholder="Select Section" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
<SelectItem key={c.docId} value={c.docId}>
  {c.id}
</SelectItem>

              ))}
            </SelectContent>
          </Select>

          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger>
              <SelectValue placeholder="Select Subject" />
            </SelectTrigger>
            <SelectContent>
              {availableSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleAssign}
            disabled={
              !selectedTeacher || !selectedClass || !selectedSubject
            }
          >
            Assign
          </Button>
        </div>

        {/* Existing Assignments */}
        <div className="space-y-3">
          {assignments.map((a) => {
            const teacher = teachers.find(t => t.id === a.teacherId);
            const subject = subjects.find(s => s.id === a.subjectId);

            return (
              <div
                key={a.docid}
                className="flex items-center justify-between border rounded-lg p-3"
              >
                <div>
                  <p className="font-medium">
                    {teacher?.fullName} — {subject?.name}
                  </p>
                  <p className="text-xs text-gray-500">
  Section {classMap[a.classId] || "—"}
                  </p>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    removeTeacherAssignment(a.id).then(() =>
                      getTeacherAssignments(schoolId).then(setAssignments)
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            );
          })}
        </div>

      </CardContent>
    </Card>
  );
};

export default TeacherAssignment;
