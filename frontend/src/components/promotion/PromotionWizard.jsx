import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

import { getClassesBySchool } from "@/services/class.service";
import { getStudentsBySchool } from "@/services/student.service";
import {
  getAcademicYearsBySchool,
  getProfilesBySchoolAndYear,
  getFixedFeeStructuresForClass,
  getVariableFeeStructuresOrdered,
  getInstallments,
} from "@/fees-v2";
import {
  createBatch, createPromotion, getBatches,
  PromotionType, BatchStatus, computeStudentBalances,
} from "@/promotion";

import PromotionConfigStep  from "./PromotionConfigStep";
import PromotionStudentStep from "./PromotionStudentStep";
import PromotionPreviewStep from "./PromotionPreviewStep";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = ["Configuration", "Student Selection", "Preview & Create"];

const DEFAULT_CONFIG = {
  promotionType:     PromotionType.CLASS_PROMOTION,
  fromAcademicYear:  "",
  toAcademicYear:    "",
  fromClassId:       "",
  toClassId:         "",
  carryFeeBalance:   false,
  carryVariableFees: false,
  remarks:           "",
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  return (
    <div className="flex items-start gap-0 mb-6">
      {STEPS.map((label, i) => {
        const idx    = i + 1;
        const done   = idx < current;
        const active = idx === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center min-w-0">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 shrink-0",
                  done   ? "bg-indigo-600 border-indigo-600 text-white"        : "",
                  active ? "bg-white border-indigo-600 text-indigo-600"        : "",
                  !done && !active ? "bg-white border-gray-200 text-gray-400" : "",
                ].join(" ")}
              >
                {done ? "✓" : idx}
              </div>
              <span
                className={[
                  "mt-1 text-xs text-center",
                  active ? "text-indigo-700 font-medium" : "text-gray-400",
                ].join(" ")}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "flex-1 h-0.5 mx-2 -mt-2.5",
                  done ? "bg-indigo-600" : "bg-gray-200",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function PromotionWizard({ open, onOpenChange, onSuccess }) {
  const schoolId    = localStorage.getItem("principalSchoolId");
  const principalId = localStorage.getItem("principalId") ?? "unknown";

  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState(1);
  const [config,      setConfig]      = useState(DEFAULT_CONFIG);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);

  // ── Shared reference data (loaded once on open) ───────────────────────────
  const [classes,      setClasses]      = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [allStudents,  setAllStudents]  = useState([]);
  const [allBatches,   setAllBatches]   = useState([]);
  const [baseLoading,  setBaseLoading]  = useState(false);

  // ── Fee profiles + installments for the source academic year ─────────────
  const [feeProfilesMap,   setFeeProfilesMap]   = useState({});
  const [installmentsMap,  setInstallmentsMap]  = useState({}); // { [studentId]: FeeInstallment[] }
  const [loadingProfiles,  setLoadingProfiles]  = useState(false);

  // ── Destination fee structures ────────────────────────────────────────────
  const [destFeeStructures,   setDestFeeStructures]   = useState([]);
  const [loadingStructures,   setLoadingStructures]   = useState(false);

  // ── Load base data when dialog opens ─────────────────────────────────────
  useEffect(() => {
    if (!open || !schoolId) return;
    setBaseLoading(true);
    Promise.all([
      getClassesBySchool(schoolId),
      getAcademicYearsBySchool(schoolId),
      getStudentsBySchool(schoolId),
      getBatches(schoolId),
    ])
      .then(([cls, ays, stu, batches]) => {
        setClasses([...cls].sort((a, b) => {
          const g = Number(a.grade) - Number(b.grade);
          return g !== 0 ? g : a.section.localeCompare(b.section);
        }));
        setAcademicYears(ays);
        setAllStudents(stu);
        setAllBatches(batches);
      })
      .finally(() => setBaseLoading(false));
  }, [open, schoolId]);

  // ── Reload fee profiles + installments when fromAcademicYear changes ─────
  useEffect(() => {
    if (!config.fromAcademicYear || !schoolId) {
      setFeeProfilesMap({});
      setInstallmentsMap({});
      return;
    }
    setLoadingProfiles(true);
    getProfilesBySchoolAndYear(schoolId, config.fromAcademicYear)
      .then(async (profiles) => {
        const pMap = {};
        profiles.forEach((p) => {
          // Key by both p.studentId (legacy) and p.id (deterministic profile doc ID
          // "studentId_academicYearId") so the lookup succeeds even when p.studentId
          // stored in Firestore diverges from the current s.id returned by
          // getStudentsBySchool (can happen across promotion sessions).
          if (p.studentId) pMap[p.studentId] = p;
          pMap[p.id] = p;
        });
        setFeeProfilesMap(pMap);

        // Load installments for every profile in parallel so the preview
        // and handleCreate both have the live balances they need.
        const iMap = {};
        await Promise.all(
          profiles.map(async (p) => {
            try {
              const insts = await getInstallments(p.id);
              if (p.studentId) iMap[p.studentId] = insts;
              iMap[p.id] = insts;
            } catch {
              if (p.studentId) iMap[p.studentId] = [];
              iMap[p.id] = [];
            }
          })
        );
        setInstallmentsMap(iMap);
      })
      .catch(() => { setFeeProfilesMap({}); setInstallmentsMap({}); })
      .finally(() => setLoadingProfiles(false));
  }, [config.fromAcademicYear, schoolId]);

  // ── Reload dest fee structures when toClassId / promotionType changes ─────
  useEffect(() => {
    if (!config.toClassId || config.promotionType === PromotionType.GRADUATION || !schoolId) {
      setDestFeeStructures([]);
      return;
    }
    setLoadingStructures(true);
    Promise.all([
      getFixedFeeStructuresForClass(schoolId, config.toClassId),
      getVariableFeeStructuresOrdered(schoolId),
    ])
      .then(([fixed, variable]) => setDestFeeStructures([...fixed, ...variable]))
      .catch(() => setDestFeeStructures([]))
      .finally(() => setLoadingStructures(false));
  }, [config.toClassId, config.promotionType, schoolId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const classStudents = useMemo(
    () => allStudents.filter((s) => s.classId === config.fromClassId),
    [allStudents, config.fromClassId]
  );

  const selectedStudents = useMemo(
    () => classStudents.filter((s) => selectedIds.has(s.id)),
    [classStudents, selectedIds]
  );

  // Firestore doc ID of the source academic year — used to build deterministic
  // profile doc ID keys ("studentId_yearDocId") in step lookups so the map
  // resolves correctly even when p.studentId diverges from s.id.
  const fromAcademicYearDocId = useMemo(
    () => academicYears.find((ay) => ay.year === config.fromAcademicYear)?.id ?? "",
    [academicYears, config.fromAcademicYear]
  );

  // ── Reset when dialog closes ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep(1);
      setConfig(DEFAULT_CONFIG);
      setSelectedIds(new Set());
      setError(null);
      setSubmitting(false);
      setFeeProfilesMap({});
      setInstallmentsMap({});
      setDestFeeStructures([]);
    }
  }, [open]);

  // ── Validation per step ───────────────────────────────────────────────────
  const canProceed = useMemo(() => {
    if (step === 1) {
      const baseOk =
        config.fromAcademicYear?.trim() &&
        config.toAcademicYear?.trim() &&
        config.fromClassId;
      if (config.promotionType === PromotionType.CLASS_PROMOTION) {
        return Boolean(baseOk && config.toClassId && config.toClassId !== config.fromClassId);
      }
      return Boolean(baseOk);
    }
    if (step === 2) return selectedIds.size > 0;
    return true;
  }, [step, config, selectedIds]);

  // ── Create handler ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ids = [...selectedIds];

      const batchId = await createBatch({
        schoolId,
        fromAcademicYear:  config.fromAcademicYear,
        toAcademicYear:    config.toAcademicYear,
        fromClassId:       config.fromClassId,
        toClassId:         config.toClassId || null,
        promotionType:     config.promotionType,
        carryFeeBalance:   config.carryFeeBalance,
        carryVariableFees: config.carryVariableFees,
        requestedBy:       principalId,
        remarks:           config.remarks || null,
        totalStudents:     ids.length,
      });

      await Promise.all(
        ids.map((studentId) => {
          // Try deterministic profile doc ID first, then fall back to studentId key.
          const profileDocId = fromAcademicYearDocId ? `${studentId}_${fromAcademicYearDocId}` : null;
          const profile =
            (profileDocId !== null ? feeProfilesMap[profileDocId] : undefined) ??
            feeProfilesMap[studentId];
          const insts =
            (profileDocId !== null ? installmentsMap[profileDocId] : undefined) ??
            installmentsMap[studentId] ??
            [];
          // Compute live outstanding + credit from actual installment balances,
          // not from the stale profile.openingOutstanding field.
          const { outstanding, credit } = computeStudentBalances(
            profile ?? null,
            insts
          );
          return createPromotion({
            batchId,
            schoolId,
            studentId,
            fromAcademicYear:      config.fromAcademicYear,
            toAcademicYear:        config.toAcademicYear,
            fromClassId:           config.fromClassId,
            toClassId:             config.toClassId || null,
            promotionType:         config.promotionType,
            openingOutstanding:    outstanding,
            openingCredit:         credit,
            carriedVariableFeeIds: config.carryVariableFees
              ? (profile?.variableFeeIds ?? [])
              : [],
            oldFeeProfileId:       profile?.id ?? null,
            requestedBy:           principalId,
          });
        })
      );

      onSuccess();
    } catch (e) {
      setError(e.message ?? "Failed to create promotion batch. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        {/* Fixed header */}
        <div className="px-6 pt-6 pb-0 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg">New Promotion Batch</DialogTitle>
          </DialogHeader>
          <div className="mt-5">
            <StepIndicator current={step} />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {baseLoading ? (
            <div className="py-16 flex justify-center">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Spinner size="lg" />
                <p className="text-sm">Loading…</p>
              </div>
            </div>
          ) : (
            <>
              {step === 1 && (
                <PromotionConfigStep
                  config={config}
                  onChange={setConfig}
                  classes={classes}
                  academicYears={academicYears}
                  classStudents={classStudents}
                  allBatches={allBatches}
                  loadingProfiles={loadingProfiles}
                />
              )}

              {step === 2 && (
                <PromotionStudentStep
                  config={config}
                  classStudents={classStudents}
                  feeProfilesMap={feeProfilesMap}
                  installmentsMap={installmentsMap}
                  fromAcademicYearDocId={fromAcademicYearDocId}
                  loadingProfiles={loadingProfiles}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                />
              )}

              {step === 3 && (
                <PromotionPreviewStep
                  config={config}
                  selectedStudents={selectedStudents}
                  feeProfilesMap={feeProfilesMap}
                  installmentsMap={installmentsMap}
                  fromAcademicYearDocId={fromAcademicYearDocId}
                  destFeeStructures={destFeeStructures}
                  classes={classes}
                  academicYears={academicYears}
                  loadingStructures={loadingStructures}
                />
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Fixed footer */}
        <div className="px-6 py-4 border-t bg-white shrink-0">
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={submitting}
                >
                  Back
                </Button>
              )}
              {step < 3 && (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed || baseLoading}>
                  Next
                </Button>
              )}
              {step === 3 && (
                <Button
                  onClick={handleCreate}
                  disabled={submitting || selectedIds.size === 0}
                  className="min-w-32"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner size="sm" className="text-white" />
                      Creating…
                    </span>
                  ) : (
                    `Create Batch (${selectedIds.size})`
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
