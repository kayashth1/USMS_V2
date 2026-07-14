import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { createRevision, RevisionType } from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

const CHANGE_TYPE_OPTIONS = [
  { value: RevisionType.ADD_VARIABLE_FEE,    label: "Add Variable Fee" },
  { value: RevisionType.REMOVE_VARIABLE_FEE, label: "Remove Variable Fee" },
  { value: RevisionType.ADD_FIXED_FEE,       label: "Add Fixed Fee" },
  { value: RevisionType.REMOVE_FIXED_FEE,    label: "Remove Fixed Fee" },
  { value: RevisionType.SCHOLARSHIP,         label: "Scholarship" },
  { value: RevisionType.WAIVER,              label: "Waiver" },
  { value: RevisionType.FINE,                label: "Fine" },
  { value: RevisionType.FEE_CORRECTION,      label: "Fee Correction" },
];

// ─── Per-change-type field controls ───────────────────────────────────────────

function ChangeEntry({ entry, index, feeStructures, profile, onChange, onRemove }) {
  const variableStructures = (feeStructures ?? []).filter((s) => s.type === "variable");
  const fixedStructures    = (feeStructures ?? []).filter((s) => s.type === "fixed");
  const profileItems       = profile.feeLineItems ?? [];
  const variableInProfile  = profileItems.filter((i) => i.type === "variable");
  const fixedInProfile     = profileItems.filter((i) => i.type === "fixed");

  const set = (fields) => onChange(index, fields);

  const handleTypeChange = (type) => {
    // Reset type-specific fields when type changes
    onChange(index, { revisionType: type });
  };

  const handleAddStructureChange = (feeStructureId, allStructures) => {
    const struct = allStructures.find((s) => s.id === feeStructureId);
    set({ feeStructureId, classId: struct?.classId ?? null });
  };

  const handleRemoveStructureChange = (feeStructureId, feeStructures) => {
    const struct = feeStructures.find((s) => s.id === feeStructureId);
    set({ feeStructureId, classId: struct?.classId ?? null });
  };

  const handleCorrectionStructureChange = (feeStructureId) => {
    const item = profileItems.find((i) => i.feeStructureId === feeStructureId);
    set({ feeStructureId, previousValue: item?.amount ?? 0, newValue: "" });
  };

  return (
    <div className="border rounded-md p-3 space-y-3 bg-gray-50/50 relative">
      <button
        type="button"
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-0.5"
        onClick={onRemove}
        aria-label="Remove change"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Change type selector */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Change Type</label>
        <Select value={entry.revisionType ?? ""} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-8 text-sm pr-8">
            <SelectValue placeholder="Select type…" />
          </SelectTrigger>
          <SelectContent>
            {CHANGE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ADD_VARIABLE_FEE */}
      {entry.revisionType === RevisionType.ADD_VARIABLE_FEE && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Fee Structure to Add</label>
          <Select value={entry.feeStructureId ?? ""}
            onValueChange={(v) => handleAddStructureChange(v, variableStructures)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select variable fee…" />
            </SelectTrigger>
            <SelectContent>
              {variableStructures.length === 0 && (
                <SelectItem value="__none" disabled>No variable fee structures found</SelectItem>
              )}
              {variableStructures.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label} · {INR(s.amount)}/cycle{s.isOneTime ? " (one-time)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* REMOVE_VARIABLE_FEE */}
      {entry.revisionType === RevisionType.REMOVE_VARIABLE_FEE && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Fee Component to Remove</label>
          <Select value={entry.feeStructureId ?? ""}
            onValueChange={(v) => set({ feeStructureId: v })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select component…" />
            </SelectTrigger>
            <SelectContent>
              {variableInProfile.length === 0 && (
                <SelectItem value="__none" disabled>No variable components on this profile</SelectItem>
              )}
              {variableInProfile.map((item) => (
                <SelectItem key={item.feeStructureId} value={item.feeStructureId}>
                  {item.label} · {INR(item.amount)}/cycle
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ADD_FIXED_FEE */}
      {entry.revisionType === RevisionType.ADD_FIXED_FEE && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Fee Structure to Add</label>
          <Select value={entry.feeStructureId ?? ""}
            onValueChange={(v) => handleAddStructureChange(v, fixedStructures)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select fixed fee…" />
            </SelectTrigger>
            <SelectContent>
              {fixedStructures.length === 0 && (
                <SelectItem value="__none" disabled>No fixed fee structures found</SelectItem>
              )}
              {fixedStructures.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label} · {INR(s.amount)}/cycle
                  {s.classLabel ? ` (${s.classLabel})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entry.classId && (
            <p className="text-xs text-gray-400 mt-1">Class ID: {entry.classId}</p>
          )}
        </div>
      )}

      {/* REMOVE_FIXED_FEE */}
      {entry.revisionType === RevisionType.REMOVE_FIXED_FEE && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Fee Component to Remove</label>
          <Select value={entry.feeStructureId ?? ""}
            onValueChange={(v) => handleRemoveStructureChange(v, feeStructures)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select component…" />
            </SelectTrigger>
            <SelectContent>
              {fixedInProfile.length === 0 && (
                <SelectItem value="__none" disabled>No fixed components on this profile</SelectItem>
              )}
              {fixedInProfile.map((item) => (
                <SelectItem key={item.feeStructureId} value={item.feeStructureId}>
                  {item.label} · {INR(item.amount)}/cycle
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* SCHOLARSHIP / WAIVER */}
      {(entry.revisionType === RevisionType.SCHOLARSHIP ||
        entry.revisionType === RevisionType.WAIVER) && (
        <div className="space-y-2">
          {/* Percentage vs Fixed Amount toggle */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Amount Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 h-8 rounded-md border text-xs transition-colors ${
                  entry.calculationType !== "fixed_amount"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => set({ calculationType: "percentage", value: entry.value ?? "" })}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                className={`flex-1 h-8 rounded-md border text-xs transition-colors ${
                  entry.calculationType === "fixed_amount"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => set({ calculationType: "fixed_amount", value: entry.value ?? "" })}
              >
                Fixed Amount (₹)
              </button>
            </div>
          </div>

          {/* Value */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {entry.calculationType === "fixed_amount" ? "Amount (₹)" : "Percentage (%)"}
            </label>
            <Input
              type="number"
              min="0"
              max={entry.calculationType !== "fixed_amount" ? 100 : undefined}
              className="h-8 text-sm"
              value={entry.value ?? ""}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={entry.calculationType === "fixed_amount" ? "e.g. 5000" : "e.g. 10"}
            />
          </div>

          {/* Scope */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Applies To</label>
            <Select
              value={entry.scope ?? "total_fee"}
              onValueChange={(v) => set({ scope: v, targetComponentIds: [] })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total_fee">Total Fee</SelectItem>
                <SelectItem value="specific_components">Specific Components</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Target component ids (when scope = specific_components) */}
          {entry.scope === "specific_components" && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Select Components</label>
              <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-white">
                {profileItems.length === 0 && (
                  <p className="text-xs text-gray-400">No fee components on this profile.</p>
                )}
                {profileItems.map((item) => {
                  const checked = (entry.targetComponentIds ?? []).includes(item.feeStructureId);
                  return (
                    <label key={item.feeStructureId} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const ids = entry.targetComponentIds ?? [];
                          set({
                            targetComponentIds: e.target.checked
                              ? [...ids, item.feeStructureId]
                              : ids.filter((id) => id !== item.feeStructureId),
                          });
                        }}
                        className="rounded"
                      />
                      <span>{item.label} · {INR(item.amount)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FINE */}
      {entry.revisionType === RevisionType.FINE && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fine Amount (₹)</label>
            <Input
              type="number"
              min="1"
              className="h-8 text-sm"
              value={entry.amount ?? ""}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="e.g. 500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fine Reason</label>
            <Input
              className="h-8 text-sm"
              value={entry.fineReason ?? ""}
              onChange={(e) => set({ fineReason: e.target.value })}
              placeholder="e.g. Late submission penalty"
            />
          </div>
        </div>
      )}

      {/* FEE_CORRECTION */}
      {entry.revisionType === RevisionType.FEE_CORRECTION && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fee Component</label>
            <Select value={entry.feeStructureId ?? ""}
              onValueChange={handleCorrectionStructureChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select component…" />
              </SelectTrigger>
              <SelectContent>
                {profileItems.length === 0 && (
                  <SelectItem value="__none" disabled>No fee components on this profile</SelectItem>
                )}
                {profileItems.map((item) => (
                  <SelectItem key={item.feeStructureId} value={item.feeStructureId}>
                    {item.label} · Current: {INR(item.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current Amount (₹)</label>
              <Input
                type="number"
                min="0"
                className="h-8 text-sm"
                value={entry.previousValue ?? ""}
                onChange={(e) => set({ previousValue: e.target.value })}
                placeholder="Old value"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">New Amount (₹)</label>
              <Input
                type="number"
                min="0"
                className="h-8 text-sm"
                value={entry.newValue ?? ""}
                onChange={(e) => set({ newValue: e.target.value })}
                placeholder="Corrected value"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Build a clean changes array from local form state ─────────────────────────

function buildCleanChanges(changes) {
  return changes.map((c) => {
    switch (c.revisionType) {
      case RevisionType.ADD_VARIABLE_FEE:
        return { revisionType: c.revisionType, feeStructureId: c.feeStructureId ?? "", action: "add" };
      case RevisionType.REMOVE_VARIABLE_FEE:
        return { revisionType: c.revisionType, feeStructureId: c.feeStructureId ?? "", action: "remove" };
      case RevisionType.ADD_FIXED_FEE:
        return { revisionType: c.revisionType, feeStructureId: c.feeStructureId ?? "", classId: c.classId ?? "", action: "add" };
      case RevisionType.REMOVE_FIXED_FEE:
        return { revisionType: c.revisionType, feeStructureId: c.feeStructureId ?? "", classId: c.classId ?? "", action: "remove" };
      case RevisionType.SCHOLARSHIP:
      case RevisionType.WAIVER: {
        const entry = { revisionType: c.revisionType, scope: c.scope ?? "total_fee" };
        if (c.calculationType === "fixed_amount") entry.fixedAmount = Number(c.value ?? 0);
        else entry.percentage = Number(c.value ?? 0);
        if (c.scope === "specific_components") entry.targetComponentIds = c.targetComponentIds ?? [];
        return entry;
      }
      case RevisionType.FINE:
        return { revisionType: c.revisionType, amount: Number(c.amount ?? 0), reason: c.fineReason ?? "" };
      case RevisionType.FEE_CORRECTION:
        return {
          revisionType:  c.revisionType,
          feeStructureId: c.feeStructureId ?? "",
          previousValue:  Number(c.previousValue ?? 0),
          newValue:       Number(c.newValue ?? 0),
        };
      default:
        return c;
    }
  });
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

/**
 * Dialog for creating a new FeeRevisionDoc (saved as DRAFT).
 */
export default function NewRevisionDialog({
  open, onOpenChange, profile, installments, feeStructures, adminId, onCreated,
}) {
  const [reason,               setReason]               = useState("");
  const [effectiveInstallment, setEffectiveInstallment] = useState("");
  const [changes,              setChanges]              = useState([{ revisionType: "" }]);
  const [saving,               setSaving]               = useState(false);
  const [submitError,          setSubmitError]          = useState(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setReason("");
      setEffectiveInstallment("");
      setChanges([{ revisionType: "" }]);
      setSubmitError(null);
    }
  }, [open]);

  // Available installment periods for the picker (non-paid, non-cancelled)
  const availablePeriods = (installments ?? [])
    .filter((i) => !["paid", "cancelled"].includes(i.status))
    .reduce((acc, i) => {
      if (!acc.some((x) => x.period === i.period)) {
        acc.push({ period: i.period, periodLabel: i.periodLabel ?? i.period });
      }
      return acc;
    }, [])
    .sort((a, b) => a.period.localeCompare(b.period));

  const handleFieldChange = (idx, fields) => {
    setChanges((prev) => prev.map((c, i) => (i === idx ? { ...c, ...fields } : c)));
  };

  const handleAddChange = () => {
    setChanges((prev) => [...prev, { revisionType: "" }]);
  };

  const handleRemoveChange = (idx) => {
    setChanges((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = reason.trim().length > 0
    && effectiveInstallment.length > 0
    && changes.length > 0
    && changes.every((c) => c.revisionType);

  const handleSubmit = async () => {
    setSaving(true);
    setSubmitError(null);
    try {
      const cleanChanges = buildCleanChanges(changes);
      await createRevision({
        profileId:            profile.id,
        studentId:            profile.studentId,
        schoolId:             profile.schoolId ?? localStorage.getItem("principalSchoolId"),
        academicYear:         profile.academicYear,
        requestedBy:          adminId,
        reason:               reason.trim(),
        effectiveInstallment,
        changes:              cleanChanges,
      });
      onCreated?.();
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New Fee Revision</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Reason */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Reason <span className="text-red-500">*</span>
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for this revision…"
            />
          </div>

          {/* Effective installment */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Effective From <span className="text-red-500">*</span>
            </label>
            {availablePeriods.length > 0 ? (
              <Select value={effectiveInstallment} onValueChange={setEffectiveInstallment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select installment period…" />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.map((p) => (
                    <SelectItem key={p.period} value={p.period}>{p.periodLabel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={effectiveInstallment}
                onChange={(e) => setEffectiveInstallment(e.target.value)}
                placeholder="YYYY-MM or Q1-YYYY-YY"
              />
            )}
            <p className="text-xs text-gray-400 mt-1">
              Changes apply from this installment onwards.
            </p>
          </div>

          {/* Changes list */}
          <div className="space-y-2">
            <label className="text-sm font-medium block">
              Changes <span className="text-red-500">*</span>
            </label>
            {changes.map((entry, idx) => (
              <ChangeEntry
                key={idx}
                entry={entry}
                index={idx}
                feeStructures={feeStructures ?? []}
                profile={profile}
                onChange={handleFieldChange}
                onRemove={() => handleRemoveChange(idx)}
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1"
              onClick={handleAddChange}
            >
              <Plus className="h-3 w-3" />
              Add Another Change
            </Button>
          </div>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
            {submitError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? "Saving…" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
