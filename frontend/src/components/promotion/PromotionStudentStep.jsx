import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { computeStudentBalances } from "@/promotion";

const INR = (n) =>
  n === 0 || n == null
    ? <span className="text-gray-300">—</span>
    : <span className={n > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
        ₹{Number(n).toLocaleString("en-IN")}
      </span>;

const INRPlain = (n) =>
  n === 0 || n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

const PROFILE_STATUS_STYLES = {
  active: "bg-green-100 text-green-700",
  draft:  "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

function SummaryCard({ label, value, sub, colorClass = "bg-indigo-50 text-indigo-700" }) {
  return (
    <Card className="border-0 shadow-none">
      <CardContent className={`py-3 px-4 rounded-lg ${colorClass}`}>
        <p className="text-lg font-bold leading-tight">{value}</p>
        <p className="text-xs font-medium opacity-80">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// Lookup helper: try deterministic profile doc ID key first, then fall back
// to the p.studentId key. Handles the case where p.studentId stored in
// Firestore differs from the current s.id across promotion sessions.
function getProfile(map, studentId, fromAcademicYearDocId) {
  if (fromAcademicYearDocId) {
    const v = map[`${studentId}_${fromAcademicYearDocId}`];
    if (v !== undefined) return v;
  }
  return map[studentId];
}

export default function PromotionStudentStep({
  config,
  classStudents,
  feeProfilesMap,
  installmentsMap = {},
  fromAcademicYearDocId = "",
  loadingProfiles,
  selectedIds,
  onSelectionChange,
}) {
  const [search, setSearch] = useState("");

  // ── Pre-select all when class changes ─────────────────────────────────────
  useEffect(() => {
    if (classStudents.length > 0) {
      onSelectionChange(new Set(classStudents.map((s) => s.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classStudents.length, config.fromClassId]);

  // ── Live balance per student (installments are source of truth) ──────────
  const computedBalances = useMemo(() => {
    const map = {};
    classStudents.forEach((s) => {
      const p = getProfile(feeProfilesMap, s.id, fromAcademicYearDocId);
      const insts = getProfile(installmentsMap, s.id, fromAcademicYearDocId) ?? [];
      map[s.id] = computeStudentBalances(p ?? null, insts);
    });
    return map;
  }, [classStudents, feeProfilesMap, installmentsMap, fromAcademicYearDocId]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return classStudents;
    const q = search.toLowerCase();
    return classStudents.filter(
      (s) =>
        s.fullName?.toLowerCase().includes(q) ||
        s.admissionNumber?.toLowerCase().includes(q) ||
        s.rollNo?.toLowerCase().includes(q)
    );
  }, [classStudents, search]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    const ids = filtered.map((s) => s.id);
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      ids.forEach((id) => next.delete(id));
      onSelectionChange(next);
    } else {
      onSelectionChange(new Set([...selectedIds, ...ids]));
    }
  };

  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  // ── Quick action helpers ──────────────────────────────────────────────────
  const withOutstanding = classStudents
    .filter((s) => (computedBalances[s.id]?.outstanding ?? 0) > 0)
    .map((s) => s.id);

  const withoutOutstanding = classStudents
    .filter((s) => (computedBalances[s.id]?.outstanding ?? 0) === 0)
    .map((s) => s.id);

  const selectWith    = () => onSelectionChange(new Set(withOutstanding));
  const selectWithout = () => onSelectionChange(new Set(withoutOutstanding));
  const selectAll     = () => onSelectionChange(new Set(classStudents.map((s) => s.id)));
  const clearAll      = () => onSelectionChange(new Set());

  // ── Summary card computations ─────────────────────────────────────────────
  const selectedList = classStudents.filter((s) => selectedIds.has(s.id));

  const totalOutstanding = selectedList.reduce(
    (sum, s) => sum + (computedBalances[s.id]?.outstanding ?? 0),
    0
  );
  const totalCredit = selectedList.reduce(
    (sum, s) => sum + (computedBalances[s.id]?.credit ?? 0),
    0
  );
  const totalVariableFees = selectedList.reduce(
    (sum, s) =>
      sum + (getProfile(feeProfilesMap, s.id, fromAcademicYearDocId)?.variableFeeIds?.length ?? 0),
    0
  );

  // ── Empty / loading guards ────────────────────────────────────────────────
  if (!config.fromClassId) {
    return (
      <p className="py-12 text-center text-sm text-gray-400">
        Select a source class in Step 1 first.
      </p>
    );
  }

  if (classStudents.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-400">
        No active students found in this class.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard
          label="Selected"
          value={selectedIds.size}
          sub={`of ${classStudents.length}`}
          colorClass="bg-indigo-50 text-indigo-700"
        />
        <SummaryCard
          label="Outstanding"
          value={totalOutstanding === 0 ? "—" : `₹${totalOutstanding.toLocaleString("en-IN")}`}
          colorClass={totalOutstanding > 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500"}
        />
        <SummaryCard
          label="Credit"
          value={totalCredit === 0 ? "—" : `₹${totalCredit.toLocaleString("en-IN")}`}
          colorClass={totalCredit > 0 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}
        />
        <SummaryCard
          label="Variable Fees"
          value={totalVariableFees}
          colorClass="bg-purple-50 text-purple-700"
        />
      </div>

      {/* ── Search + quick actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          className="flex-1 min-w-40"
          placeholder="Search by name or admission ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={selectAll}>
            Select All
          </Button>
          <Button size="sm" variant="outline" onClick={clearAll}>
            Clear
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={selectWith}
            disabled={withOutstanding.length === 0}
            title="Select students with unpaid balance"
          >
            With Outstanding ({withOutstanding.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={selectWithout}
            disabled={withoutOutstanding.length === 0}
            title="Select students with no outstanding balance"
          >
            No Outstanding ({withoutOutstanding.length})
          </Button>
        </div>
      </div>

      {/* ── Fee profiles loading indicator ── */}
      {loadingProfiles && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Spinner size="sm" /> Loading fee profile data…
        </p>
      )}

      {/* ── Student table ── */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b z-10">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all visible"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 min-w-36">Name</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">Admission No.</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-600">Outstanding</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-600">Credit</th>
              <th className="px-3 py-2.5 text-center font-medium text-gray-600">Var. Fees</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">Profile</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => {
              const profile  = getProfile(feeProfilesMap, s.id, fromAcademicYearDocId);
              const selected = selectedIds.has(s.id);
              return (
                <tr
                  key={s.id}
                  className={[
                    "cursor-pointer transition-colors",
                    selected ? "bg-indigo-50/50" : "hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => toggleOne(s.id)}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected} onCheckedChange={() => toggleOne(s.id)} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800">
                    {s.fullName ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                    {s.admissionNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {loadingProfiles
                      ? <Spinner size="sm" />
                      : INR(computedBalances[s.id]?.outstanding)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {loadingProfiles
                      ? <Spinner size="sm" />
                      : (computedBalances[s.id]?.credit ?? 0) > 0
                        ? <span className="text-green-600 font-medium">
                            ₹{Number(computedBalances[s.id].credit).toLocaleString("en-IN")}
                          </span>
                        : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {loadingProfiles
                      ? <Spinner size="sm" />
                      : <span className={
                          (profile?.variableFeeIds?.length ?? 0) > 0
                            ? "text-purple-700 font-medium"
                            : "text-gray-300"
                        }>
                          {profile?.variableFeeIds?.length ?? "—"}
                        </span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {loadingProfiles
                      ? <Spinner size="sm" />
                      : profile
                        ? <Badge className={PROFILE_STATUS_STYLES[profile.status] ?? "bg-gray-100 text-gray-500"}>
                            {profile.status}
                          </Badge>
                        : <span className="text-gray-300 text-xs">None</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={selected ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"}>
                      {selected ? "Selected" : "Skip"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && search && (
          <p className="text-center text-sm text-gray-400 py-8">
            No students match your search.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">
        Outstanding and Credit shown are opening balances carried in from the previous year.
      </p>
    </div>
  );
}
