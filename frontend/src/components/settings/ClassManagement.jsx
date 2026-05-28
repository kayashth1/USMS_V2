import { useEffect, useState } from "react";
import {
  createClass,
  getClassesBySchool,
  toggleClassStatus,
  deleteClass,
} from "@/services/class.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const ClassManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [classes, setClasses] = useState([]);
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);

  const loadClasses = async () => {
    const data = await getClassesBySchool(schoolId);
    setClasses(data);
  };

  useEffect(() => {
    if (schoolId) loadClasses();
  }, [schoolId]);

  const handleCreate = async () => {
    try {
      setLoading(true);
      await createClass({ grade, section, schoolId });
      setGrade("");
      setSection("");
      await loadClasses();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cls) => {
    const ok = confirm(
      `Delete class ${cls.id} permanently?\nThis cannot be undone.`
    );
    if (!ok) return;

    try {
      await deleteClass({
        classDocId: cls.docId,
        classId: cls.id,
        schoolId,
      });
      await loadClasses();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">
            Class & Section Management
          </h2>
          <p className="text-sm text-gray-500">
            Create sections like 10A, 10B. Grade & section are locked after creation.
          </p>
        </div>

        {/* Create */}
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-sm">Grade</label>
            <Input
              type="number"
              min="1"
              max="12"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="10"
            />
          </div>

          <div>
            <label className="text-sm">Section</label>
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="A"
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={loading || !grade || !section}
          >
            Add Class
          </Button>
        </div>

        {/* List */}
        <div className="space-y-3">
          {classes.map((cls) => (
            <div
              key={cls.docId}
              className="flex items-center justify-between border rounded-lg p-3"
            >
              <div>
                <p className="font-medium">{cls.id}</p>
                <p className="text-xs text-gray-500">
                  Grade {cls.grade} • Section {cls.section}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={cls.isActive}
                  onCheckedChange={(val) =>
                    toggleClassStatus(cls.docId, val).then(loadClasses)
                  }
                />

                <Button
                  variant="destructive"
                  onClick={() => handleDelete(cls)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  );
};

export default ClassManagement;
