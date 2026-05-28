import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BulkDeleteConfirmDialog = ({ open, onOpenChange, count, loading, onConfirm }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} Student{count !== 1 ? "s" : ""}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          This will permanently delete {count} student{count !== 1 ? "s" : ""} and their
          Firebase Auth accounts. This action cannot be undone.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : `Delete ${count} Student${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkDeleteConfirmDialog;
