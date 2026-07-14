import { useState, useMemo, useEffect } from "react";
import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, Download, FileSpreadsheet, Printer,
  ArrowUpCircle, GraduationCap, AlertCircle,
} from "lucide-react";
import { getPromotionReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState, downloadExcel, fmtDate,
} from "./ReportShared";
import SvgDonutChart from "./charts/SvgDonutChart";
import { cn } from "@/lib/utils";

const BATCH_STATUSES = [
  { value: "completed",       label: "Completed"       },
  { value: "partial_success", label: "Partial Success" },
  { value: "failed",          label: "Failed"          },
  { value: "running",         label: "Running"         },
  { value: "draft",           label: "Draft"           },
  { value: "cancelled",       label: "Cancelled"       },
];

const PROMOTION_TYPES = [
  { value: "class_promotion", label: "Class Promotion" },
  { value: "graduation",      label: "Graduation"      },
];

const STATUS_COLORS = {
  completed:       "bg-green-100 text-green-700",
  partial_success: "bg-amber-100 text-amber-700",
  failed:          "bg-red-100 text-red-700",
  running:         "bg-blue-100 text-blue-700",
  draft:           "bg-gray-100 text-gray-600",
  cancelled:       "bg-gray-100 text-gray-400",
};

const RESULT_COLORS = {
  promoted:    "bg-green-100 text-green-700",
  graduated:   "bg-purple-100 text-purple-700",
  repeated:    "bg-amber-100 text-amber-700",
  transferred: "bg-blue-100 text-blue-700",
  left_school: "bg-gray-100 text-gray-500",
  skipped:     "bg-gray-100 text-gray-400",
  failed:      "bg-red-100 text-red-600",
};

function doCSV(batches, academicYear) {
  const headers = [
    "Batch ID", "Academic Year", "From Class", "To Class", "Type",
    "Promoted", "Failed", "Skipped", "Total", "Status",
    "Requested By", "Completion Date",
    "Student ID", "Student Name", "Admission No", "Promotion Result", "Record Status",
  ];
  const rows = batches.flatMap(b =>
    (b.students.length > 0 ? b.students : [null]).map(s => [
      b.batchId.slice(-8), b.academicYear, b.fromClass, b.toClass,
      b.promotionType, b.promoted, b.failed, b.skipped, b.total,
      b.status, b.requestedBy, fmtDate(b.completedAt),
      s?.studentId ?? "", s?.studentName ?? "", s?.admissionId ?? "",
      s?.promotionResult ?? "", s?.status ?? "",
    ])
  );
  const lines = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url, download: `promotion-report-${academicYear ?? "all"}.csv`,
  }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(batches, academicYear) {
  const headers = [
    "Batch ID", "Year", "From Class", "To Class", "Type",
    "Promoted", "Failed", "Skipped", "Status", "Completion Date",
  ];
  const rows = batches.map(b => [
    b.batchId.slice(-8), b.academicYear, b.fromClass, b.toClass,
    b.promotionType, b.promoted, b.failed, b.skipped,
    b.status, fmtDate(b.completedAt),
  ]);
  downloadExcel(headers, rows, `promotion-report-${academicYear ?? "all"}`);
}

export default function PromotionReport({ schoolId, years, globalFilters }) {
  const [filters,  setFilters]  = useState({
    academicYear:  globalFilters?.academicYear ?? "",
    batchStatus:   "",
    promotionType: "",
  });
  const [batches,  setBatches]  = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [ran,      setRan]      = useState(false);

  useEffect(() => {
    if (globalFilters?.academicYear) {
      setFilters(f => ({ ...f, academicYear: globalFilters.academicYear }));
      setBatches([]);
      setRan(false);
    }
  }, [globalFilters?.academicYear]);

  const setFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setBatches([]);
    setRan(false);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setRan(false);
    setExpanded(new Set());
    const cacheKey = `promotion_${schoolId}_${filters.academicYear}_${filters.batchStatus}_${filters.promotionType}`;
    try {
      const data = await withCache(cacheKey, () =>
        getPromotionReport(schoolId, {
          academicYear:  filters.academicYear  || undefined,
          batchStatus:   filters.batchStatus   || undefined,
          promotionType: filters.promotionType || undefined,
        })
      );
      setBatches(data);
      setRan(true);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (batchId) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(batchId) ? next.delete(batchId) : next.add(batchId);
    return next;
  });

  const summary = useMemo(() => ({
    totalBatches:  batches.length,
    totalPromoted: batches.reduce((s, b) => s + b.promoted, 0),
    totalGraduated: batches.reduce((s, b) => s + (b.promotionType === "graduation" ? b.promoted : 0), 0),
    totalFailed:   batches.reduce((s, b) => s + b.failed, 0),
    totalSkipped:  batches.reduce((s, b) => s + b.skipped, 0),
  }), [batches]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year</label>
              <Select value={filters.academicYear || "_all"} onValueChange={v => setFilter("academicYear", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="All years" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All years</SelectItem>
                  {years.map(y => <SelectItem key={y.id} value={y.year}>{y.year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
              <Select value={filters.batchStatus || "_all"} onValueChange={v => setFilter("batchStatus", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  {BATCH_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
              <Select value={filters.promotionType || "_all"} onValueChange={v => setFilter("promotionType", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  {PROMOTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 sm:col-auto flex gap-2 items-end flex-wrap">
              <Button
                onClick={handleRun}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? "Loading…" : "Generate"}
              </Button>

              {batches.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => doCSV(batches, filters.academicYear)}>
                    <Download size={13} className="mr-1.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => doExcelExport(batches, filters.academicYear)}>
                    <FileSpreadsheet size={13} className="mr-1.5" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer size={13} className="mr-1.5" /> Print
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {error   && <ErrorState message={error} onRetry={handleRun} />}
      {loading && <ReportSkeleton cards={4} tableRows={5} tableCols={9} />}

      {!loading && ran && !error && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Batches",   value: summary.totalBatches,   icon: ArrowUpCircle, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Promoted",  value: summary.totalPromoted,   icon: ArrowUpCircle, color: "text-green-600",  bg: "bg-green-50"  },
              { label: "Graduated", value: summary.totalGraduated,  icon: GraduationCap, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "Failed",    value: summary.totalFailed,     icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-50"    },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${bg} ${color} shrink-0`}><Icon size={15} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Promotion statistics donut chart */}
          {(summary.totalPromoted + summary.totalFailed + summary.totalSkipped) > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-5">Promotion Statistics</h3>
                <SvgDonutChart
                  segments={[
                    { label: "Promoted",  value: summary.totalPromoted,  color: "#22c55e" },
                    { label: "Graduated", value: summary.totalGraduated,  color: "#a855f7" },
                    { label: "Failed",    value: summary.totalFailed,     color: "#ef4444" },
                    { label: "Skipped",   value: summary.totalSkipped,    color: "#9ca3af" },
                  ].filter(s => s.value > 0)}
                  size={130}
                />
              </CardContent>
            </Card>
          )}

          {/* Batch table */}
          {batches.length === 0 ? (
            <EmptyState icon={ArrowUpCircle} title="No promotion batches found" description="Try removing filters or selecting a different year." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-160">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="w-8 px-3 py-3" />
                      <th className="px-4 py-3 text-left font-medium">Batch</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Year</th>
                      <th className="px-4 py-3 text-left font-medium">From</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">To</th>
                      <th className="px-4 py-3 text-center font-medium">Promoted</th>
                      <th className="px-4 py-3 text-center font-medium">Failed</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map(batch => (
                      <Fragment key={batch.batchId}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleExpand(batch.batchId)}
                        >
                          <td className="px-3 py-3 text-gray-400">
                            {expanded.has(batch.batchId)
                              ? <ChevronDown size={13} />
                              : <ChevronRight size={13} />}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs text-gray-500">…{batch.batchId.slice(-8)}</p>
                            <p className="text-xs text-gray-400 capitalize">{batch.promotionType?.replace("_", " ")}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">{batch.academicYear}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{batch.fromClass}</td>
                          <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{batch.toClass}</td>
                          <td className="px-4 py-3 text-center font-semibold text-green-700">{batch.promoted}</td>
                          <td className="px-4 py-3 text-center font-semibold text-red-600">{batch.failed}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs capitalize ${STATUS_COLORS[batch.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {batch.status?.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap hidden md:table-cell">
                            {fmtDate(batch.completedAt)}
                          </td>
                        </tr>

                        {/* Expanded student list */}
                        {expanded.has(batch.batchId) && (
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <td />
                            <td colSpan={8} className="px-4 pb-3 pt-1">
                              {batch.students.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">No student records for this batch.</p>
                              ) : (
                                <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-100 text-gray-500 uppercase">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium">Student</th>
                                        <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Admission No</th>
                                        <th className="px-3 py-2 text-left font-medium">Result</th>
                                        <th className="px-3 py-2 text-left font-medium">Status</th>
                                        <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Completed</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {batch.students.map(s => (
                                        <tr key={s.promotionId} className={cn(s.status === "failed" ? "bg-red-50/50" : "")}>
                                          <td className="px-3 py-2 font-medium text-gray-800">{s.studentName}</td>
                                          <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{s.admissionId}</td>
                                          <td className="px-3 py-2">
                                            {s.promotionResult ? (
                                              <Badge className={`text-xs capitalize ${RESULT_COLORS[s.promotionResult] ?? "bg-gray-100 text-gray-600"}`}>
                                                {s.promotionResult}
                                              </Badge>
                                            ) : "—"}
                                          </td>
                                          <td className="px-3 py-2">
                                            <Badge className={`text-xs capitalize ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                                              {s.status}
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-2 text-gray-400 hidden md:table-cell">{fmtDate(s.completedAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
