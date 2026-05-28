import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const UpgradeClassDialog = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Upgrade Students to Next Class
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Current Class */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Current Class
            </label>
            <Select defaultValue="6">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">Class 6</SelectItem>
                <SelectItem value="7">Class 7</SelectItem>
                <SelectItem value="8">Class 8</SelectItem>
                <SelectItem value="9">Class 9</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Current Section */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Current Section
            </label>
            <Select defaultValue="all">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                <SelectItem value="A">Section A</SelectItem>
                <SelectItem value="B">Section B</SelectItem>
                <SelectItem value="C">Section C</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Promote To */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Promote To
            </label>
            <Select defaultValue="7">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Class 7</SelectItem>
                <SelectItem value="8">Class 8</SelectItem>
                <SelectItem value="9">Class 9</SelectItem>
                <SelectItem value="10">Class 10</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Warning */}
          <Alert className="border-yellow-300 bg-yellow-50">
            <AlertDescription className="text-yellow-800 text-sm">
              ⚠️ This action will promote all students from the selected
              class. This cannot be undone.
            </AlertDescription>
          </Alert>

        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button>
            Confirm Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeClassDialog;
