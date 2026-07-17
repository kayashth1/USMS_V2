import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Play, RefreshCw, Ban, GraduationCap,
} from "lucide-react";

import {
  getBatch, getPromotionsByBatch, cancelBatch,
  BatchStatus, PromotionStatus, PromotionType,
  executeBatch, retryFailed, computeStudentBalances,
} from "@/promotion";
import { waiverInstallmentsForBatch, getProfile, getInstallments } from "@/fees-v2";
import { getClassesBySchool } from "@/services/class.service";
import { getStudentsBySchool } from "@/services/student.service";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_STATUS_STYLES = {
  [BatchStatus.DRAFT]:           "bg-gray-100 text-gray-600",
  [BatchStatus.RUNNING]:         "bg-blue-100 text-blue-700",
  [BatchStatus.COMPLETED]:       "bg-green-100 text-green-700",
  [BatchStatus.PARTIAL_SUCCESS]: "bg-yellow-100 text-yellow-700",
  [BatchStatus.FAILED]:          "bg-red-100 text-red-700",
  [BatchStatus.CANCELLED]:       "bg-gray-100 text-gray-400",
};

const BATCH_STATUS_LABELS = {
  [BatchStatus.DRAFT]:           "Draft",
  [BatchStatus.RUNNING]:         "Running",
  [BatchStatus.COMPLETED]:       "Completed",
  [BatchStatus.PARTIAL_SUCCESS]: "Partial Success",
  [BatchStatus.FAILED]:          "Failed",
  [BatchStatus.CANCELLED]:       "Cancelled",
};

const PROMO_STATUS_STYLES = {
  [PromotionStatus.DRAFT]:     "bg-gray-100 text-gray-500",
  [PromotionStatus.PENDING]:   "bg-blue-100 text-blue-600",
  [PromotionStatus.COMPLETED]: "bg-green-100 text-green-700",
  [PromotionStatus.FAILED]:    "bg-red-100 text-red-700",
  [PromotionStatus.SKIPPED]:   "bg-yellow-100 text-yellow-700",
  [PromotionStatus.CANCELLED]: "bg-gray-100 text-gray-400",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classLabel(classes, classId) {
  if (!classId) return "—";
  const c = classes.find((x) => x.docId === classId);
  return c ? `Grade ${c.grade} – ${c.section}` : classId;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate?.() ?? new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ completed, failed, total }) {
  if (total === 0) return null;
  const completedPct = Math.round((completed / total) * 100);
  const failedPct    = Math.round((failed    / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100">
        <div
          className="bg-green-500 transition-all duration-300"
          style={{ width: `${completedPct}%` }}
        />
        <div
          className="bg-red-400 transition-all duration-300"
          style={{ width: `${failedPct}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          {completed} completed
        </span>
        {failed > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            {failed} failed
          </span>
        )}
        <span className="ml-auto">{completedPct}%</span>
      </div>
    </div>
  );
}

// ─── Expandable Student Row ───────────────────────────────────────────────────

function StudentRow({ sp, studentName, onRetryOne }) {
  const [expanded, setExpanded] = useState(false);

  const warnings = sp.warnings ?? sp.promotionPlan?.warnings ?? [];
  const errors   = sp.promotionPlan?.errors ?? [];

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 w-6">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-gray-400" />
            : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </td>
        <td className="px-4 py-3 font-medium text-gray-800">
          {studentName ?? <span className="text-gray-400 italic">Unknown</span>}
          <div className="text-xs text-gray-400 font-normal font-mono">
            {sp.studentId}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge className={PROMO_STATUS_STYLES[sp.status] ?? "bg-gray-100 text-gray-500"}>
            {sp.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-gray-600">
          {sp.promotionResult ?? <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3">
          {warnings.length > 0
            ? <span className="text-amber-600 text-xs font-medium">
                {warnings.length} warning{warnings.length > 1 ? "s" : ""}
              </span>
            : <span className="text-gray-300 text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {sp.completedAt ? formatDate(sp.completedAt) : "—"}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {sp.status === PromotionStatus.FAILED && onRetryOne && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onRetryOne(sp.promotionId)}
            >
              Retry
            </Button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b bg-gray-50/60">
          <td />
          <td colSpan={6} className="px-4 py-4">
            <ExpandedDetail sp={sp} warnings={warnings} errors={errors} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ sp, warnings, errors }) {
  const plan = sp.promotionPlan;

  return (
    <div className="space-y-3 text-sm">
      {/* Error */}
      {sp.errorMessage && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{sp.errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 mb-1">Warnings</p>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{w.message ?? w.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Engine errors (from plan) */}
      {errors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-700 mb-1">Engine Errors</p>
          <ul className="space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>[{e.code}] {e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* New fee profile */}
      {sp.newFeeProfileId && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Created Fee Profile</p>
          <code className="text-xs bg-white border rounded px-2 py-1 block font-mono">
            {sp.newFeeProfileId}
          </code>
        </div>
      )}

      {/* Plan summary */}
      {plan && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Promotion Plan Summary</p>
          <div className="bg-white border rounded p-2 space-y-1 text-xs text-gray-600">
            {plan.newFeeProfile && (
              <>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-32 shrink-0">Academic Year</span>
                  <span>{plan.newFeeProfile.academicYear ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-32 shrink-0">Gross Annual Fee</span>
                  <span>
                    {plan.newFeeProfile.grossAnnualFee != null
                      ? `₹${Number(plan.newFeeProfile.grossAnnualFee).toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-32 shrink-0">Opening Balance</span>
                  <span>
                    {plan.newFeeProfile.openingOutstanding != null
                      ? `₹${Number(plan.newFeeProfile.openingOutstanding).toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-32 shrink-0">Opening Credit</span>
                  <span>
                    {plan.newFeeProfile.openingCredit != null
                      ? `₹${Number(plan.newFeeProfile.openingCredit).toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </div>
              </>
            )}
            {plan.promotionResult && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">Result</span>
                <span className="capitalize">{plan.promotionResult}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No details yet */}
      {!plan && !sp.errorMessage && warnings.length === 0 && (
        <p className="text-xs text-gray-400 italic">No execution details yet.</p>
      )}
    </div>
  );
}

// ─── Batch Summary Card ───────────────────────────────────────────────────────

function BatchSummaryCard({ batch, classes }) {
  if (!batch) return null;

  const isGraduation = batch.promotionType === PromotionType.GRADUATION;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Batch Summary</CardTitle>
          <Badge className={BATCH_STATUS_STYLES[batch.status] ?? "bg-gray-100 text-gray-500"}>
            {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <div>
            <p className="text-xs text-gray-400">Type</p>
            <p className="font-medium">{isGraduation ? "Graduation" : "Class Promotion"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">From Year</p>
            <p className="font-medium">{batch.fromAcademicYear ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">To Year</p>
            <p className="font-medium">{batch.toAcademicYear ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Source Class</p>
            <p className="font-medium">{classLabel(classes, batch.fromClassId)}</p>
          </div>
          {!isGraduation && (
            <div>
              <p className="text-xs text-gray-400">Destination Class</p>
              <p className="font-medium">{classLabel(classes, batch.toClassId)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Carry Balance</p>
            <p className="font-medium">{batch.carryFeeBalance ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Carry Variable Fees</p>
            <p className="font-medium">{batch.carryVariableFees ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Created</p>
            <p className="font-medium text-xs">{formatDate(batch.requestedAt)}</p>
          </div>
        </div>

        {batch.remarks && (
          <p className="text-xs text-gray-500 pt-1 border-t">{batch.remarks}</p>
        )}

        {/* Student progress stats */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t">
          {[
            { label: "Total",     value: batch.totalStudents     ?? 0, color: "text-gray-700" },
            { label: "Completed", value: batch.completedStudents ?? 0, color: "text-green-700" },
            { label: "Failed",    value: batch.failedStudents    ?? 0, color: "text-red-600" },
            { label: "Skipped",   value: batch.skippedStudents   ?? 0, color: "text-yellow-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>

        <ProgressBar
          completed={batch.completedStudents ?? 0}
          failed={batch.failedStudents ?? 0}
          total={batch.totalStudents ?? 0}
        />
      </CardContent>
    </Card>
  );
}

// ─── Graduation Outstanding Dialog ───────────────────────────────────────────

const INR_DIAG = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

function GraduationOutstandingDialog({ totalOutstanding, loading, onChoice, onRefresh }) {
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");

  const canConfirm = Boolean(choice) && !loading;
  const needsReason = choice === "waive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Students have unpaid dues</p>
              <p className="text-sm text-amber-700 mt-0.5">
                {loading
                  ? "Checking live balance…"
                  : <>Total Outstanding: <strong>{INR_DIAG(totalOutstanding)}</strong></>
                }
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-amber-700 hover:bg-amber-100 shrink-0"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading
              ? <Spinner size="sm" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            Refresh
          </Button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600">Choose how to proceed with graduation:</p>

          {[
            {
              id:    "collect_first",
              label: "Collect payment first",
              desc:  "Cancel graduation. Collect dues before proceeding.",
            },
            {
              id:    "waive",
              label: "Waive outstanding dues",
              desc:  "Mark all unpaid installments as waived, then graduate.",
            },
            {
              id:    "graduate_anyway",
              label: "Graduate anyway (Admin only)",
              desc:  "Outstanding remains visible in Alumni records.",
            },
          ].map(({ id, label, desc }) => (
            <label
              key={id}
              className={[
                "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                loading
                  ? "opacity-50 pointer-events-none cursor-default"
                  : "cursor-pointer",
                choice === id
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:bg-gray-50",
              ].join(" ")}
            >
              <input
                type="radio"
                name="grad_choice"
                value={id}
                checked={choice === id}
                onChange={() => setChoice(id)}
                disabled={loading}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}

          {needsReason && (
            <div className="pt-1">
              <label className="text-xs font-medium text-gray-600">
                Waiver reason (optional)
              </label>
              <textarea
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                rows={2}
                placeholder="e.g. Graduated — fees waived by Principal"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <Button variant="outline" size="sm" onClick={() => onChoice(null, "")}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            className={choice === "graduate_anyway" ? "bg-amber-600 hover:bg-amber-700" : ""}
            onClick={() => onChoice(choice, reason)}
          >
            {choice === "collect_first"    && "Cancel Graduation"}
            {choice === "waive"            && "Waive & Graduate"}
            {choice === "graduate_anyway"  && "Graduate Anyway"}
            {!choice                       && "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PromotionBatchDetails() {
  const { batchId }   = useParams();
  const navigate      = useNavigate();
  const principalId   = localStorage.getItem("principalId") ?? "unknown";
  const schoolId      = localStorage.getItem("principalSchoolId");
  const { toast }     = useToast();
  const confirm       = useConfirm();

  const [batch,       setBatch]       = useState(null);
  const [promotions,  setPromotions]  = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [studentMap,  setStudentMap]  = useState({});
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(null);

  const [executing,        setExecuting]        = useState(false);
  const [execError,        setExecError]        = useState(null);
  const [progress,         setProgress]         = useState(null);
  const [cancelling,       setCancelling]       = useState(false);
  const [graduationDialog, setGraduationDialog] = useState(null); // null | { loading: boolean, totalOutstanding: number }

  // ── Load page data ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [b, proms, cls, students] = await Promise.all([
        getBatch(batchId),
        getPromotionsByBatch(batchId),
        getClassesBySchool(schoolId),
        getStudentsBySchool(schoolId),
      ]);
      setBatch(b);
      setPromotions(proms);
      setClasses(cls);
      const sMap = {};
      students.forEach((s) => { sMap[s.id] = s; });
      setStudentMap(sMap);
    } catch (e) {
      setLoadError(e.message ?? "Failed to load batch details.");
    } finally {
      setLoading(false);
    }
  }, [batchId, schoolId]);

  useEffect(() => {
    if (batchId && schoolId) load();
  }, [batchId, schoolId, load]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingPromotions = useMemo(
    () => promotions.filter(
      (sp) => sp.status === PromotionStatus.DRAFT || sp.status === PromotionStatus.PENDING
    ),
    [promotions]
  );

  const pendingCount = pendingPromotions.length;

  const failedCount = useMemo(
    () => promotions.filter((sp) => sp.status === PromotionStatus.FAILED).length,
    [promotions]
  );

  const canExecute = pendingCount > 0 && !executing;

  const canRetry = failedCount > 0 && !executing;

  const canCancel =
    batch?.status === BatchStatus.DRAFT &&
    (batch?.completedStudents ?? 0) === 0 &&
    (batch?.failedStudents ?? 0) === 0 &&
    (batch?.skippedStudents ?? 0) === 0 &&
    !executing;

  // ── Core execute (runs after all pre-flight checks pass) ─────────────────
  const doExecute = async () => {
    setExecuting(true);
    setExecError(null);
    setProgress({ completed: 0, failed: 0, skipped: 0, total: pendingCount, current: null });

    try {
      const result = await executeBatch(batchId, principalId, {
        onProgress: (p) => setProgress({ ...p }),
      });
      await load();
      if (result.failed > 0) {
        toast.error(`${result.completed} promoted, ${result.failed} failed`);
      } else {
        toast.success(`${result.completed} student${result.completed !== 1 ? "s" : ""} promoted successfully`);
      }
    } catch (e) {
      setExecError(e.message ?? "Execution failed. Please try again.");
    } finally {
      setExecuting(false);
      setProgress(null);
    }
  };

  // ── Graduation dialog confirm handler ────────────────────────────────────
  const handleGraduationChoice = async (choice, waiverReason) => {
    setGraduationDialog(null);
    if (!choice || choice === "collect_first") return; // user cancelled or chose to collect first

    if (choice === "waive") {
      setExecuting(true);
      setExecError(null);
      try {
        await waiverInstallmentsForBatch(pendingPromotions, principalId, waiverReason || null);
        toast.success("Outstanding installments waived");
      } catch (e) {
        setExecError(e.message ?? "Waiver failed.");
        setExecuting(false);
        return;
      }
      setExecuting(false);
    }

    // "waive" (after waiver) or "graduate_anyway"
    await doExecute();
  };

  // ── Live outstanding check for graduation batches ─────────────────────────
  // Always loads fresh fee data — never trusts sp.openingOutstanding snapshot.
  const checkLiveOutstanding = async () => {
    setGraduationDialog((prev) => ({ totalOutstanding: prev?.totalOutstanding ?? 0, loading: true }));
    try {
      let total = 0;
      await Promise.all(
        pendingPromotions.map(async (sp) => {
          if (!sp.oldFeeProfileId) return;
          try {
            const [profile, insts] = await Promise.all([
              getProfile(sp.oldFeeProfileId),
              getInstallments(sp.oldFeeProfileId),
            ]);
            const { outstanding } = computeStudentBalances(profile ?? null, insts ?? []);
            total += outstanding;
          } catch { /* treat as 0 — do not block graduation on a read error */ }
        })
      );
      if (total === 0) {
        setGraduationDialog(null);
        await doExecute();
      } else {
        setGraduationDialog({ loading: false, totalOutstanding: total });
      }
    } catch {
      setGraduationDialog(null);
      setExecError("Failed to load live outstanding. Please try again.");
    }
  };

  // ── Execute batch ─────────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (batch?.promotionType === PromotionType.GRADUATION) {
      await checkLiveOutstanding();
      return;
    }
    await doExecute();
  };

  // ── Retry all failed ──────────────────────────────────────────────────────
  const handleRetryAll = async () => {
    setExecuting(true);
    setExecError(null);
    setProgress({ completed: 0, failed: 0, skipped: 0, total: failedCount, current: null });

    try {
      const result = await retryFailed(batchId, [], principalId, {
        onProgress: (p) => setProgress({ ...p }),
      });
      await load();
      if (result.failed > 0) {
        toast.error(`${result.completed} succeeded, ${result.failed} still failed`);
      } else {
        toast.success(`${result.completed} record${result.completed !== 1 ? "s" : ""} retried successfully`);
      }
    } catch (e) {
      setExecError(e.message ?? "Retry failed. Please try again.");
    } finally {
      setExecuting(false);
      setProgress(null);
    }
  };

  // ── Retry single ──────────────────────────────────────────────────────────
  const handleRetryOne = async (promotionId) => {
    setExecuting(true);
    setExecError(null);
    setProgress({ completed: 0, failed: 0, skipped: 0, total: 1, current: null });

    try {
      await retryFailed(batchId, [promotionId], principalId, {
        onProgress: (p) => setProgress({ ...p }),
      });
      await load();
      toast.success("Record retried successfully");
    } catch (e) {
      setExecError(e.message ?? "Retry failed. Please try again.");
    } finally {
      setExecuting(false);
      setProgress(null);
    }
  };

  // ── Cancel batch ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    const ok = await confirm({
      title:        "Cancel Batch",
      description:  "This batch will be cancelled and cannot be undone.",
      confirmLabel: "Cancel Batch",
      danger:       true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelBatch(batchId, principalId, "Cancelled by admin");
      toast.success("Batch cancelled");
      await load();
    } catch (e) {
      setExecError(e.message ?? "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <PageLoader label="Loading batch…" />;

  if (loadError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/promotion")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/promotion")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-gray-400 text-sm">Batch not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Graduation outstanding confirmation dialog */}
      {graduationDialog && (
        <GraduationOutstandingDialog
          totalOutstanding={graduationDialog.totalOutstanding}
          loading={graduationDialog.loading}
          onChoice={handleGraduationChoice}
          onRefresh={checkLiveOutstanding}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/promotion")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Batch Details</h1>
            <p className="text-xs text-gray-400 font-mono">{batchId}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-gray-600"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? <Spinner size="sm" /> : <Ban className="h-4 w-4" />}
              Cancel Batch
            </Button>
          )}
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handleRetryAll}
              disabled={executing}
            >
              {executing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
              Retry Failed ({failedCount})
            </Button>
          )}
          {canExecute && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleExecute}
              disabled={executing}
            >
              {executing ? <Spinner size="sm" /> : <Play className="h-4 w-4" />}
              Execute Batch ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {execError && (
        <Alert variant="destructive">
          <AlertDescription>{execError}</AlertDescription>
        </Alert>
      )}

      {/* Live progress during execution */}
      {executing && progress && (
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
              <Spinner size="sm" className="text-indigo-600" />
              Executing promotions…
            </div>
            <ProgressBar
              completed={progress.completed}
              failed={progress.failed}
              total={progress.total}
            />
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>{progress.completed + progress.failed} / {progress.total} processed</span>
              {progress.current && (
                <span className="text-indigo-600">
                  Processing: {studentMap[progress.current.studentId]?.fullName ?? studentMap[progress.current.studentId]?.name ?? progress.current.studentId}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Summary */}
      <BatchSummaryCard batch={batch} classes={classes} />

      {/* Student Promotions Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Student Promotions
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({promotions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {promotions.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              No student promotion records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-t">
                  <tr>
                    <th className="w-8" />
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Result</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Warnings</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Completed At</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((sp) => (
                    <StudentRow
                      key={sp.promotionId}
                      sp={sp}
                      studentName={studentMap[sp.studentId]?.fullName ?? studentMap[sp.studentId]?.name ?? null}
                      onRetryOne={canRetry ? handleRetryOne : null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completion notice */}
      {[BatchStatus.COMPLETED, BatchStatus.PARTIAL_SUCCESS].includes(batch.status) && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 ml-2">
            {batch.status === BatchStatus.COMPLETED
              ? `All ${batch.totalStudents} students promoted successfully. These changes will take effect during the next Academic Year Rollover.`
              : `Batch finished with ${batch.completedStudents} completed and ${batch.failedStudents} failed. Review failed records and retry or proceed to rollover.`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
