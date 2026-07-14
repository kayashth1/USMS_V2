import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, GraduationCap, AlertCircle, CheckCircle } from "lucide-react";
import { getGraduationReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState,
  downloadExcel, INR, fmtDate,
} from "./ReportShared";
import SvgDonutChart from "./charts/SvgDonutChart";

const RESULT_COLORS = {
  graduated:   "bg-purple-100 text-purple-700",
  promoted:    "bg-green-100 text-green-700",
  repeated:    "bg-amber-100 text-amber-700",
  transferred: "bg-blue-100 text-blue-700",
  left_school: "bg-gray-100 text-gray-500",
};

function doCSV(rows, academicYear) {
  const headers = ["Student Name", "Admission No", "Class", "Graduation Date", "Result", "Outstanding at Graduation"];
  const data    = rows.map(r => [
    r.studentName, r.admissionId, r.class,
    fmtDate(r.graduationDate), r.promotionResult, r.outstandingAtGraduation,
  ]);
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `graduation-${academicYear}.csv` }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(rows, academicYear) {
  const headers = ["Student Name", "Admission No", "Class", "Graduation Date", "Result", "Outstanding at Graduation"];
  const data    = rows.map(r => [
    r.studentName, r.admissionId, r.class,
    fmtDate(r.graduationDate), r.promotionResult, r.outstandingAtGraduation,
  ]);
  downloadExcel(headers, data, `graduation-${academicYear}`);
}

export default function GraduationReport({ schoolId, years, globalFilters }) {
  const [academicYear, setAcademicYear] = useState(globalFilters?.academicYear ?? "");
  const [rows,         setRows]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [ran,          setRan]          = useState(false);

  useEffect(() => {
    if (globalFilters?.academicYear) {
      setAcademicYear(globalFilters.academicYear);
      setRows([]);
      setRan(false);
    }
  }, [globalFilters?.academicYear]);

  const handleRun = async () => {
    if (!academicYear) return;
    setLoading(true);
    setError(null);
    setRan(false);
    const cacheKey = `graduation_${schoolId}_${academicYear}`;
    try {
      const data = await withCache(cacheKey, () => getGraduationReport(schoolId, academicYear));
      setRows(data);
      setRan(true);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = rows.reduce((s, r) => s + (r.outstandingAtGraduation ?? 0), 0);
  const withBalance      = rows.filter(r => (r.outstandingAtGraduation ?? 0) > 0).length;

  // Graduation statistics by result
  const resultBreakdown = rows.reduce((acc, r) => {
    acc[r.promotionResult] = (acc[r.promotionResult] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year *</label>
              <Select
                value={academicYear}
                onValueChange={v => { setAcademicYear(v); setRows([]); setRan(false); }}
              >
                <SelectTrigger className="w-32"><SelectValue placeholder="Select year" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y.id} value={y.year}>{y.year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 items-end flex-wrap">
              <Button
                onClick={handleRun}
                disabled={loading || !academicYear}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? "Loading…" : "Generate"}
              </Button>

              {rows.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => doCSV(rows, academicYear)}>
                    <Download size={13} className="mr-1.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => doExcelExport(rows, academicYear)}>
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
      {loading && <ReportSkeleton cards={3} tableRows={6} tableCols={6} />}

      {!loading && ran && !error && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Graduates",  value: rows.length,              icon: GraduationCap, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "Cleared Dues",     value: rows.length - withBalance, icon: CheckCircle,   color: "text-green-600",  bg: "bg-green-50"  },
              { label: "With Outstanding", value: withBalance,              icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-50"    },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${bg} ${color} shrink-0`}><Icon size={17} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-xl font-bold text-gray-900">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Graduation statistics chart */}
          {Object.keys(resultBreakdown).length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-5">Graduation Statistics</h3>
                <SvgDonutChart
                  segments={Object.entries(resultBreakdown).map(([result, count]) => ({
                    label: result.charAt(0).toUpperCase() + result.slice(1),
                    value: count,
                    color: result === "graduated" ? "#a855f7" : result === "promoted" ? "#22c55e" : "#9ca3af",
                  }))}
                  size={130}
                />
              </CardContent>
            </Card>
          )}

          {rows.length === 0 ? (
            <EmptyState icon={GraduationCap} title={`No graduation records for ${academicYear}`} />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-135">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Student</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Admission No</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Class</th>
                      <th className="px-4 py-3 text-left font-medium">Graduation Date</th>
                      <th className="px-4 py-3 text-left font-medium">Result</th>
                      <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                      <tr key={row.promotionId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.studentName}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{row.admissionId}</td>
                        <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">{row.class}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(row.graduationDate)}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs capitalize ${RESULT_COLORS[row.promotionResult] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.promotionResult}
                          </Badge>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${(row.outstandingAtGraduation ?? 0) > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          {(row.outstandingAtGraduation ?? 0) > 0 ? INR(row.outstandingAtGraduation) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totalOutstanding > 0 && (
                    <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-sm">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-gray-700">Total</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{INR(totalOutstanding)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
