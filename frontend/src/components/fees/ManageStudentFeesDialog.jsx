import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { addVariableFeeToStudent, removeVariableFeeFromStudent, currentPeriod, getFeePaymentsByStudent } from "@/services/fees.service";

const ManageStudentFeesDialog = ({ open, onOpenChange, student, profile, variableFees, onUpdated }) => {
  const [saving, setSaving] = useState(false);

  // Which variable structureIds are currently on the student's profile
  const currentVarIds = useMemo(() => {
    const items = profile?.items || [];
    return new Set(items.filter((i) => i.type === "variable").map((i) => i.structureId));
  }, [profile]);

  const fixedItems = useMemo(
    () => (profile?.items || []).filter((i) => i.type === "fixed"),
    [profile]
  );

  const [selectedVarIds, setSelectedVarIds] = useState(() => new Set(currentVarIds));
  const [paidOneTimeIds, setPaidOneTimeIds] = useState(new Set()); // one-time fees already paid → locked

  // Reset and load paid one-time status whenever the dialog opens
  useEffect(() => {
    if (!open || !student || !profile) return;
    setSelectedVarIds(new Set(currentVarIds));
    // Find which one-time variable fees have already been (partially) paid
    getFeePaymentsByStudent(student.id, profile.academicYear).then((pays) => {
      const paid = new Set();
      pays.forEach((p) => {
        if ((p.amountPaid || 0) > 0) {
          (p.items || []).forEach((it) => {
            if (it.isOneTime && it.structureId) paid.add(it.structureId);
          });
        }
      });
      setPaidOneTimeIds(paid);
    }).catch(() => setPaidOneTimeIds(new Set()));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelectedVarIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSave = async () => {
    if (!student || !profile) return;
    setSaving(true);
    const from = currentPeriod();
    try {
      const academicYear = profile.academicYear;
      // Add newly selected variable fees (skip locked paid one-time fees)
      for (const v of variableFees) {
        if (paidOneTimeIds.has(v.id)) continue;
        if (selectedVarIds.has(v.id) && !currentVarIds.has(v.id)) {
          await addVariableFeeToStudent(
            student.id,
            { structureId: v.id, label: v.label, amount: v.amount, type: "variable", isOneTime: v.isOneTime || false, chargedDuringHolidays: v.chargedDuringHolidays ?? true },
            from,
            academicYear
          );
        }
      }
      // Remove deselected variable fees (skip locked paid one-time fees)
      for (const v of variableFees) {
        if (paidOneTimeIds.has(v.id)) continue;
        if (!selectedVarIds.has(v.id) && currentVarIds.has(v.id)) {
          await removeVariableFeeFromStudent(student.id, v.id, from, academicYear);
        }
      }
      // Await refresh so dialog stays in "Saving…" state until data is fresh
      await onUpdated?.();
      onOpenChange(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    // Exclude locked (paid one-time) fees from change detection
    const effectiveCurrent  = new Set([...currentVarIds].filter((id) => !paidOneTimeIds.has(id)));
    const effectiveSelected = new Set([...selectedVarIds].filter((id) => !paidOneTimeIds.has(id)));
    if (effectiveCurrent.size !== effectiveSelected.size) return true;
    for (const id of effectiveSelected) if (!effectiveCurrent.has(id)) return true;
    return false;
  }, [selectedVarIds, currentVarIds, paidOneTimeIds]);

  if (!student || !profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Fees — {student.fullName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-xs text-gray-500">
            Changes apply from <strong>{currentPeriod()}</strong> onwards. Already-paid months are not affected.
          </p>

          {/* Fixed fees — read-only */}
          {fixedItems.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium text-gray-700">Fixed Fees (class-level)</p>
              {fixedItems.map((item) => (
                <div key={item.structureId} className="flex items-center gap-3 p-2.5 border rounded-md bg-gray-50">
                  <Checkbox checked disabled />
                  <span className="flex-1 text-gray-500">{item.label}</span>
                  {item.isOneTime
                    ? <Badge className="bg-purple-100 text-purple-700 text-xs">One-time</Badge>
                    : null}
                  <span className="font-medium text-gray-500">
                    ₹{item.amount?.toLocaleString()}{item.isOneTime ? "" : "/mo"}
                  </span>
                </div>
              ))}
              <p className="text-xs text-gray-400">Fixed fees can only be changed by editing the fee structure.</p>
            </div>
          )}

          {/* Variable fees — editable */}
          {variableFees.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-gray-700">Variable Fees (optional add-ons)</p>
              {variableFees.map((v) => {
                const isLocked = v.isOneTime && paidOneTimeIds.has(v.id);
                return (
                  <div
                    key={v.id}
                    className={`flex items-center gap-3 p-2.5 border rounded-md ${isLocked ? "bg-gray-50 opacity-75" : ""}`}
                  >
                    <Checkbox
                      checked={selectedVarIds.has(v.id)}
                      disabled={isLocked}
                      onCheckedChange={() => !isLocked && toggle(v.id)}
                    />
                    <span className={`flex-1 ${isLocked ? "text-gray-400" : ""}`}>{v.label}</span>
                    {v.isOneTime
                      ? <Badge className="bg-purple-100 text-purple-700 text-xs">One-time</Badge>
                      : null}
                    {isLocked
                      ? <span className="text-xs text-green-600">Paid</span>
                      : !v.chargedDuringHolidays
                        ? <span className="text-xs text-gray-400">no-holiday</span>
                        : null}
                    <span className={`font-medium ${isLocked ? "text-gray-400" : ""}`}>
                      ₹{v.amount?.toLocaleString()}{v.isOneTime ? "" : "/mo"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-xs">No variable fees defined yet.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageStudentFeesDialog;
