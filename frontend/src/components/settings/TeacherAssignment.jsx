import { useEffect, useMemo, useState } from "react";

import { getTeachersBySchool } from "@/services/teacher.service";
import { getClassSubjects } from "@/services/classSubject.service";
import {
  assignTeacher,
  getTeacherAssignments,
  removeTeacherAssignment,
} from "@/services/teacherClassSubject.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

// subjects and classes are passed from Settings.jsx (shared, always up-to-date)
const TeacherAssignment = ({ subjects, classes }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [teachers,        setTeachers]        = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedClass,   setSelectedClass]   = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [classSubjects,   setClassSubjects]   = useState([]);
  const [assignments,     setAssignments]     = useState([]);

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])),   [teachers]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])),   [subjects]);
  const classMap   = useMemo(() => new Map(classes.map((c)  => [c.docId, c.id])), [classes]);

  useEffect(() => {
    if (!schoolId) return;
    getTeachersBySchool(schoolId).then(setTeachers);
    getTeacherAssignments(schoolId).then(setAssignments);
  }, [schoolId]);

  useEffect(() => {
    if (!selectedClass || !schoolId) return;
    getClassSubjects(selectedClass, schoolId).then(setClassSubjects);
  }, [selectedClass, schoolId]);

  const availableSubjects = subjects.filter((s) =>
    classSubjects.some((cs) => cs.subjectId === s.id)
  );

  const handleAssign = async () => {
    await assignTeacher({ teacherId: selectedTeacher, classId: selectedClass, subjectId: selectedSubject, schoolId });
    setAssignments(await getTeacherAssignments(schoolId));
    setSelectedSubject("");
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Teacher → Section → Subject</h2>
          <p className="text-sm text-gray-500">Assign teachers to subjects for each section</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
            <SelectTrigger><SelectValue placeholder="Select Teacher" /></SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedSubject(""); }}>
            <SelectTrigger><SelectValue placeholder="Select Section" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.docId} value={c.docId}>{c.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
            <SelectContent>
              {availableSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleAssign}
            disabled={!selectedTeacher || !selectedClass || !selectedSubject}
          >
            Assign
          </Button>
        </div>

        <div className="space-y-3">
          {assignments.map((a) => {
            const teacher = teacherMap.get(a.teacherId);
            const subject = subjectMap.get(a.subjectId);
            return (
              <div key={a.docid} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="font-medium">{teacher?.fullName ?? "—"} — {subject?.name ?? "—"}</p>
                  <p className="text-xs text-gray-500">Section {classMap.get(a.classId) || "—"}</p>
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
          {assignments.length === 0 && (
            <p className="text-sm text-gray-400">No assignments yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TeacherAssignment;
