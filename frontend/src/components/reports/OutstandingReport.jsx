import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, AlertCircle, Users, TrendingDown } from "lucide-react";
import { getOutstandingReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState, Pagination,
  downloadExcel, INR, fmtDate,
} from "./ReportShared";
import SvgBarChart from "./charts/SvgBarChart";

const PAGE_SIZE = 25;

function doCSV(rows, academicYear) {
  const headers = ["Student", "Admission No", "Class", "Outstanding", "Opening Balance", "Installment Balance"];
  const data    = rows.map(r => [r.studentName, r.admissionId, r.class, r.outstanding, r.openingOutstanding, r.installmentBalance]);
  const lines   = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `outstanding-${academicYear}.csv` }).click();
  URL.revokeObjectURL(url);
}

function doExcel(rows, academicYear) {
  const headers = ["Student", "Admission No", "Class", "Outstanding", "Opening Balance", "Installment Balance"];
  const data    = rows.map(r => [r.studentName, r.admissionId, r.class, r.outstanding, r.openingOutstanding, r.installmentBalance]);
  downloadExcel(headers, data, `outstanding-${academicYear}`);
}

export default function OutstandingReport({ schoolId, years, globalFilters }) {
  const [filters, setFilters] = useState({
    academicYear:   globalFilters?.academicYear ?? "",
    classId:        "",
    minOutstanding: "",
  });
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    if (globalFilters?.academicYear) {
      setFilters(f => ({ ...f, academicYear: globalFilters.academicYear }));
      setResult(null);
      setPage(1);
    }
  }, [globalFilters?.academicYear]);

  const setFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setResult(null);
    setPage(1);
  };

  const handleRun = async () => {
    if (!filters.academicYear) return;
    setLoading(true);
    setError(null);
    setPage(1);
    const cacheKey = `outstanding_${schoolId}_${filters.academicYear}_${filters.classId}_${filters.minOutstanding}`;
    try {
      const data = await withCache(cacheKey, () =>
        getOutstandingReport(schoolId, filters.academicYear, {
          classId:        filters.classId        || undefined,
          minOutstanding: filters.minOutstanding ? Number(filters.minOutstanding) : undefined,
        })
      );
      setResult(data);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const { summary = {}, classOptions = [] } = result ?? {};
  let { rows = [] } = result ?? {};

  // Client-side global class text filter
  if (globalFilters?.classSearch) {
    const q = globalFilters.classSearch.toLowerCase();
    rows = rows.filter(r => r.class?.toLowerCase().includes(q));
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const paginated  = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  // Chart: outstanding by class (top 10)
  const chartData = useMemo(() => {
    if (!rows.length) return [];
    const byClass = {};
    rows.forEach(r => {
      byClass[r.class ?? "—"] = (byClass[r.class ?? "—"] ?? 0) + r.outstanding;
    });
    return Object.entries(byClass)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, total]) => ({ label, total }));
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year *</label>
              <Select value={filters.academicYear} onValueChange={v => setFilter("academicYear", v)}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y.id} value={y.year}>{y.year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class</label>
              <Select value={filters.classId || "_all"} onValueChange={v => setFilter("classId", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All classes</SelectItem>
                  {classOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Min Outstanding (₹)</label>
              <Input
                type="number" min="0" placeholder="e.g. 500"
                value={filters.minOutstanding}
                onChange={e => setFilter("minOutstanding", e.target.value)}
                className="w-full sm:w-36"
              />
            </div>

            <div className="col-span-2 sm:col-auto flex gap-2 items-end flex-wrap">
              <Button
                onClick={handleRun}
                disabled={!filters.academicYear || loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? "Loading…" : "Generate"}
              </Button>

              {rows.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => doCSV(rows, filters.academicYear)}>
                    <Download size={13} className="mr-1.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => doExcel(rows, filters.academicYear)}>
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
      {loading && <ReportSkeleton cards={3} tableRows={8} tableCols={5} />}

      {!loading && result && !error && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Outstanding Total",    value: INR(summary.outstandingTotal),    icon: AlertCircle,  bg: "bg-red-50",    tc: "text-red-600"    },
              { label: "Students Pending",     value: summary.studentsPending,          icon: Users,        bg: "bg-amber-50",  tc: "text-amber-600"  },
              { label: "Average Outstanding",  value: INR(summary.averageOutstanding),  icon: TrendingDown, bg: "bg-orange-50", tc: "text-orange-600" },
            ].map(({ label, value, icon: Icon, bg, tc }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${bg} ${tc} shrink-0`}><Icon size={17} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Outstanding by class chart */}
          {chartData.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Outstanding by Class</h3>
                <SvgBarChart
                  data={chartData}
                  xKey="label"
                  yKey="total"
                  color="#ef4444"
                  formatY={v => `₹${(v / 1000).toFixed(0)}k`}
                  height={Math.min(240, 24 + chartData.length * 28)}
                  horizontal
                />
              </CardContent>
            </Card>
          )}

          {rows.length === 0 ? (
            <EmptyState icon={AlertCircle} title="No outstanding dues found" description="Try different filters." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-135">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Student</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Class</th>
                      <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                      <th className="px-4 py-3 text-right font-medium hidden md:table-cell">Opening Balance</th>
                      <th className="px-4 py-3 text-right font-medium hidden md:table-cell">Instalment Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map(row => (
                      <tr key={row.profileId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{row.studentName}</p>
                          <p className="text-xs text-gray-400">{row.admissionId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{row.class}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums">{INR(row.outstanding)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums hidden md:table-cell">{INR(row.openingOutstanding)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums hidden md:table-cell">{INR(row.installmentBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-sm">
                    <tr>
                      <td className="px-4 py-3 hidden sm:table-cell" />
                      <td className="px-4 py-3 text-gray-700">Total ({rows.length})</td>
                      <td className="px-4 py-3 text-right text-red-600 tabular-nums">{INR(summary.outstandingTotal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {INR(rows.reduce((s, r) => s + r.openingOutstanding, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {INR(rows.reduce((s, r) => s + r.installmentBalance, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
