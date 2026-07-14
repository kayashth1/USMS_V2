import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  updateDraftProfile,
  getVariableFeeStructuresOrdered,
  AdjustmentType,
  AdjustmentScope,
  AdjustmentCalculationType,
} from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

const ADJ_TYPE_LABELS = {
  [AdjustmentType.SCHOLARSHIP]:       "Scholarship",
  [AdjustmentType.CONCESSION]:        "Concession",
  [AdjustmentType.SIBLING_DISCOUNT]:  "Sibling Discount",
  [AdjustmentType.STAFF_BENEFIT]:     "Staff Benefit",
  [AdjustmentType.GOVERNMENT_SCHEME]: "Government Scheme",
  [AdjustmentType.WAIVER]:            "Waiver",
  [AdjustmentType.OTHER]:             "Other",
};

const EMPTY_ADJ = {
  type:            AdjustmentType.CONCESSION,
  label:           "",
  reason:          "",
  calculationType: AdjustmentCalculationType.FIXED_AMOUNT,
  value:           "",
  scope:           AdjustmentScope.TOTAL_FEE,
  maxAmount:       "",
};

export default function EditDraftProfileDialog({
  open,
  onOpenChange,
  profile,
  schoolId,
  onUpdated,
}) {
  const [schedule,       setSchedule]       = useState("monthly");
  const [varStructures,  setVarStructures]  = useState([]);  // all available variable fee structs
  const [selectedVarIds, setSelectedVarIds] = useState([]);  // currently selected
  const [adjustments,    setAdjustments]    = useState([]);
  const [adjForm,        setAdjForm]        = useState(EMPTY_ADJ);
  const [loadingVars,    setLoadingVars]    = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

  // Initialise from profile on open
  useEffect(() => {
    if (!open || !profile) return;
    setSchedule(profile.schedule ?? "monthly");
    setSelectedVarIds(profile.variableFeeIds ?? []);
    setAdjustments((profile.feeAdjustments ?? []).map((a) => ({
      ...a,
      id:        a.id ?? `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      reason:    a.reason ?? "",
      value:     String(a.value ?? ""),
      maxAmount: a.maxAmount != null ? String(a.maxAmount) : "",
    })));
    setError(null);
    setAdjForm(EMPTY_ADJ);

    // Load available variable fee structures
    setLoadingVars(true);
    getVariableFeeStructuresOrdered(schoolId)
      .then(setVarStructures)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingVars(false));
  }, [open, profile, schoolId]);

  // Fixed line items on the profile (display only)
  const fixedItems = useMemo(
    () => (profile?.feeLineItems ?? []).filter((i) => i.type === "fixed"),
    [profile]
  );

  const toggleVar = (id) => {
    setSelectedVarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addAdjustment = () => {
    const v = Number(adjForm.value);
    if (!adjForm.value || isNaN(v) || v <= 0) { setError("Adjustment value must be greater than 0"); return; }
    if (!adjForm.reason.trim()) { setError("Reason is required for adjustments"); return; }
    const maxA = adjForm.maxAmount ? Number(adjForm.maxAmount) : null;
    if (adjForm.maxAmount && (isNaN(maxA) || maxA <= 0)) { setError("Max amount must be greater than 0"); return; }

    setAdjustments((prev) => [
      ...prev,
      {
        id:              `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type:            adjForm.type,
        label:           adjForm.label.trim() || ADJ_TYPE_LABELS[adjForm.type],
        reason:          adjForm.reason.trim(),
        calculationType: adjForm.calculationType,
        value:           v,
        scope:           adjForm.scope,
        targetComponentIds: [],
        maxAmount:       adjForm.calculationType === AdjustmentCalculationType.PERCENTAGE ? maxA : null,
        computedAmount:  0, // recomputed server-side
      },
    ]);
    setAdjForm(EMPTY_ADJ);
    setError(null);
  };

  const removeAdjustment = (i) => {
    setAdjustments((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateDraftProfile(profile.id, {
        schedule,
        variableFeeIds: selectedVarIds,
        feeAdjustments: adjustments.map((a) => ({
          id:                 a.id,
          type:               a.type,
          label:              a.label,
          reason:             a.reason,
          calculationType:    a.calculationType,
          value:              Number(a.value),
          scope:              a.scope,
          targetComponentIds: a.targetComponentIds ?? [],
          maxAmount:          a.maxAmount != null && a.maxAmount !== "" ? Number(a.maxAmount) : null,
          computedAmount:     0, // server-side overrides this
        })),
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Draft Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm max-h-[70vh] overflow-y-auto pr-1">

          {/* ── Fixed components (read-only) ── */}
          {fixedItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fixed Fee Components</p>
              <div className="border rounded-md divide-y bg-gray-50">
                {fixedItems.map((item) => (
                  <div key={item.feeStructureId} className="flex justify-between px-3 py-2">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="text-gray-500 text-xs">{INR(item.amount)}/cycle</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 italic">Fixed components are set by the class fee structure and cannot be edited here.</p>
            </div>
          )}

          {/* ── Schedule ── */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Schedule</label>
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly (12 installments)</SelectItem>
                <SelectItem value="quarterly">Quarterly (4 installments)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Variable fee structures ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variable Fees (Optional)</p>
            {loadingVars ? (
              <p className="text-xs text-gray-400">Loading variable fees…</p>
            ) : varStructures.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No variable fee structures found. Add them via "Fee Structures".</p>
            ) : (
              <div className="border rounded-md divide-y">
                {varStructures.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={selectedVarIds.includes(s.id)}
                      onChange={() => toggleVar(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{s.label}</span>
                      {s.isOneTime && <Badge className="bg-amber-100 text-amber-600 text-xs ml-2">one-time</Badge>}
                    </div>
                    <span className="text-gray-500 text-xs shrink-0">{INR(s.amount)}/cycle</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Adjustments ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adjustments / Discounts</p>

            {adjustments.length > 0 && (
              <div className="border rounded-md divide-y">
                {adjustments.map((adj, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{adj.label}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {adj.calculationType === AdjustmentCalculationType.PERCENTAGE
                          ? `${adj.value}%${adj.maxAmount ? ` (max ${INR(adj.maxAmount)})` : ""}`
                          : INR(adj.value)}
                      </span>
                    </div>
                    <Badge className="bg-green-100 text-green-600 text-xs">{adj.type}</Badge>
                    <button
                      className="text-xs text-red-400 hover:text-red-600 shrink-0"
                      onClick={() => removeAdjustment(i)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add adjustment form */}
            <div className="border rounded-md p-3 space-y-3 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">Add Adjustment</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Type</label>
                  <Select value={adjForm.type}
                    onValueChange={(v) => setAdjForm((p) => ({ ...p, type: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ADJ_TYPE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Calculation</label>
                  <Select value={adjForm.calculationType}
                    onValueChange={(v) => setAdjForm((p) => ({ ...p, calculationType: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AdjustmentCalculationType.FIXED_AMOUNT}>Fixed Amount (₹)</SelectItem>
                      <SelectItem value={AdjustmentCalculationType.PERCENTAGE}>Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    {adjForm.calculationType === AdjustmentCalculationType.PERCENTAGE ? "%" : "₹"} Value
                  </label>
                  <Input
                    type="number" min="0" placeholder="0" className="h-8 text-xs"
                    value={adjForm.value}
                    onChange={(e) => setAdjForm((p) => ({ ...p, value: e.target.value }))}
                  />
                </div>
                {adjForm.calculationType === AdjustmentCalculationType.PERCENTAGE && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Max Cap (₹) — optional</label>
                    <Input
                      type="number" min="0" placeholder="no cap" className="h-8 text-xs"
                      value={adjForm.maxAmount}
                      onChange={(e) => setAdjForm((p) => ({ ...p, maxAmount: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Label (optional)</label>
                  <Input
                    placeholder={ADJ_TYPE_LABELS[adjForm.type]}
                    className="h-8 text-xs"
                    value={adjForm.label}
                    onChange={(e) => setAdjForm((p) => ({ ...p, label: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Reason <span className="text-red-400">*</span></label>
                  <Input
                    placeholder="e.g. Merit scholarship"
                    className="h-8 text-xs"
                    value={adjForm.reason}
                    onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))}
                  />
                </div>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={addAdjustment}>
                + Add Adjustment
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
