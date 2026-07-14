import { useState } from "react";
import { createClass, toggleClassStatus, deleteClass } from "@/services/class.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const ClassManagement = ({ classes, onReload }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [grade,   setGrade]   = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setLoading(true);
      await createClass({ grade, section, schoolId });
      setGrade("");
      setSection("");
      onReload();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cls) => {
    if (!confirm(`Delete class ${cls.id} permanently?\nThis cannot be undone.`)) return;
    try {
      await deleteClass({ classDocId: cls.docId, classId: cls.id, schoolId });
      onReload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Class & Section Management</h2>
          <p className="text-sm text-gray-500">Create sections like 10A, 10B. Grade & section are locked after creation.</p>
        </div>

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
          <Button onClick={handleCreate} disabled={loading || !grade || !section}>
            Add Class
          </Button>
        </div>

        <div className="space-y-3">
          {classes.map((cls) => (
            <div key={cls.docId} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">{cls.id}</p>
                <p className="text-xs text-gray-500">Grade {cls.grade} • Section {cls.section}</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={cls.isActive}
                  onCheckedChange={(val) => toggleClassStatus(cls.docId, val).then(onReload)}
                />
                <Button variant="destructive" size="sm" onClick={() => handleDelete(cls)}>Delete</Button>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <p className="text-sm text-gray-400">No classes added yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClassManagement;
