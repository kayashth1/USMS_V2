import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { computeRevisionPlan, applyRevisionPlan, RevisionStatus } from "@/fees-v2";
import { REVISION_TYPE_LABELS } from "./FeeRevisionSection";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

const REVISION_STATUS_COLORS = {
  [RevisionStatus.DRAFT]:            "bg-gray-100 text-gray-600",
  [RevisionStatus.PENDING_APPROVAL]: "bg-amber-100 text-amber-700",
  [RevisionStatus.APPROVED]:         "bg-green-100 text-green-700",
  [RevisionStatus.APPLIED]:          "bg-indigo-100 text-indigo-700",
  [RevisionStatus.REJECTED]:         "bg-red-100 text-red-600",
  [RevisionStatus.CANCELLED]:        "bg-gray-100 text-gray-400",
};

const REVISION_STATUS_LABELS = {
  [RevisionStatus.DRAFT]:            "Draft",
  [RevisionStatus.PENDING_APPROVAL]: "Pending Approval",
  [RevisionStatus.APPROVED]:         "Approved",
  [RevisionStatus.APPLIED]:          "Applied",
  [RevisionStatus.REJECTED]:         "Rejected",
  [RevisionStatus.CANCELLED]:        "Cancelled",
};

// ─── Profile-update derivation ─────────────────────────────────────────────────
// Computes the ProfileUpdate object required by applyRevisionPlan.
// This mirrors what the engine does to EngineState but projected onto the profile.

function buildProfileUpdate(profile, revision, feeStructuresMap) {
  const periods = profile.schedule === "quarterly" ? 4 : 12;

  let feeLineItems   = (profile.feeLineItems   ?? []).map((i) => ({ ...i }));
  let variableFeeIds = [...(profile.variableFeeIds ?? [])];
  let feeAdjustments = (profile.feeAdjustments ?? []).map((a) => ({ ...a }));

  for (const change of revision.changes ?? []) {
    const rt = change.revisionType;

    if (rt === "add_variable_fee" || rt === "add_fixed_fee") {
      const s = feeStructuresMap[change.feeStructureId];
      if (s) {
        // Include both recurring and one-time fees in feeLineItems so the
        // Fee Components list and grossAnnualFee stay in sync with installments.
        feeLineItems = feeLineItems.filter((i) => i.feeStructureId !== change.feeStructureId);
        feeLineItems.push({
          feeStructureId:          s.id,
          label:                   s.label,
          amount:                  s.amount,
          type:                    s.type,
          isOneTime:               s.isOneTime ?? false,
          chargedDuringHolidays:   s.chargedDuringHolidays ?? true,
          allocationPriority:      s.allocationPriority ?? 999,
        });
      }
      if (rt === "add_variable_fee" && !variableFeeIds.includes(change.feeStructureId)) {
        variableFeeIds.push(change.feeStructureId);
      }
    }

    if (rt === "remove_variable_fee" || rt === "remove_fixed_fee") {
      feeLineItems = feeLineItems.filter((i) => i.feeStructureId !== change.feeStructureId);
      if (rt === "remove_variable_fee") {
        variableFeeIds = variableFeeIds.filter((id) => id !== change.feeStructureId);
      }
    }

    if (rt === "fee_correction") {
      feeLineItems = feeLineItems.map((item) =>
        item.feeStructureId === change.feeStructureId
          ? { ...item, amount: Number(change.newValue) }
          : item
      );
    }

    if (rt === "scholarship" || rt === "waiver") {
      const isPercentage = change.percentage != null;
      feeAdjustments.push({
        id:                 `rev_${revision.revisionId}_${feeAdjustments.length}`,
        type:               rt,
        label:              `${rt === "scholarship" ? "Scholarship" : "Waiver"} (revision ${revision.revisionId})`,
        scope:              change.scope,
        targetComponentIds: change.targetComponentIds ?? [],
        calculationType:    isPercentage ? "percentage" : "fixed_amount",
        value:              isPercentage ? change.percentage : change.fixedAmount,
        maxAmount:          null,
        computedAmount:     0,
        reason:             revision.reason,
      });
    }
    // fine: no profile-level change
  }

  // Compute grossAnnualFee
  const grossAnnualFee = feeLineItems.reduce(
    (sum, item) => sum + (item.isOneTime ? item.amount : item.amount * periods),
    0
  );

  // Recompute computedAmount for every adjustment (including newly added ones)
  feeAdjustments = feeAdjustments.map((adj) => {
    let computed;
    if (adj.calculationType === "fixed_amount") {
      computed = Number(adj.value ?? adj.computedAmount ?? 0);
    } else {
      let base = grossAnnualFee;
      if (adj.scope === "specific_components") {
        const ids = new Set(adj.targetComponentIds ?? []);
        base = feeLineItems
          .filter((i) => ids.has(i.feeStructureId))
          .reduce((s, i) => s + (i.isOneTime ? i.amount : i.amount * periods), 0);
      }
      computed = Math.round(base * (adj.value ?? 0) / 100);
      if (adj.maxAmount != null && computed > adj.maxAmount) computed = adj.maxAmount;
    }
    return { ...adj, computedAmount: Math.max(0, computed) };
  });

  const totalAdjustmentAmount = feeAdjustments.reduce((s, a) => s + (a.computedAmount ?? 0), 0);
  const netAnnualFee = Math.max(0, grossAnnualFee - totalAdjustmentAmount);

  return { feeLineItems, feeAdjustments, variableFeeIds, grossAnnualFee, totalAdjustmentAmount, netAnnualFee };
}

// ─── Change summary helper ─────────────────────────────────────────────────────

function describeChange(change, feeStructuresMap) {
  const rt = change.revisionType;
  switch (rt) {
    case "add_variable_fee":
    case "add_fixed_fee": {
      const s = feeStructuresMap[change.feeStructureId];
      return s ? `${s.label} — ${INR(s.amount)}/cycle${s.isOneTime ? " (one-time)" : ""}` : change.feeStructureId;
    }
    case "remove_variable_fee":
    case "remove_fixed_fee": {
      const s = feeStructuresMap[change.feeStructureId];
      return `Remove "${s?.label ?? change.feeStructureId}"`;
    }
    case "scholarship":
    case "waiver":
      return change.percentage != null
        ? `${change.percentage}% off ${change.scope === "total_fee" ? "total fee" : "specific components"}`
        : `${INR(change.fixedAmount)} off ${change.scope === "total_fee" ? "total fee" : "specific components"}`;
    case "fine":
      return `${INR(change.amount)} — ${change.reason}`;
    case "fee_correction": {
      const s = feeStructuresMap[change.feeStructureId];
      return `${s?.label ?? change.feeStructureId}: ${INR(change.previousValue)} → ${INR(change.newValue)}`;
    }
    default:
      return "";
  }
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

/**
 * Preview computed RevisionPlan and (if revision is APPROVED) apply it.
 * Also serves as a read-only detail view for all other statuses.
 */
export default function RevisionPreviewDialog({
  open, onOpenChange, revision, profile, installments, feeStructures, adminId, onApplied,
}) {
  const [plan,         setPlan]         = useState(null);
  const [computeError, setComputeError] = useState(null);
  const [applying,     setApplying]     = useState(false);
  const [applyError,   setApplyError]   = useState(null);

  const feeStructuresMap = useMemo(() => {
    const map = {};
    (feeStructures ?? []).forEach((s) => { map[s.id] = s; });
    return map;
  }, [feeStructures]);

  // Compute plan synchronously when dialog opens
  useEffect(() => {
    if (!open || !revision || !profile || !installments) {
      setPlan(null);
      setComputeError(null);
      setApplyError(null);
      return;
    }
    setComputeError(null);
    setPlan(null);
    try {
      const computed = computeRevisionPlan(profile, installments, revision, feeStructuresMap);
      setPlan(computed);
    } catch (e) {
      setComputeError(e.message);
    }
  }, [open, revision?.revisionId, installments?.length, feeStructures?.length]);

  const handleApply = async () => {
    if (!revision || !plan) return;
    setApplying(true);
    setApplyError(null);
    try {
      const profileUpdate = buildProfileUpdate(profile, revision, feeStructuresMap);
      await applyRevisionPlan(revision, plan, profileUpdate, adminId);
      onOpenChange(false);
      await onApplied?.();
    } catch (e) {
      setApplyError(e.message);
    } finally {
      setApplying(false);
    }
  };

  const isApproved = revision?.status === RevisionStatus.APPROVED;
  const canApply   = isApproved && !!plan && !computeError;

  const requestedAt = revision?.requestedAt?.toDate?.()?.toLocaleDateString("en-IN") ?? "—";
  const appliedAt   = revision?.appliedAt?.toDate?.()?.toLocaleDateString("en-IN")   ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {isApproved ? "Preview & Apply Revision" : "Revision Details"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">Effective From</span>
              <span className="font-mono font-medium">{revision?.effectiveInstallment}</span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">Status</span>
              <Badge className={`text-xs ${REVISION_STATUS_COLORS[revision?.status] ?? ""}`}>
                {REVISION_STATUS_LABELS[revision?.status] ?? revision?.status}
              </Badge>
            </div>
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">Requested By</span>
              <span className="text-gray-700">{revision?.requestedBy ?? "—"} · {requestedAt}</span>
            </div>
            {appliedAt && (
              <div>
                <span className="text-xs text-gray-400 block mb-0.5">Applied By</span>
                <span className="text-gray-700">{revision?.appliedBy ?? "—"} · {appliedAt}</span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-xs text-gray-400 block mb-0.5">Reason</span>
              <span className="text-gray-700">{revision?.reason}</span>
            </div>
          </div>

          {/* Changes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Changes</p>
            <div className="space-y-1">
              {(revision?.changes ?? []).map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm bg-gray-50 border rounded-md px-3 py-2">
                  <Badge className="text-xs bg-gray-100 text-gray-600 shrink-0 mt-0.5">
                    {REVISION_TYPE_LABELS[c.revisionType] ?? c.revisionType}
                  </Badge>
                  <span className="text-gray-600 text-xs leading-relaxed">
                    {describeChange(c, feeStructuresMap)}
                  </span>
                </div>
              ))}
              {(revision?.changes ?? []).length === 0 && (
                <p className="text-sm text-gray-400 italic">No changes recorded.</p>
              )}
            </div>
          </div>

          {/* Compute error */}
          {computeError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
              <p className="font-medium mb-1">Could not compute revision plan</p>
              {computeError}
            </div>
          )}

          {/* Plan: summary cards + installment diff table */}
          {plan && (
            <>
              {plan.affectedInstallments.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-sm text-amber-700">
                  No open installments are affected by this revision from the effective installment onwards.
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border rounded-md px-3 py-2">
                      <p className="text-xs text-gray-400 mb-0.5">Increase</p>
                      <p className="text-sm font-semibold text-red-600">
                        +{INR(plan.summary.increase)}
                      </p>
                    </div>
                    <div className="border rounded-md px-3 py-2">
                      <p className="text-xs text-gray-400 mb-0.5">Decrease</p>
                      <p className="text-sm font-semibold text-green-600">
                        −{INR(plan.summary.decrease)}
                      </p>
                    </div>
                    <div className="border rounded-md px-3 py-2">
                      <p className="text-xs text-gray-400 mb-0.5">Net Difference</p>
                      <p className={`text-sm font-semibold ${
                        plan.summary.netDifference > 0 ? "text-red-600"
                          : plan.summary.netDifference < 0 ? "text-green-600"
                          : "text-gray-600"
                      }`}>
                        {plan.summary.netDifference >= 0 ? "+" : ""}{INR(plan.summary.netDifference)}
                      </p>
                    </div>
                  </div>

                  {/* Affected installments */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Affected Installments ({plan.affectedInstallments.length})
                    </p>
                    <div className="border rounded-md overflow-hidden max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b text-gray-500 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Period</th>
                            <th className="text-right px-3 py-1.5 font-medium">Old Gross</th>
                            <th className="text-right px-3 py-1.5 font-medium">Old Net</th>
                            <th className="text-right px-3 py-1.5 font-medium">New Gross</th>
                            <th className="text-right px-3 py-1.5 font-medium">New Net</th>
                            <th className="text-right px-3 py-1.5 font-medium">Δ Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {plan.affectedInstallments.map((diff) => {
                            const deltaNet = (diff.newValues.netAmount ?? 0) - (diff.oldValues.netAmount ?? 0);
                            return (
                              <tr key={diff.installmentId} className="tabular-nums">
                                <td className="px-3 py-1.5 font-medium">{diff.periodLabel ?? diff.period}</td>
                                <td className="px-3 py-1.5 text-right text-gray-500">
                                  {INR(diff.oldValues.grossAmount)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-500">
                                  {INR(diff.oldValues.netAmount)}
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  {INR(diff.newValues.grossAmount)}
                                </td>
                                <td className="px-3 py-1.5 text-right font-medium">
                                  {INR(diff.newValues.netAmount)}
                                </td>
                                <td className={`px-3 py-1.5 text-right font-medium ${
                                  deltaNet > 0 ? "text-red-500" : deltaNet < 0 ? "text-green-600" : "text-gray-400"
                                }`}>
                                  {deltaNet >= 0 ? "+" : ""}{INR(deltaNet)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Apply error */}
          {applyError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
              <p className="font-medium mb-1">Failed to apply revision</p>
              {applyError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Close
          </Button>
          {canApply && (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? "Applying…" : "Apply Revision"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
