import { useEffect, useState } from "react";
import {
  getClassSubjects,
  addSubjectToClass,
  removeSubjectFromClass,
} from "@/services/classSubject.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

const ClassSubjectManagement = ({ subjects, classes }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [assigned,       setAssigned]       = useState([]);
  const [selectedClass,  setSelectedClass]  = useState("");
  const [selectedSubject,setSelectedSubject]= useState("");
  const [adding,         setAdding]         = useState(false);

  useEffect(() => {
    if (!selectedClass) return;
    getClassSubjects(selectedClass, schoolId).then(setAssigned);
  }, [selectedClass, schoolId]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await addSubjectToClass({ classId: selectedClass, subjectId: selectedSubject, schoolId });
      setSelectedSubject("");
      setAssigned(await getClassSubjects(selectedClass, schoolId));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (cs) => {
    await removeSubjectFromClass({
      classSubjectId: cs.id,
      classId: selectedClass,
      subjectId: cs.subjectId,
      schoolId,
    });
    setAssigned(await getClassSubjects(selectedClass, schoolId));
  };

  const availableSubjects = subjects.filter(
    (s) => !assigned.some((a) => a.subjectId === s.id)
  );

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Assign Subjects to Class</h2>
          <p className="text-sm text-gray-500">Select subjects already created and assign them to a class</p>
        </div>

        <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedSubject(""); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((cls) => (
              <SelectItem key={cls.docId} value={cls.docId}>{cls.grade}-{cls.section}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedClass && (
          <div className="flex gap-3">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select Subject" />
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={!selectedSubject || adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {assigned.map((cs) => {
            const subject = subjects.find((s) => s.id === cs.subjectId);
            return (
              <div key={cs.id} className="flex justify-between items-center border rounded-lg p-3">
                <span>{subject?.name ?? cs.subjectId}</span>
                <Button variant="destructive" size="sm" onClick={() => handleRemove(cs)}>Remove</Button>
              </div>
            );
          })}
          {selectedClass && assigned.length === 0 && (
            <p className="text-sm text-gray-400">No subjects assigned to this class yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClassSubjectManagement;
