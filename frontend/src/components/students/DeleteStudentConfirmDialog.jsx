import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DeleteStudentConfirmDialog = ({
  open,
  onOpenChange,
  student,
  onConfirm,
  loading = false,
}) => {
  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">

        <DialogHeader>
          <DialogTitle className="text-red-600">
            Delete Student
          </DialogTitle>
        </DialogHeader>

        {/* BODY */}
        <div className="space-y-4 text-sm text-gray-600">

          <p>
            Are you sure you want to permanently delete this student?
          </p>

          <div className="border rounded-lg p-4 bg-red-50">
            <p className="font-semibold text-gray-800">
              {student.fullName}
            </p>
            <p className="text-xs text-gray-500">
              Class {student.classLabel || "-"} · Roll {student.roll || "-"}
            </p>
            <p className="text-xs text-gray-500">
              {student.email}
            </p>
          </div>

          <p className="text-xs text-gray-500">
            This action cannot be undone.
          </p>
        </div>

        {/* FOOTER */}
        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete Student"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

export default DeleteStudentConfirmDialog;
