import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertTriangle, CheckCircle2, XCircle, GraduationCap,
  Info, ChevronRight,
} from "lucide-react";

import {
  buildPromotionPlan,
  buildGraduationPlan,
  PromotionType,
  PromotionResult,
  PromotionEngineWarningCodes,
  computeStudentBalances,
} from "@/promotion";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INR = (n) =>
  n == null || n === 0
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN")}`;

function classLabel(classes, classId) {
  if (!classId) return "—";
  const c = classes.find((x) => x.docId === classId);
  return c ? `Grade ${c.grade} – ${c.section}` : classId;
}

const RESULT_CONFIG = {
  [PromotionResult.PROMOTED]:  { label: "Promoted",  icon: CheckCircle2, cls: "text-green-600  bg-green-50" },
  [PromotionResult.GRADUATED]: { label: "Graduated", icon: GraduationCap, cls: "text-purple-600 bg-purple-50" },
  null:                         { label: "Failed",   icon: XCircle,       cls: "text-red-600   bg-red-50" },
};

const WARNING_LABELS = {
  [PromotionEngineWarningCodes.VARIABLE_FEE_DROPPED_NOT_IN_DEST]:
    "Variable fee not available in destination class",
  [PromotionEngineWarningCodes.VARIABLE_FEE_DROPPED_INACTIVE]:
    "Variable fee inactive — not carried",
  [PromotionEngineWarningCodes.ADJUSTMENT_NOT_CARRIED_NON_RECURRING]:
    "Adjustment not carried (non-recurring)",
  [PromotionEngineWarningCodes.BALANCE_NOT_CARRIED_DISABLED]:
    "Fee balance not carried (carry disabled)",
};

function ResultBadge({ result }) {
  const cfg = RESULT_CONFIG[result] ?? RESULT_CONFIG[null];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function WarningCard({ warning }) {
  const label = WARNING_LABELS[warning.code] ?? warning.code;
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-amber-800">{label}</p>
        {warning.message && (
          <p className="text-amber-700 mt-0.5 opacity-80">{warning.message}</p>
        )}
      </div>
    </div>
  );
}

// ─── Fee Structure Preview panel ─────────────────────────────────────────────

function FeeStructurePreview({ destFeeStructures, loadingStructures, isGraduation }) {
  if (isGraduation) return null;

  const fixed    = destFeeStructures.filter((s) => s.type === "fixed");
  const variable = destFeeStructures.filter((s) => s.type === "variable");

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h4 className="text-sm font-semibold text-gray-700">Destination Fee Structures</h4>
      </div>
      <div className="p-4">
        {loadingStructures ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Spinner size="sm" /> Loading fee structures…
          </div>
        ) : destFeeStructures.length === 0 ? (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <XCircle className="h-4 w-4" />
            No active fee structures for the destination class. All promotions will FAIL.
          </div>
        ) : (
          <div className="space-y-3">
            {fixed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Fixed ({fixed.length})
                </p>
                <div className="space-y-1">
                  {fixed.map((s) => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{s.label}</span>
                      <span className="font-medium tabular-nums">
                        {INR(s.amount)}
                        {s.isOneTime && (
                          <span className="ml-1 text-xs text-gray-400">one-time</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {variable.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Variable ({variable.length})
                </p>
                <div className="space-y-1">
                  {variable.map((s) => (
                    <div key={s.id} className="flex justify-between text-sm text-gray-500">
                      <span>{s.label}</span>
                      <span className="tabular-nums">{INR(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Lookup helper: try deterministic profile doc ID key first, then fall back
// to the p.studentId key. Mirrors the same helper in PromotionStudentStep.
function getProfile(map, studentId, fromAcademicYearDocId) {
  if (fromAcademicYearDocId) {
    const v = map[`${studentId}_${fromAcademicYearDocId}`];
    if (v !== undefined) return v;
  }
  return map[studentId];
}

export default function PromotionPreviewStep({
  config,
  selectedStudents,
  feeProfilesMap,
  installmentsMap,
  fromAcademicYearDocId = "",
  destFeeStructures,
  classes,
  academicYears,
  loadingStructures,
}) {
  const isGraduation = config.promotionType === PromotionType.GRADUATION;

  // ── Find destination academic year for engine ─────────────────────────────
  const destAcademicYear = useMemo(
    () => academicYears.find((ay) => ay.year === config.toAcademicYear) ?? null,
    [academicYears, config.toAcademicYear]
  );

  // ── Build estimated batch shape for engine ────────────────────────────────
  const estimatedBatch = useMemo(
    () => ({
      promotionType:     config.promotionType,
      fromAcademicYear:  config.fromAcademicYear,
      toAcademicYear:    config.toAcademicYear,
      fromClassId:       config.fromClassId,
      toClassId:         config.toClassId || null,
      carryFeeBalance:   config.carryFeeBalance,
      carryVariableFees: config.carryVariableFees,
    }),
    [config]
  );

  // ── Live balance per student (source of truth for display) ───────────────
  const computedBalances = useMemo(() => {
    const map = {};
    selectedStudents.forEach((s) => {
      const p = getProfile(feeProfilesMap, s.id, fromAcademicYearDocId);
      const insts = getProfile(installmentsMap, s.id, fromAcademicYearDocId) ?? [];
      map[s.id] = computeStudentBalances(p ?? null, insts);
    });
    return map;
  }, [selectedStudents, feeProfilesMap, installmentsMap, fromAcademicYearDocId]);

  // ── Run engine for each selected student ──────────────────────────────────
  const enginePlans = useMemo(() => {
    if (loadingStructures) return {};
    const plans = {};
    selectedStudents.forEach((student) => {
      const oldFeeProfile = getProfile(feeProfilesMap, student.id, fromAcademicYearDocId) ?? null;
      // Compute live balances from actual installments — same formula used in
      // handleCreate — so preview and execution always match.
      const { outstanding, credit } = computedBalances[student.id] ?? { outstanding: 0, credit: 0 };
      const estimatedSP = {
        studentId:            student.id,
        promotionType:        config.promotionType,
        fromClassId:          config.fromClassId,
        toClassId:            config.toClassId || null,
        fromAcademicYear:     config.fromAcademicYear,
        toAcademicYear:       config.toAcademicYear,
        openingOutstanding:   outstanding,
        openingCredit:        credit,
        carriedVariableFeeIds: config.carryVariableFees
          ? (oldFeeProfile?.variableFeeIds ?? [])
          : [],
      };
      try {
        if (isGraduation) {
          plans[student.id] = buildGraduationPlan(estimatedBatch, estimatedSP);
        } else {
          plans[student.id] = buildPromotionPlan(
            estimatedBatch,
            estimatedSP,
            student,
            oldFeeProfile,
            destFeeStructures,
            destAcademicYear
          );
        }
      } catch {
        plans[student.id] = {
          studentId:        student.id,
          promotionResult:  null,
          errors:           [{ code: "ENGINE_ERROR", message: "Engine threw an unexpected error" }],
          warnings:         [],
          newFeeProfile:    null,
          openingOutstanding: 0,
          openingCredit:    0,
          variableFeeIds:   [],
        };
      }
    });
    return plans;
  }, [
    selectedStudents, feeProfilesMap, installmentsMap, fromAcademicYearDocId,
    estimatedBatch, destFeeStructures, destAcademicYear,
    isGraduation, config, loadingStructures, computedBalances,
  ]);

  // ── Aggregate summary ─────────────────────────────────────────────────────
  const planValues = Object.values(enginePlans);
  const promotedCount  = planValues.filter((p) => p.promotionResult === PromotionResult.PROMOTED).length;
  const graduatedCount = planValues.filter((p) => p.promotionResult === PromotionResult.GRADUATED).length;
  const failedCount    = planValues.filter((p) => p.errors?.length > 0).length;
  const skippedCount   = selectedStudents.length === 0
    ? 0
    : 0; // No students skipped in Phase 1 — all selected students are processed

  // ── Aggregate warnings across all plans ──────────────────────────────────
  const allWarnings = useMemo(() => {
    const warnings = [];
    Object.entries(enginePlans).forEach(([studentId, plan]) => {
      (plan.warnings ?? []).forEach((w) => {
        warnings.push({ ...w, studentId });
      });
    });
    return warnings;
  }, [enginePlans]);

  // ── Deduplicate warning codes for the banner ──────────────────────────────
  const uniqueWarningCodes = useMemo(
    () => [...new Set(allWarnings.map((w) => w.code))],
    [allWarnings]
  );

  // ── Config summary row ────────────────────────────────────────────────────
  const configRows = [
    ["Promotion Type",    isGraduation ? "Graduation" : "Class Promotion"],
    ["From Academic Year", config.fromAcademicYear || "—"],
    ["To Academic Year",   config.toAcademicYear   || "—"],
    ["Source Class",       classLabel(classes, config.fromClassId)],
    ...(!isGraduation ? [["Destination Class", classLabel(classes, config.toClassId)]] : []),
    ["Students Selected",  selectedStudents.length],
    ["Carry Fee Balance",  config.carryFeeBalance   ? "Yes" : "No"],
    ["Carry Variable Fees", config.carryVariableFees ? "Yes" : "No"],
  ];

  return (
    <div className="space-y-4 pb-2">
      {/* ── Batch config summary ── */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700">Batch Configuration</h4>
        </div>
        <div className="px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            {configRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ── Engine outcome summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-green-50 text-green-700 px-4 py-3 text-center">
          <p className="text-2xl font-bold">{isGraduation ? graduatedCount : promotedCount}</p>
          <p className="text-xs font-medium mt-0.5">
            {isGraduation ? "Will Graduate" : "Will be Promoted"}
          </p>
        </div>
        <div className={`rounded-lg px-4 py-3 text-center ${failedCount > 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-400"}`}>
          <p className="text-2xl font-bold">{failedCount}</p>
          <p className="text-xs font-medium mt-0.5">Will Fail</p>
        </div>
        <div className={`rounded-lg px-4 py-3 text-center ${uniqueWarningCodes.length > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-400"}`}>
          <p className="text-2xl font-bold">{allWarnings.length}</p>
          <p className="text-xs font-medium mt-0.5">Warnings</p>
        </div>
      </div>

      {/* ── Per-student table ── */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700">
            Students ({selectedStudents.length})
          </h4>
        </div>
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          {loadingStructures ? (
            <div className="py-8 flex justify-center items-center gap-2 text-gray-400 text-sm">
              <Spinner size="sm" /> Computing promotion plans…
            </div>
          ) : selectedStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No students selected.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Student</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Outstanding</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Credit</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Var. Fees</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Expected Result</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedStudents.map((s) => {
                  const plan     = enginePlans[s.id];
                  const profile  = feeProfilesMap[s.id];
                  const hasFailed = plan?.errors?.length > 0;
                  const warnCount = plan?.warnings?.length ?? 0;
                  return (
                    <tr key={s.id} className={hasFailed ? "bg-red-50/40" : "hover:bg-gray-50"}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800">{s.fullName ?? "—"}</p>
                        <p className="text-xs text-gray-400 font-mono">{s.admissionNumber ?? "—"}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-sm">
                        {(computedBalances[s.id]?.outstanding ?? 0) > 0
                          ? <span className="text-red-600 font-medium">{INR(computedBalances[s.id].outstanding)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-sm">
                        {(computedBalances[s.id]?.credit ?? 0) > 0
                          ? <span className="text-green-600 font-medium">{INR(computedBalances[s.id].credit)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">
                        {(plan?.variableFeeIds?.length ?? 0) > 0
                          ? <span className="text-purple-700 font-medium">{plan.variableFeeIds.length}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {hasFailed ? (
                          <div>
                            <ResultBadge result={null} />
                            {plan.errors.map((e, i) => (
                              <p key={i} className="text-xs text-red-600 mt-0.5">{e.message ?? e.code}</p>
                            ))}
                          </div>
                        ) : (
                          <ResultBadge result={plan?.promotionResult} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {warnCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {warnCount}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Aggregated warnings ── */}
      {allWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200">
          <div className="px-4 py-3 border-b bg-amber-50">
            <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Warnings ({allWarnings.length})
            </h4>
          </div>
          <div className="p-3 space-y-2 max-h-36 overflow-y-auto">
            {allWarnings.map((w, i) => {
              const student = selectedStudents.find((s) => s.id === w.studentId);
              return (
                <WarningCard
                  key={i}
                  warning={{
                    ...w,
                    message: student
                      ? `${student.fullName ?? w.studentId}: ${w.message ?? ""}`
                      : w.message,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Destination fee structure preview ── */}
      <FeeStructurePreview
        destFeeStructures={destFeeStructures}
        loadingStructures={loadingStructures}
        isGraduation={isGraduation}
      />

      {/* ── Final confirmation text ── */}
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 shrink-0 text-blue-600" />
        <AlertDescription className="ml-2 text-blue-800 space-y-1">
          <p className="font-semibold">This action only PREPARES the promotion batch.</p>
          <ul className="text-sm space-y-0.5 mt-1 list-none">
            {[
              "Students will NOT be moved.",
              "Fee Profiles will NOT become active.",
              "The Academic Year will NOT change.",
            ].map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-xs text-blue-700 mt-1.5">
            These changes happen later during Academic Year Rollover.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
