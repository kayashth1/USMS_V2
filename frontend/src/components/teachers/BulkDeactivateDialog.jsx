import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BulkDeactivateDialog = ({ open, onOpenChange, count, loading, onConfirm }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-red-600">
            Permanently Delete {count} Teacher{count !== 1 ? "s" : ""}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          {count} teacher{count !== 1 ? "s" : ""} will be <strong>permanently deleted</strong> along
          with their login accounts. This action cannot be undone.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : `Delete ${count} Teacher${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkDeactivateDialog;
