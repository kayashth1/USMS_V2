import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteTeacher } from "@/services/teacher.service";

const DeleteTeacherDialog = ({ open, onOpenChange, teacher, onDeleted }) => {
  const [loading, setLoading] = useState(false);

  if (!teacher) return null;

  const handleDelete = async () => {
    try {
      setLoading(true);
      await deleteTeacher(teacher.id);
      onDeleted();
      onOpenChange(false);
    } catch (error) {
      console.error("Delete teacher error:", error);
      alert("Failed to delete teacher: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-red-600">Permanently Delete Teacher</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-gray-600 space-y-2">
          <p>
            Are you sure you want to <strong>permanently delete</strong> this teacher?
            This action cannot be undone.
          </p>

          <div className="bg-gray-50 border rounded-md p-3">
            <p className="font-medium text-gray-800">{teacher.fullName}</p>
            <p className="text-xs text-gray-500">{teacher.email} · {teacher.employeeId}</p>
          </div>

          <p className="text-xs text-red-500">
            The teacher's login account and all profile data will be permanently removed.
          </p>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteTeacherDialog;
