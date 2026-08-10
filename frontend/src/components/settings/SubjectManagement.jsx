import { useState } from "react";
import { addSubject, deleteSubject } from "@/services/subject.service";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

const SubjectManagement = ({ subjects, onReload }) => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const { toast } = useToast();
  const confirm = useConfirm();

  const [newSubject, setNewSubject] = useState("");
  const [loading,    setLoading]    = useState(false);

  const handleAdd = async () => {
    if (!newSubject.trim()) return;
    try {
      setLoading(true);
      await addSubject({ name: newSubject.trim(), schoolId });
      setNewSubject("");
      onReload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (subject) => {
    const ok = await confirm({
      title: `Delete "${subject.name}"?`,
      description: "This is permanent. Remove it from all classes first.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSubject({ subjectId: subject.id, schoolId });
      onReload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Subjects</h2>
          <p className="text-sm text-gray-500">Create subjects once. Assign them to classes separately.</p>
        </div>

        <div className="flex gap-3">
          <Input
            placeholder="Enter subject name (e.g. Physics)"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={loading || !newSubject.trim()}>Add</Button>
        </div>

        <div className="space-y-3">
          {subjects.map((subject) => (
            <div key={subject.id} className="flex justify-between items-center border rounded-lg p-3">
              <p className="font-medium">{subject.name}</p>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(subject)}>Delete</Button>
            </div>
          ))}
          {subjects.length === 0 && (
            <p className="text-sm text-gray-400">No subjects added yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SubjectManagement;
