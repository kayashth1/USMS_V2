import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, GraduationCap, Users, Info } from "lucide-react";

import { PromotionType, BatchStatus } from "@/promotion";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

function StatChip({ icon: Icon, label, value, colorClass = "text-indigo-600 bg-indigo-50" }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${colorClass}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}

export default function PromotionConfigStep({
  config, onChange,
  classes, academicYears, classStudents, allBatches,
  loadingProfiles,
}) {
  const set = (patch) => onChange({ ...config, ...patch });

  // ── Derived ───────────────────────────────────────────────────────────────
  const maxGrade = useMemo(
    () => Math.max(...classes.map((c) => Number(c.grade)), 0),
    [classes]
  );

  const fromClass = useMemo(
    () => classes.find((c) => c.docId === config.fromClassId),
    [classes, config.fromClassId]
  );

  const isHighestGrade = fromClass ? Number(fromClass.grade) === maxGrade : false;

  // ── Auto-detect graduation ────────────────────────────────────────────────
  useEffect(() => {
    if (!config.fromClassId) return;
    if (isHighestGrade) {
      onChange({
        ...config,
        promotionType: PromotionType.GRADUATION,
        toClassId: "",
      });
    } else {
      onChange({
        ...config,
        promotionType: PromotionType.CLASS_PROMOTION,
      });
    }
    // Only run when fromClassId or isHighestGrade changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.fromClassId, isHighestGrade]);

  // ── Destination class options: higher grades only ─────────────────────────
  const destClasses = useMemo(() => {
    if (!fromClass) return classes.filter((c) => c.docId !== config.fromClassId);
    return classes.filter((c) => Number(c.grade) > Number(fromClass.grade));
  }, [classes, fromClass, config.fromClassId]);

  // ── Existing batch check ──────────────────────────────────────────────────
  const existingBatch = useMemo(() => {
    if (!config.fromClassId || !config.fromAcademicYear) return null;
    return (
      allBatches.find(
        (b) =>
          b.fromClassId === config.fromClassId &&
          b.fromAcademicYear === config.fromAcademicYear &&
          b.status !== BatchStatus.CANCELLED
      ) ?? null
    );
  }, [allBatches, config.fromClassId, config.fromAcademicYear]);

  const isGraduation = config.promotionType === PromotionType.GRADUATION;

  // ── Active students count ─────────────────────────────────────────────────
  const eligibleCount = classStudents.filter((s) => s.isActive !== false).length;

  const classLabel = (c) => `Grade ${c.grade} – ${c.section}`;

  return (
    <div className="space-y-5 pb-2">
      {/* ── Source class row ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-1.5 block text-sm font-medium">Source Class</Label>
          <Select
            value={config.fromClassId ?? ""}
            onValueChange={(v) => set({ fromClassId: v, toClassId: "" })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select class…" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.docId} value={c.docId}>
                  {classLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Student counts */}
        {config.fromClassId && (
          <div className="flex flex-col justify-end gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatChip
                icon={Users}
                label="total"
                value={classStudents.length}
                colorClass="text-gray-600 bg-gray-100"
              />
              <StatChip
                icon={Users}
                label="eligible"
                value={eligibleCount}
                colorClass="text-indigo-600 bg-indigo-50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Graduation auto-detected banner ── */}
      {isHighestGrade && config.fromClassId && (
        <Alert className="border-purple-200 bg-purple-50 text-purple-800">
          <GraduationCap className="h-4 w-4 shrink-0" />
          <AlertDescription className="ml-2">
            <strong>Graduation detected.</strong> Students in Grade {fromClass?.grade}{" "}
            (the highest grade) will graduate. No destination class or new fee profile
            will be created.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Promotion Type — manually overridable ── */}
      <div>
        <Label className="mb-1.5 block text-sm font-medium">Promotion Type</Label>
        <div className="flex gap-6">
          {[
            { value: PromotionType.CLASS_PROMOTION, label: "Class Promotion" },
            { value: PromotionType.GRADUATION,      label: "Graduation" },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="promotionType"
                value={value}
                checked={config.promotionType === value}
                onChange={() => set({ promotionType: value, toClassId: "" })}
                className="accent-indigo-600"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Academic Year row ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-1.5 block text-sm font-medium">From Academic Year</Label>
          <Select
            value={config.fromAcademicYear ?? ""}
            onValueChange={(v) => set({ fromAcademicYear: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year…" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((ay) => (
                <SelectItem key={ay.id} value={ay.year}>
                  <span>{ay.year}</span>
                  {ay.status === "active" && (
                    <Badge className="ml-2 bg-green-100 text-green-700 text-xs">Active</Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loadingProfiles && (
            <p className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
              <Spinner size="sm" /> Loading fee profiles…
            </p>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block text-sm font-medium">To Academic Year</Label>
          <Select
            value={config.toAcademicYear ?? ""}
            onValueChange={(v) => set({ toAcademicYear: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year…" />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const opts = academicYears.filter((ay) => ay.year !== config.fromAcademicYear);
                if (opts.length === 0) {
                  return <SelectItem value="__none" disabled>No other years available</SelectItem>;
                }
                return opts.map((ay) => (
                  <SelectItem key={ay.id} value={ay.year}>
                    <span>{ay.year}</span>
                    {ay.status === "active" && (
                      <Badge className="ml-2 bg-green-100 text-green-700 text-xs">Active</Badge>
                    )}
                  </SelectItem>
                ));
              })()}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Destination class (hidden for graduation) ── */}
      {!isGraduation && (
        <div>
          <Label className="mb-1.5 block text-sm font-medium">Destination Class</Label>
          <Select
            value={config.toClassId ?? ""}
            onValueChange={(v) => set({ toClassId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select destination class…" />
            </SelectTrigger>
            <SelectContent>
              {destClasses.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No higher classes available
                </SelectItem>
              ) : (
                destClasses.map((c) => (
                  <SelectItem key={c.docId} value={c.docId}>
                    {classLabel(c)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {destClasses.length === 0 && config.fromClassId && (
            <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              No higher-grade classes configured. Add classes in Settings first.
            </p>
          )}
        </div>
      )}

      {/* ── Existing batch warning ── */}
      {existingBatch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription className="ml-2">
            A promotion batch already exists for this class and academic year (status:{" "}
            <strong>{existingBatch.status}</strong>). Creating another batch is blocked
            until the existing batch is cancelled.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Carry flags ── */}
      <div className="flex gap-8 pt-1">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <Switch
            checked={config.carryFeeBalance ?? false}
            onCheckedChange={(v) => set({ carryFeeBalance: v })}
          />
          <div>
            <p className="text-sm font-medium">Carry Fee Balance</p>
            <p className="text-xs text-gray-400">Carry unpaid balance into next year</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <Switch
            checked={config.carryVariableFees ?? false}
            onCheckedChange={(v) => set({ carryVariableFees: v })}
          />
          <div>
            <p className="text-sm font-medium">Carry Variable Fees</p>
            <p className="text-xs text-gray-400">Retain selected variable fee structures</p>
          </div>
        </label>
      </div>

      {/* ── Remarks ── */}
      <div>
        <Label className="mb-1.5 block text-sm font-medium">Remarks (optional)</Label>
        <Textarea
          value={config.remarks ?? ""}
          onChange={(e) => set({ remarks: e.target.value })}
          placeholder="Internal notes for this batch…"
          rows={2}
        />
      </div>
    </div>
  );
}
