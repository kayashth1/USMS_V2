import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelPayment } from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

export default function CancelPaymentDialog({ open, onOpenChange, payment, onCancelled }) {
  const [reason,    setReason]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const handleCancel = async () => {
    if (!payment?.id) return;
    if (!reason.trim()) { setError("Cancellation reason is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const cancelledBy = localStorage.getItem("principalEmail") || "admin";
      await cancelPayment(payment.id, reason.trim(), cancelledBy);
      setReason("");
      onOpenChange(false);
      onCancelled?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v) => {
    if (!saving) {
      setReason("");
      setError(null);
      onOpenChange(v);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Payment summary */}
          <div className="bg-gray-50 border rounded-md p-3 space-y-1">
            <p className="font-medium text-gray-800">{INR(payment.paymentAmount)} — {payment.receiptNo}</p>
            <p className="text-gray-500">{payment.paymentMode?.toUpperCase()} · {payment.paymentDate instanceof Date
              ? payment.paymentDate.toLocaleDateString("en-IN")
              : payment.paymentDate?.toDate?.()?.toLocaleDateString("en-IN") ?? "—"}</p>
            {payment.collectedBy && <p className="text-gray-500">Collected by: {payment.collectedBy}</p>}
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
            <p className="font-medium text-amber-800 text-xs">What happens when you cancel this payment?</p>
            <ul className="text-xs text-amber-700 list-disc pl-4 space-y-0.5">
              <li>The payment status changes to <strong>Cancelled</strong></li>
              <li>Installment balances are restored</li>
              <li>The receipt is kept as a permanent record</li>
              <li>This action cannot be undone</li>
            </ul>
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Cancellation Reason</label>
            <Input
              placeholder="e.g. Duplicate entry, wrong amount..."
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={saving || !reason.trim()}
          >
            {saving ? "Cancelling..." : "Cancel Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
