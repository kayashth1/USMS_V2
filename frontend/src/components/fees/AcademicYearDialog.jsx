import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createAcademicYear, activateAcademicYear, closeAcademicYear, deleteAcademicYear } from "@/fees-v2";
import { useConfirm } from "@/components/ui/confirm-dialog";

const STATUS_COLORS = {
  active:   "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  closed:   "bg-red-100 text-red-500",
};

const EMPTY_FORM = { year: "", startDate: "", endDate: "" };

export default function AcademicYearDialog({ open, onOpenChange, schoolId, years = [], onChanged }) {
  const confirm = useConfirm();
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [actId,     setActId]     = useState(null);   // activating
  const [closeId,   setCloseId]   = useState(null);   // closing
  const [deleteId,  setDeleteId]  = useState(null);   // deleting
  const [closeErrors, setCloseErrors] = useState(null); // structured close errors

  const handleCreate = async () => {
    if (!form.year || !form.startDate || !form.endDate) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAcademicYear({
        schoolId,
        year:      form.year.trim(),
        startDate: new Date(form.startDate),
        endDate:   new Date(form.endDate),
      });
      setForm(EMPTY_FORM);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (yearId) => {
    setActId(yearId);
    setError(null);
    try {
      await activateAcademicYear(yearId);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setActId(null);
    }
  };

  const handleClose = async (yearId) => {
    const ok = await confirm("Close this academic year? This will prevent new fee profiles from being created for it.");
    if (!ok) return;
    setCloseId(yearId);
    setError(null);
    setCloseErrors(null);
    try {
      const result = await closeAcademicYear(yearId);
      if (result.success) {
        onChanged?.();
      } else {
        setCloseErrors({ yearId, errors: result.errors });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCloseId(null);
    }
  };

  const handleDelete = async (yearId) => {
    const ok = await confirm({
      title: "Delete academic year?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeleteId(yearId);
    setError(null);
    try {
      await deleteAcademicYear(yearId);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleteId(null);
    }
  };

  const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Academic Years</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm max-h-[65vh] overflow-y-auto pr-1">
          {/* Existing years */}
          {sorted.length === 0 ? (
            <p className="text-gray-400 text-center py-4">No academic years yet.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {sorted.map((y) => (
                <div key={y.id} className="space-y-0">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">{y.year}</p>
                      <p className="text-xs text-gray-400">
                        {y.startDate?.toDate?.()?.toLocaleDateString("en-IN") ?? "—"}
                        {" — "}
                        {y.endDate?.toDate?.()?.toLocaleDateString("en-IN") ?? "—"}
                      </p>
                    </div>
                    <Badge className={STATUS_COLORS[y.status] ?? ""}>{y.status}</Badge>
                    <div className="flex gap-1 shrink-0">
                      {y.status === "inactive" && (
                        <Button size="sm" variant="outline" disabled={actId === y.id}
                          onClick={() => handleActivate(y.id)}>
                          {actId === y.id ? "Activating..." : "Activate"}
                        </Button>
                      )}
                      {(y.status === "active" || y.status === "inactive") && (
                        <Button size="sm" variant="outline"
                          className="text-orange-600 hover:text-orange-700 border-orange-200"
                          disabled={closeId === y.id}
                          onClick={() => handleClose(y.id)}>
                          {closeId === y.id ? "Closing..." : "Close Year"}
                        </Button>
                      )}
                      {y.status === "inactive" && (
                        <Button size="sm" variant="ghost"
                          className="text-red-400 hover:text-red-600"
                          disabled={deleteId === y.id}
                          onClick={() => handleDelete(y.id)}>
                          {deleteId === y.id ? "..." : "Delete"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {closeErrors?.yearId === y.id && (
                    <div className="bg-amber-50 border-t border-amber-100 px-3 py-2 space-y-1">
                      <p className="text-xs font-medium text-amber-700">Cannot close — resolve these first:</p>
                      {closeErrors.errors.map((e, i) => (
                        <p key={i} className="text-xs text-amber-600">• {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new year */}
          <div className="border rounded-md p-4 space-y-3">
            <p className="font-medium text-gray-700">Create New Academic Year</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Year (e.g. 2026-27)</label>
              <Input
                placeholder="2026-27"
                value={form.year}
                onChange={(e) => { setForm((p) => ({ ...p, year: e.target.value })); setError(null); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Start Date</label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">End Date</label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Creating..." : "Create Academic Year"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
