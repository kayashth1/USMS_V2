import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { createDraftProfile } from "@/fees-v2";

const EMPTY = {
  studentId:          "",
  schedule:           "monthly",
  openingOutstanding: "",
  openingCredit:      "",
};

export default function CreateDraftProfileDialog({
  open,
  onOpenChange,
  schoolId,
  activeYear,           // { id, year }
  students = [],
  classes  = [],
  existingProfiles = [], // studentFeeProfiles already created for the active year
  onCreated,
}) {
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (key, val) => { setForm((p) => ({ ...p, [key]: val })); setError(null); };

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === form.studentId) ?? null,
    [students, form.studentId]
  );

  const existingStudentIds = useMemo(
    () => new Set(existingProfiles.map((p) => p.studentId)),
    [existingProfiles]
  );

  const sortedStudents = useMemo(
    () => students
      .filter((s) => !existingStudentIds.has(s.id))
      .sort((a, b) =>
        (a.classLabel ?? "").localeCompare(b.classLabel ?? "") ||
        (a.fullName ?? "").localeCompare(b.fullName ?? "")
      ),
    [students, existingStudentIds]
  );

  const handleSubmit = async () => {
    if (!form.studentId) { setError("Select a student"); return; }
    if (!selectedStudent?.classId) { setError("Selected student has no class assigned"); return; }
    if (!activeYear?.id) { setError("No active academic year found"); return; }

    const outstanding = Number(form.openingOutstanding) || 0;
    const credit      = Number(form.openingCredit)      || 0;
    if (outstanding < 0) { setError("Opening outstanding cannot be negative"); return; }
    if (credit      < 0) { setError("Opening credit cannot be negative");      return; }

    setSaving(true);
    setError(null);
    try {
      const profileId = await createDraftProfile({
        studentId:         form.studentId,
        academicYearId:    activeYear.id,
        schoolId,
        classId:           selectedStudent.classId,
        classLabel:        selectedStudent.classLabel ?? "",
        schedule:          form.schedule,
        openingOutstanding: outstanding,
        openingCredit:      credit,
      });
      setForm(EMPTY);
      onOpenChange(false);
      onCreated?.(profileId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v) => {
    if (!saving) { setForm(EMPTY); setError(null); onOpenChange(v); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Fee Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {activeYear && (
            <p className="text-xs text-gray-500 bg-indigo-50 border border-indigo-100 rounded px-3 py-1.5">
              Academic Year: <strong>{activeYear.year}</strong>
            </p>
          )}

          {/* Student */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Student</label>
            <Select value={form.studentId} onValueChange={(v) => set("studentId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select student..." />
              </SelectTrigger>
              <SelectContent>
                {sortedStudents.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName} — {s.classLabel ?? "No Class"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStudent && (
              <p className="text-xs text-gray-400">
                Class: {selectedStudent.classLabel ?? "—"} · Adm: {selectedStudent.admissionNumber ?? "—"}
              </p>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Fee Schedule</label>
            <Select value={form.schedule} onValueChange={(v) => set("schedule", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly (12 installments)</SelectItem>
                <SelectItem value="quarterly">Quarterly (4 installments)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Opening balance (optional) */}
          <div className="space-y-3 border rounded-md p-3 bg-gray-50">
            <p className="text-xs font-medium text-gray-600">Prior Year Balance (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Outstanding (₹)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.openingOutstanding}
                  onChange={(e) => set("openingOutstanding", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Credit (₹)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.openingCredit}
                  onChange={(e) => set("openingCredit", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Note about auto-loaded fee structures */}
          <p className="text-xs text-gray-400 italic">
            Fixed fee structures for this student's class will be loaded automatically.
            Variable fees and adjustments can be added after profile creation.
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.studentId}>
            {saving ? "Creating..." : "Create Draft Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
