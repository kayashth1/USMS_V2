import { useEffect, useState } from "react";
import {
  addSubject,
  getSubjectsBySchool,
  deleteSubject,
} from "@/services/subject.service";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const SubjectManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState("");
  const [loading, setLoading] = useState(false);

  const loadSubjects = async () => {
    setSubjects(await getSubjectsBySchool(schoolId));
  };

  useEffect(() => {
    if (!schoolId) return;
    loadSubjects();
  }, [schoolId]);

  const handleAdd = async () => {
    try {
      setLoading(true);
      await addSubject({
        name: newSubject,
        schoolId,
      });
      setNewSubject("");
      await loadSubjects();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (subject) => {
    const ok = confirm(
      `Delete "${subject.name}" permanently?\nRemove it from all classes first.`
    );
    if (!ok) return;

    try {
      await deleteSubject({ subjectId: subject.id, schoolId });
      await loadSubjects();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">Subjects</h2>
          <p className="text-sm text-gray-500">
            Create subjects once. Assign them to classes separately.
          </p>
        </div>

        {/* Add Subject */}
        <div className="flex gap-3">
          <Input
            placeholder="Enter subject name (e.g. Physics)"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
          />

          <Button
            onClick={handleAdd}
            disabled={loading || !newSubject}
          >
            Add
          </Button>
        </div>

        {/* Subject List */}
        <div className="space-y-3">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex justify-between items-center border rounded-lg p-3"
            >
              <p className="font-medium">{subject.name}</p>

              <Button
                variant="destructive"
                onClick={() => handleDelete(subject)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  );
};

export default SubjectManagement;
