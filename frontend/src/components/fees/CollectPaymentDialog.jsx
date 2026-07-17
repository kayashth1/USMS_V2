import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  validatePayment,
  buildAllocationPlan,
  createPayment,
  buildReceipt,
  PaymentMode,
} from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
const TODAY = new Date().toISOString().slice(0, 10);

const MODE_LABELS = {
  [PaymentMode.CASH]:   "Cash",
  [PaymentMode.UPI]:    "UPI",
  [PaymentMode.CHEQUE]: "Cheque",
  [PaymentMode.DD]:     "Demand Draft",
  [PaymentMode.ONLINE]: "Online Transfer",
};

/**
 * Converts the AllocationPlan (computed outside of Firestore) into
 * allocation-like objects that buildAllocationTable can consume.
 * Since PaymentAllocationService.getAllocationsByPayment is not yet
 * implemented, this path is used immediately after payment creation.
 */
function buildAllocsFromPlan(allocationPlan) {
  const allocs = [];
  if (allocationPlan.openingBalanceAllocation > 0) {
    allocs.push({
      allocationTarget:     "opening_balance",
      installmentId:        null,
      period:               null,
      periodLabel:          "Prior Year Balance",
      allocatedAmount:      allocationPlan.openingBalanceAllocation,
      componentAllocations: [],
    });
  }
  for (const ia of allocationPlan.installmentAllocations) {
    allocs.push({
      allocationTarget:     "installment",
      installmentId:        ia.installmentId,
      period:               ia.period,
      periodLabel:          ia.periodLabel,
      allocatedAmount:      ia.allocatedAmount,
      componentAllocations: ia.componentAllocations,
    });
  }
  return allocs;
}

export default function CollectPaymentDialog({
  open,
  onOpenChange,
  profile,
  installments,
  school,
  studentName,
  onPaymentCreated,
}) {
  const [amount,      setAmount]      = useState("");
  const [mode,        setMode]        = useState(PaymentMode.CASH);
  const [date,        setDate]        = useState(TODAY);
  const [collectedBy, setCollectedBy] = useState("");
  const [remarks,     setRemarks]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // ── Live validation (synchronous — pure function) ─────────────────────────

  const paymentRequest = useMemo(() => ({
    paymentAmount: Number(amount) || 0,
    paymentMode:   mode,
    paymentDate:   date ? new Date(date) : new Date(),
    collectedBy:   collectedBy.trim(),
    remarks:       remarks.trim() || null,
  }), [amount, mode, date, collectedBy, remarks]);

  const validation = useMemo(() => {
    if (!profile || !installments) return null;
    return validatePayment(profile, installments, paymentRequest);
  }, [profile, installments, paymentRequest]);

  // ── Live allocation preview (synchronous — pure function) ─────────────────

  const allocationPlan = useMemo(() => {
    if (!validation?.valid || !profile || !installments) return null;
    return buildAllocationPlan(profile, installments, paymentRequest);
  }, [validation, profile, installments, paymentRequest]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validation?.valid || !allocationPlan || !profile) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const { paymentId, receiptNo } = await createPayment({
        profile,
        paymentRequest,
        allocationPlan,
      });

      // Build receipt from in-memory data (no extra Firestore read needed)
      const syntheticPayment = {
        id:            paymentId,
        receiptNo,
        paymentDate:   paymentRequest.paymentDate,
        academicYear:  profile.academicYear,
        paymentMode:   paymentRequest.paymentMode,
        collectedBy:   paymentRequest.collectedBy,
        remarks:       paymentRequest.remarks ?? null,
        status:        "confirmed",
      };
      const allocs       = buildAllocsFromPlan(allocationPlan);
      const receiptModel = buildReceipt(syntheticPayment, profile, allocs, school ?? null);

      resetForm();
      onOpenChange(false);
      onPaymentCreated?.({ paymentId, receiptNo, receiptModel });
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setMode(PaymentMode.CASH);
    setDate(TODAY);
    setCollectedBy("");
    setRemarks("");
    setSubmitError(null);
  };

  const handleOpenChange = (v) => {
    if (!saving) { resetForm(); onOpenChange(v); }
  };

  const showErrors = amount.length > 0 && !validation?.valid;
  const payable    = validation?.payableAmount ?? 0;
  const outstanding = validation?.totalOutstanding ?? 0;

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
          {/* Student summary */}
          <div className="bg-gray-50 border rounded-md p-3 space-y-1">
            <p className="font-medium text-gray-800">{studentName || profile.studentId}</p>
            <p className="text-gray-500 text-xs">{profile.classLabel} · {profile.academicYear} · {profile.schedule}</p>
            <div className="flex gap-4 pt-1 text-xs">
              <span>Total Outstanding: <strong className={outstanding > 0 ? "text-red-500" : ""}>{INR(outstanding)}</strong></span>
              {outstanding !== payable && (
                <span>Payable Now: <strong className="text-amber-600">{INR(payable)}</strong></span>
              )}
            </div>
          </div>

          {/* Payment amount */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount (₹)</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setSubmitError(null); }}
                className="flex-1"
              />
              {payable > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setAmount(String(payable))}
                >
                  Full {INR(payable)}
                </Button>
              )}
            </div>
          </div>

          {/* Payment mode */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Payment Mode</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MODE_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment date */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Payment Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Collected by */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Collected By</label>
            <Input
              placeholder="Staff name"
              value={collectedBy}
              onChange={(e) => setCollectedBy(e.target.value)}
            />
          </div>

          {/* Remarks */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Remarks <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input
              placeholder="Cheque no., UTR, notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Validation errors */}
          {showErrors && validation.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
              {validation.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}

          {/* Allocation preview */}
          {allocationPlan && (
            <div className="border rounded-md overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Allocation Preview
              </div>
              <div className="divide-y">
                {allocationPlan.openingBalanceAllocation > 0 && (
                  <div className="px-3 py-2 flex justify-between text-xs">
                    <span className="text-gray-500">Prior Year Balance</span>
                    <span className="font-medium">{INR(allocationPlan.openingBalanceAllocation)}</span>
                  </div>
                )}
                {allocationPlan.installmentAllocations.map((ia) => (
                  <div key={ia.installmentId} className="px-3 py-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 font-medium">{ia.periodLabel}</span>
                      <span className="font-medium">{INR(ia.allocatedAmount)}</span>
                    </div>
                    {ia.componentAllocations.length > 0 && (
                      <div className="mt-1 pl-2 space-y-0.5">
                        {ia.componentAllocations.map((c) => (
                          <div key={c.feeStructureId} className="flex justify-between text-xs text-gray-400">
                            <span>{c.label}</span>
                            <span>{INR(c.allocatedAmount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="px-3 py-2 flex justify-between font-semibold bg-indigo-50 text-xs">
                  <span className="text-indigo-700">Total Allocated</span>
                  <span className="text-indigo-700">{INR(allocationPlan.allocatedAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !validation?.valid || !allocationPlan}
          >
            {saving ? "Processing..." : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
