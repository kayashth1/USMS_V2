import { useEffect, useState } from "react";
import { getSubjectsBySchool } from "@/services/subject.service";
import {
  getClassSubjects,
  addSubjectToClass,
  removeSubjectFromClass,
} from "@/services/classSubject.service";
import { getClassesBySchool } from "@/services/class.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const ClassSubjectManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  /* ================= LOAD BASE DATA ================= */
  useEffect(() => {
    if (!schoolId) return;

    getClassesBySchool(schoolId).then(setClasses);
    getSubjectsBySchool(schoolId).then(setSubjects);
  }, [schoolId]);

  /* ================= LOAD CLASS SUBJECTS ================= */
  useEffect(() => {
    if (!selectedClass) return;

    getClassSubjects(selectedClass, schoolId).then(setAssigned);
  }, [selectedClass, schoolId]);

  /* ================= ADD SUBJECT TO CLASS ================= */
  const handleAdd = async () => {
    await addSubjectToClass({
      classId: selectedClass,
      subjectId: selectedSubject,
      schoolId,
    });

    setSelectedSubject("");
    setAssigned(await getClassSubjects(selectedClass, schoolId));
  };

  /* ================= REMOVE SUBJECT FROM CLASS ================= */
const handleRemove = async (cs) => {
  await removeSubjectFromClass({
    classSubjectId: cs.id,
    classId: selectedClass,
    subjectId: cs.subjectId,
    schoolId,
  });

  setAssigned(await getClassSubjects(selectedClass, schoolId));
};


  return (
    <Card>
      <CardContent className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">
            Assign Subjects to Class
          </h2>
          <p className="text-sm text-gray-500">
            Select subjects already created and assign them to a class
          </p>
        </div>

        {/* Class Select */}
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((cls) => (
              <SelectItem key={cls.docId} value={cls.docId}>
                {cls.grade}-{cls.section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Subject Select */}
        {selectedClass && (
          <div className="flex gap-3">
            <Select
              value={selectedSubject}
              onValueChange={setSelectedSubject}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select Subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleAdd}
              disabled={!selectedSubject}
            >
              Add
            </Button>
          </div>
        )}

        {/* Assigned Subjects */}
        <div className="space-y-2">
          {assigned.map((cs) => {
            const subject = subjects.find(
              (s) => s.id === cs.subjectId
            );

            return (
              <div
                key={cs.id}
                className="flex justify-between items-center border rounded-lg p-3"
              >
                <span>{subject?.name}</span>
                <Button
                  variant="destructive"
                  onClick={() => handleRemove(cs)}
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

export default ClassSubjectManagement;
