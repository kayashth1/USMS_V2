import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle, XCircle, AlertTriangle, RefreshCcw, Play,
  CalendarDays, Users, FileText, GraduationCap,
} from "lucide-react";

import {
  getActiveAcademicYear,
  getAcademicYearsBySchool,
} from "@/fees-v2";
import { getBatches, getPromotionsByBatch, BatchStatus } from "@/promotion";
import { buildRolloverPlan, executeRollover } from "@/rollover";
import { getClassesBySchool } from "@/services/class.service";
import { getStudentsBySchool } from "@/services/student.service";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classLabel(classMap, classId) {
  if (!classId) return "—";
  const c = classMap[classId];
  return c ? `Grade ${c.grade} – ${c.section}` : classId;
}

// ─── Checklist Item ───────────────────────────────────────────────────────────

function ChecklistItem({ label, ok, note, loading }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className="mt-0.5 shrink-0">
        {loading
          ? <Spinner size="sm" />
          : ok
            ? <CheckCircle className="h-5 w-5 text-green-500" />
            : <XCircle className="h-5 w-5 text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {note && (
          <p className={`text-xs mt-0.5 ${ok ? "text-gray-400" : "text-red-500"}`}>
            {note}
          </p>
        )}
      </div>
      <Badge className={ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}>
        {ok ? "Ready" : "Not ready"}
      </Badge>
    </div>
  );
}

// ─── Summary Stat Card ────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, colorClass = "bg-indigo-50 text-indigo-600", loading }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`p-2.5 rounded-lg shrink-0 ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          {loading
            ? <div className="h-7 w-10 bg-gray-100 rounded animate-pulse" />
            : <p className="text-2xl font-bold text-gray-800 leading-tight">{value ?? "—"}</p>}
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Preview Summary ──────────────────────────────────────────────────────────

function PreviewSummaryRow({ plan }) {
  const { summary } = plan;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-4 border-b">
      {[
        { label: "Students Updated",   value: summary.promoted,          color: "text-blue-700 bg-blue-50" },
        { label: "Draft Profiles Ready", value: summary.profilesActivated, color: "text-amber-700 bg-amber-50" },
        { label: "Profiles Closed",    value: summary.profilesClosed,    color: "text-gray-600 bg-gray-100" },
        { label: "Graduates",          value: summary.graduated,         color: "text-purple-700 bg-purple-50" },
        { label: "Skipped",            value: summary.skipped,           color: "text-amber-700 bg-amber-50" },
      ].map(({ label, value, color }) => (
        <div key={label} className={`rounded-lg px-3 py-2.5 text-center ${color}`}>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs font-medium opacity-80">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Student Updates Table ────────────────────────────────────────────────────

function StudentUpdatesTable({ updates, studentMap, classMap, spByStudentId }) {
  if (updates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No class promotions in this rollover.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Student</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Old Class</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">New Class</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Academic Year</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {updates.map((su) => {
            const student   = studentMap[su.studentId];
            const oldClassId = spByStudentId[su.studentId]?.fromClassId;
            return (
              <tr key={su.studentId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-800">{student?.fullName ?? student?.name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-400 font-mono">{su.studentId}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {classLabel(classMap, oldClassId)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-indigo-700 font-medium">
                    {classLabel(classMap, su.currentClassId)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{su.currentAcademicYear}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Fee Profiles Table ───────────────────────────────────────────────────────

function FeeProfilesTable({ plan, studentMap }) {
  const { studentUpdates, profileActivations, profileClosures } = plan;

  // Build per-student profile maps
  const activationByStudent = useMemo(() => {
    const m = {};
    profileActivations.forEach((a) => { m[a.studentId] = a; });
    return m;
  }, [profileActivations]);

  const closureByStudent = useMemo(() => {
    const m = {};
    profileClosures.forEach((c) => { m[c.studentId] = c; });
    return m;
  }, [profileClosures]);

  // Collect all affected student IDs (from both activations and closures)
  const affectedIds = useMemo(() => {
    const ids = new Set([
      ...profileActivations.map((a) => a.studentId),
      ...profileClosures.map((c) => c.studentId),
    ]);
    return [...ids];
  }, [profileActivations, profileClosures]);

  if (affectedIds.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No fee profile changes in this rollover.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Student</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Old Profile</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">New Profile</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {affectedIds.map((studentId) => {
            const student    = studentMap[studentId];
            const activation = activationByStudent[studentId];
            const closure    = closureByStudent[studentId];
            return (
              <tr key={studentId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-800">{student?.fullName ?? student?.name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-400 font-mono">{studentId}</p>
                </td>
                <td className="px-4 py-2.5">
                  {closure
                    ? <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5 font-mono">
                        {closure.profileId}
                      </code>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  {activation
                    ? <code className="text-xs bg-green-50 text-green-800 rounded px-1.5 py-0.5 font-mono">
                        {activation.profileId}
                      </code>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    {closure && (
                      <Badge className="bg-gray-100 text-gray-500">ACTIVE → CLOSED</Badge>
                    )}
                    {activation && (
                      <Badge className="bg-green-100 text-green-700">DRAFT → ACTIVE</Badge>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Graduation Table ─────────────────────────────────────────────────────────

function GraduationTable({ updates, studentMap, classMap }) {
  if (updates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No graduations in this rollover.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Student</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Graduating Class</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Academic Year</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">New Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {updates.map((gu) => {
            const student = studentMap[gu.studentId];
            return (
              <tr key={gu.studentId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-800">{student?.fullName ?? student?.name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-400 font-mono">{gu.studentId}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {classLabel(classMap, gu.graduatedClassId)}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{gu.graduatedAcademicYear}</td>
                <td className="px-4 py-2.5">
                  <Badge className="bg-purple-100 text-purple-700">Alumni</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AcademicYearRollover() {
  const schoolId    = localStorage.getItem("principalSchoolId");
  const { toast }   = useToast();
  const confirm     = useConfirm();

  // ── Phase 1 state ─────────────────────────────────────────────────────────
  const [currentYear,   setCurrentYear]   = useState(null);
  const [allYears,      setAllYears]      = useState([]);
  const [allBatches,    setAllBatches]    = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [studentMap,    setStudentMap]    = useState({});
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(null);

  // ── Phase 2 state (preview) ──────────────────────────────────────────────
  const [rolloverPlans,  setRolloverPlans]  = useState([]);
  const [promotionsMap,  setPromotionsMap]  = useState({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError,   setPreviewError]   = useState(null);

  // ── Phase 1: Load base data ──────────────────────────────────────────────
  const loadBase = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [currentYr, years, batches, cls, students] = await Promise.all([
        getActiveAcademicYear(schoolId),
        getAcademicYearsBySchool(schoolId),
        getBatches(schoolId),
        getClassesBySchool(schoolId),
        getStudentsBySchool(schoolId),
      ]);
      setCurrentYear(currentYr);
      setAllYears(years);
      setAllBatches(batches);
      setClasses(cls);
      const sMap = {};
      students.forEach((s) => { sMap[s.id] = s; });
      setStudentMap(sMap);
    } catch (e) {
      setLoadError(e.message ?? "Failed to load rollover data.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { loadBase(); }, [loadBase]);

  // ── Derived from base data ────────────────────────────────────────────────
  const relevantBatches = useMemo(() => {
    if (!currentYear) return [];
    return allBatches.filter((b) => b.fromAcademicYear === currentYear.year);
  }, [allBatches, currentYear]);

  const toAcademicYearStr = useMemo(() => {
    const first = relevantBatches.find((b) => b.toAcademicYear);
    return first?.toAcademicYear ?? null;
  }, [relevantBatches]);

  const nextYear = useMemo(() => {
    if (!toAcademicYearStr) return null;
    return allYears.find((y) => y.year === toAcademicYearStr) ?? null;
  }, [allYears, toAcademicYearStr]);

  const readyBatches = useMemo(
    () => relevantBatches.filter(
      (b) => b.status === BatchStatus.COMPLETED || b.status === BatchStatus.PARTIAL_SUCCESS
    ),
    [relevantBatches]
  );

  const classMap = useMemo(() => {
    const m = {};
    classes.forEach((c) => { m[c.docId] = c; });
    return m;
  }, [classes]);

  // ── Phase 2: Load promotions + build plans ───────────────────────────────
  const loadPreview = useCallback(async () => {
    if (readyBatches.length === 0 || !currentYear || !nextYear) {
      setRolloverPlans([]);
      setPromotionsMap({});
      return;
    }
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const batchData = await Promise.all(
        readyBatches.map((b) =>
          getPromotionsByBatch(b.batchId).then((proms) => ({ batch: b, promotions: proms }))
        )
      );
      const plans = batchData.map(({ batch, promotions }) =>
        buildRolloverPlan(currentYear, nextYear, batch, promotions)
      );
      setRolloverPlans(plans);
      const pMap = {};
      batchData.forEach(({ batch, promotions }) => { pMap[batch.batchId] = promotions; });
      setPromotionsMap(pMap);
    } catch (e) {
      setPreviewError(e.message ?? "Failed to generate rollover preview.");
    } finally {
      setLoadingPreview(false);
    }
  }, [readyBatches, currentYear, nextYear]);

  useEffect(() => {
    if (!loading) loadPreview();
  }, [loading, loadPreview]);

  // ── Aggregated plan ──────────────────────────────────────────────────────
  const aggregatedPlan = useMemo(() => {
    if (rolloverPlans.length === 0) return null;
    return {
      yearTransition:      rolloverPlans[0].yearTransition,
      studentUpdates:      rolloverPlans.flatMap((p) => p.studentUpdates),
      profileActivations:  rolloverPlans.flatMap((p) => p.profileActivations),
      profileClosures:     rolloverPlans.flatMap((p) => p.profileClosures),
      graduationUpdates:   rolloverPlans.flatMap((p) => p.graduationUpdates),
      skippedPromotionIds: rolloverPlans.flatMap((p) => p.skippedPromotionIds),
      summary: {
        totalPromotions:   rolloverPlans.reduce((s, p) => s + p.summary.totalPromotions, 0),
        promoted:          rolloverPlans.reduce((s, p) => s + p.summary.promoted, 0),
        graduated:         rolloverPlans.reduce((s, p) => s + p.summary.graduated, 0),
        skipped:           rolloverPlans.reduce((s, p) => s + p.summary.skipped, 0),
        profilesActivated: rolloverPlans.reduce((s, p) => s + p.summary.profilesActivated, 0),
        profilesClosed:    rolloverPlans.reduce((s, p) => s + p.summary.profilesClosed, 0),
      },
    };
  }, [rolloverPlans]);

  // StudentPromotion lookup by studentId (for Old Class display in updates table)
  const spByStudentId = useMemo(() => {
    const m = {};
    Object.values(promotionsMap).flat().forEach((sp) => { m[sp.studentId] = sp; });
    return m;
  }, [promotionsMap]);

  // ── Checklist ────────────────────────────────────────────────────────────
  const checklistItems = useMemo(() => {
    const batchesCompleted =
      relevantBatches.length > 0 &&
      relevantBatches.every((b) =>
        [BatchStatus.COMPLETED, BatchStatus.PARTIAL_SUCCESS].includes(b.status)
      );
    const noPending = relevantBatches.every(
      (b) => b.status !== BatchStatus.RUNNING && b.status !== BatchStatus.DRAFT
    );
    const hasDraftProfiles = (aggregatedPlan?.summary.profilesActivated ?? 0) > 0;
    const hasNextYear      = nextYear !== null;
    const hasCurrentYear   = currentYear !== null;

    return [
      {
        label: "Promotion batches completed",
        ok:    batchesCompleted,
        note:  batchesCompleted
          ? `${readyBatches.length} batch${readyBatches.length !== 1 ? "es" : ""} ready`
          : relevantBatches.length === 0
            ? "No promotion batches found for the current academic year"
            : `${relevantBatches.length - readyBatches.length} batch${relevantBatches.length - readyBatches.length !== 1 ? "es" : ""} not yet completed`,
      },
      {
        label: "No pending promotions",
        ok:    noPending && relevantBatches.length > 0,
        note:  noPending && relevantBatches.length > 0
          ? "All batches in a terminal state"
          : relevantBatches.length === 0
            ? "No batches found"
            : "Some batches are still in Draft or Running state",
      },
      {
        label: "Draft fee profiles ready",
        ok:    hasDraftProfiles,
        note:  hasDraftProfiles
          ? `${aggregatedPlan.summary.profilesActivated} profile${aggregatedPlan.summary.profilesActivated !== 1 ? "s" : ""} ready (generate installments in Fee Management V2 after rollover)`
          : "No draft fee profiles found — execute promotion batches first",
      },
      {
        label: "Next academic year exists",
        ok:    hasNextYear,
        note:  hasNextYear
          ? nextYear.year
          : toAcademicYearStr
            ? `"${toAcademicYearStr}" not found — create it in Fee Management V2`
            : "Unable to determine destination year",
      },
      {
        label: "Current academic year is active",
        ok:    hasCurrentYear,
        note:  hasCurrentYear
          ? currentYear.year
          : "No active academic year — activate one in Fee Management V2",
      },
    ];
  }, [
    relevantBatches, readyBatches,
    aggregatedPlan, nextYear, currentYear, toAcademicYearStr,
  ]);

  const allChecksPassed = checklistItems.every((c) => c.ok);

  // ── Execution state ──────────────────────────────────────────────────────
  const [executing,    setExecuting]    = useState(false);
  const [execProgress, setExecProgress] = useState(null);
  const [execResult,   setExecResult]   = useState(null);
  const [execError,    setExecError]    = useState(null);
  const [showSuccess,  setShowSuccess]  = useState(false);

  // ── Execute handler ──────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (!aggregatedPlan || !currentYear || !nextYear) return;

    const ok = await confirm({
      title:        "Execute Academic Year Rollover",
      description:  `${aggregatedPlan.summary.promoted} students will be promoted, ${aggregatedPlan.summary.graduated} will graduate. ${currentYear.year} will close and ${nextYear.year} will become active. This cannot be undone.`,
      confirmLabel: "Execute Rollover",
      danger:       true,
    });
    if (!ok) return;

    const principalId = localStorage.getItem("principalId") ?? "unknown";

    setExecuting(true);
    setExecError(null);
    setExecProgress({ completed: 0, failed: 0, total: aggregatedPlan.summary.promoted + aggregatedPlan.summary.graduated, remaining: aggregatedPlan.summary.promoted + aggregatedPlan.summary.graduated, currentStudentId: null });

    try {
      const result = await executeRollover(
        aggregatedPlan,
        nextYear,
        principalId,
        {
          onProgress: (p) => setExecProgress({ ...p }),
        }
      );
      setExecResult(result);
      setShowSuccess(true);
      if (result.failed > 0) {
        toast.error(`Rollover completed with ${result.failed} failure${result.failed !== 1 ? "s" : ""}`);
      } else {
        toast.success(`Academic year rolled over — ${nextYear.year} is now active`);
      }
      // Reload base data so the page reflects the new active year
      await loadBase();
    } catch (e) {
      setExecError(e.message ?? "Rollover execution failed. Please try again.");
    } finally {
      setExecuting(false);
      setExecProgress(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <PageLoader label="Loading rollover data…" />;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Academic Year Rollover</h1>
        <p className="text-gray-500 text-sm mt-1">
          Finalize promotion and officially start the next academic year.
        </p>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Current Academic Year"
          value={currentYear?.year}
          colorClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={CalendarDays}
          label="Next Academic Year"
          value={nextYear?.year ?? toAcademicYearStr ?? "—"}
          colorClass={nextYear ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}
        />
        <StatCard
          icon={FileText}
          label="Promotion Batches Ready"
          value={readyBatches.length}
          colorClass="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          icon={Users}
          label="Students To Promote"
          value={aggregatedPlan?.summary.promoted}
          colorClass="bg-indigo-50 text-indigo-600"
          loading={loadingPreview}
        />
        <StatCard
          icon={GraduationCap}
          label="Students To Graduate"
          value={aggregatedPlan?.summary.graduated}
          colorClass="bg-purple-50 text-purple-600"
          loading={loadingPreview}
        />
        <StatCard
          icon={FileText}
          label="Draft Fee Profiles (need installments)"
          value={aggregatedPlan?.summary.profilesActivated}
          colorClass="bg-amber-50 text-amber-600"
          loading={loadingPreview}
        />
        <StatCard
          icon={FileText}
          label="Active Fee Profiles to Close"
          value={aggregatedPlan?.summary.profilesClosed}
          colorClass="bg-gray-50 text-gray-500"
          loading={loadingPreview}
        />
        <StatCard
          icon={Users}
          label="Skipped Promotions"
          value={aggregatedPlan?.summary.skipped}
          colorClass="bg-amber-50 text-amber-600"
          loading={loadingPreview}
        />
      </div>

      {/* Two-column layout: Checklist + Rollover Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Checklist */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pre-Rollover Checklist</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {checklistItems.map((item) => (
              <ChecklistItem
                key={item.label}
                label={item.label}
                ok={item.ok}
                note={item.note}
                loading={loadingPreview && item.label.includes("fee profiles")}
              />
            ))}
          </CardContent>
        </Card>

        {/* Rollover Preview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Rollover Preview</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={loadPreview}
                disabled={loadingPreview || readyBatches.length === 0}
              >
                {loadingPreview
                  ? <Spinner size="sm" />
                  : <RefreshCcw className="h-4 w-4" />}
                Refresh Preview
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
                <Spinner size="lg" />
                <p className="text-sm">Building rollover preview…</p>
              </div>
            ) : previewError ? (
              <Alert variant="destructive">
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            ) : !aggregatedPlan ? (
              <div className="py-12 text-center text-sm text-gray-400">
                <RefreshCcw className="mx-auto mb-3 h-8 w-8 opacity-30" />
                <p>No completed promotion batches found.</p>
                <p className="mt-1 text-xs">
                  Complete and execute promotion batches to generate a rollover preview.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <PreviewSummaryRow plan={aggregatedPlan} />

                <Tabs defaultValue="students">
                  <TabsList>
                    <TabsTrigger value="students">
                      Student Updates ({aggregatedPlan.summary.promoted})
                    </TabsTrigger>
                    <TabsTrigger value="profiles">
                      Fee Profiles ({aggregatedPlan.summary.profilesActivated})
                    </TabsTrigger>
                    <TabsTrigger value="graduation">
                      Graduation ({aggregatedPlan.summary.graduated})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="students" className="mt-3">
                    <div className="rounded-md border">
                      <StudentUpdatesTable
                        updates={aggregatedPlan.studentUpdates}
                        studentMap={studentMap}
                        classMap={classMap}
                        spByStudentId={spByStudentId}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="profiles" className="mt-3">
                    <div className="rounded-md border">
                      <FeeProfilesTable
                        plan={aggregatedPlan}
                        studentMap={studentMap}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="graduation" className="mt-3">
                    <div className="rounded-md border">
                      <GraduationTable
                        updates={aggregatedPlan.graduationUpdates}
                        studentMap={studentMap}
                        classMap={classMap}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Warning Banner */}
      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <AlertDescription className="ml-2 text-amber-800 space-y-1">
          <p className="font-semibold">
            This action officially starts the new academic year.
          </p>
          <ul className="text-sm space-y-0.5 list-disc list-inside">
            <li>Students will move into their promoted classes.</li>
            <li>Graduated students will become Alumni.</li>
            <li>Old fee profiles will be closed. New draft profiles stay in Draft — go to Fee Management V2 to generate installments.</li>
            <li className="font-medium">This action cannot be undone.</li>
          </ul>
        </AlertDescription>
      </Alert>

      {execError && (
        <Alert variant="destructive">
          <AlertDescription>{execError}</AlertDescription>
        </Alert>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <p className="text-xs text-gray-400">
          {executing
            ? "Rollover in progress — do not close this page."
            : allChecksPassed
              ? "All checks passed. Ready to execute rollover."
              : "Complete all checklist items before executing."}
        </p>
        <Button
          size="lg"
          className="gap-2"
          disabled={!allChecksPassed || executing || loadingPreview || !aggregatedPlan}
          onClick={handleExecute}
        >
          {executing
            ? <><Spinner size="sm" className="text-white" /> Executing…</>
            : <><Play className="h-4 w-4" /> Execute Academic Year Rollover</>}
        </Button>
      </div>

      {/* Progress Dialog */}
      <Dialog open={executing} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Executing Rollover…</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {execProgress && (
              <>
                <div className="space-y-2">
                  <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="bg-indigo-500 transition-all duration-300"
                      style={{ width: execProgress.total > 0 ? `${Math.round((execProgress.completed / execProgress.total) * 100)}%` : "0%" }}
                    />
                    {execProgress.failed > 0 && (
                      <div
                        className="bg-red-400 transition-all duration-300"
                        style={{ width: execProgress.total > 0 ? `${Math.round((execProgress.failed / execProgress.total) * 100)}%` : "0%" }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{execProgress.completed + execProgress.failed} / {execProgress.total} processed</span>
                    <span>{execProgress.total > 0 ? Math.round(((execProgress.completed + execProgress.failed) / execProgress.total) * 100) : 0}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-green-700">{execProgress.completed}</p>
                    <p className="text-xs text-green-600">Completed</p>
                  </div>
                  <div className="bg-red-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-red-600">{execProgress.failed}</p>
                    <p className="text-xs text-red-500">Failed</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-gray-600">{execProgress.remaining}</p>
                    <p className="text-xs text-gray-400">Remaining</p>
                  </div>
                </div>

                {execProgress.currentStudentId && (
                  <p className="text-xs text-gray-500 text-center">
                    Processing: <span className="font-medium text-indigo-700">
                      {studentMap[execProgress.currentStudentId]?.fullName ?? studentMap[execProgress.currentStudentId]?.name ?? execProgress.currentStudentId}
                    </span>
                  </p>
                )}
              </>
            )}
            <p className="text-xs text-gray-400 text-center">
              Do not close this page during execution.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              Rollover Complete
            </DialogTitle>
          </DialogHeader>
          {execResult && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                Academic Year Rollover completed successfully.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "Students Updated",    value: execResult.studentsUpdated,   color: "bg-blue-50 text-blue-700" },
                  { label: "Draft Profiles (generate installments in Fee V2)", value: execResult.profilesActivated, color: "bg-amber-50 text-amber-700" },
                  { label: "Profiles Closed",     value: execResult.profilesClosed,    color: "bg-gray-50 text-gray-600" },
                  { label: "Graduates",           value: execResult.graduates,         color: "bg-purple-50 text-purple-700" },
                  { label: "Failed",              value: execResult.failed,            color: execResult.failed > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-400" },
                  { label: "Skipped",             value: execResult.skipped,           color: "bg-amber-50 text-amber-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-lg px-3 py-2 ${color}`}>
                    <p className="text-lg font-bold">{value}</p>
                    <p className="text-xs font-medium opacity-80">{label}</p>
                  </div>
                ))}
              </div>
              {execResult.failures?.length > 0 && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">
                    {execResult.failures.length} student{execResult.failures.length > 1 ? "s" : ""} failed.
                    Review the details and retry manually if needed.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowSuccess(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
