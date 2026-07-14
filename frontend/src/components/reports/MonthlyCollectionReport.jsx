import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, TrendingUp, Receipt, Calculator } from "lucide-react";
import { getMonthlyCollection } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState, Pagination,
  downloadExcel, INR, fmtDate,
} from "./ReportShared";
import SvgBarChart from "./charts/SvgBarChart";

const PAGE_SIZE = 25;

const MONTHS = [
  { value: "1",  label: "January"   }, { value: "2",  label: "February"  },
  { value: "3",  label: "March"     }, { value: "4",  label: "April"     },
  { value: "5",  label: "May"       }, { value: "6",  label: "June"      },
  { value: "7",  label: "July"      }, { value: "8",  label: "August"    },
  { value: "9",  label: "September" }, { value: "10", label: "October"   },
  { value: "11", label: "November"  }, { value: "12", label: "December"  },
];

const PAYMENT_MODES = ["cash", "upi", "cheque", "dd", "online"];
const MODE_COLORS   = {
  cash: "bg-green-100 text-green-700", upi: "bg-blue-100 text-blue-700",
  cheque: "bg-amber-100 text-amber-700", dd: "bg-purple-100 text-purple-700",
  online: "bg-indigo-100 text-indigo-700",
};

function downloadCSV(rows, academicYear, month) {
  const headers = ["Receipt No", "Student", "Admission No", "Class", "Date", "Mode", "Amount", "Collected By"];
  const data    = rows.map(r => [
    r.receiptNo, r.studentName, r.admissionId, r.class,
    fmtDate(r.paymentDate), r.paymentMode, r.amount, r.collectedBy,
  ]);
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url, download: `monthly-collection-${academicYear}-${month ?? "all"}.csv`,
  }).click();
  URL.revokeObjectURL(url);
}

function doExcel(rows, academicYear, month) {
  const headers = ["Receipt No", "Student", "Admission No", "Class", "Date", "Mode", "Amount", "Collected By"];
  const data    = rows.map(r => [
    r.receiptNo, r.studentName, r.admissionId, r.class,
    fmtDate(r.paymentDate), r.paymentMode, r.amount, r.collectedBy,
  ]);
  downloadExcel(headers, data, `monthly-collection-${academicYear}-${month ?? "all"}`);
}

export default function MonthlyCollectionReport({ schoolId, years, globalFilters }) {
  const [filters, setFilters] = useState({
    academicYear: globalFilters?.academicYear ?? "",
    month:        "",
    classId:      "",
    paymentMode:  "",
  });
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);

  // Sync global academic year
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
    const cacheKey = `monthly_${schoolId}_${filters.academicYear}_${filters.month}_${filters.classId}_${filters.paymentMode}`;
    try {
      const data = await withCache(cacheKey, () =>
        getMonthlyCollection(schoolId, filters.academicYear, {
          month:       filters.month       || undefined,
          classId:     filters.classId     || undefined,
          paymentMode: filters.paymentMode || undefined,
        })
      );
      setResult(data);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const { classOptions = [], summary = {} } = result ?? {};
  let { rows = [] } = result ?? {};

  // Client-side: global class text filter
  if (globalFilters?.classSearch) {
    const q = globalFilters.classSearch.toLowerCase();
    rows = rows.filter(r => r.class?.toLowerCase().includes(q));
  }
  // Client-side: global date range filter
  if (globalFilters?.dateFrom || globalFilters?.dateTo) {
    const from = globalFilters.dateFrom ? new Date(globalFilters.dateFrom) : null;
    const to   = globalFilters.dateTo   ? new Date(globalFilters.dateTo)   : null;
    rows = rows.filter(r => {
      const d = r.paymentDate instanceof Date ? r.paymentDate : new Date(r.paymentDate);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const paginated  = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  // Chart data: group by month when no month filter selected
  const chartData = useMemo(() => {
    if (!result) return [];
    if (summary.trend?.length) {
      return summary.trend.map(t => ({
        label: fmtDate(new Date(t.date)).slice(3), // "Mon YYYY"
        total: t.total,
      }));
    }
    return [];
  }, [result, summary.trend]);

  const hasData = result !== null;

  return (
    <div className="space-y-5">
      {/* ── Filters ── */}
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
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Month</label>
              <Select value={filters.month || "_all"} onValueChange={v => setFilter("month", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All months" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All months</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mode</label>
              <Select value={filters.paymentMode || "_all"} onValueChange={v => setFilter("paymentMode", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="All modes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All modes</SelectItem>
                  {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
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
                  <Button variant="outline" size="sm" onClick={() => downloadCSV(rows, filters.academicYear, filters.month)}>
                    <Download size={13} className="mr-1.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => doExcel(rows, filters.academicYear, filters.month)}>
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

      {/* ── States ── */}
      {error   && <ErrorState message={error} onRetry={handleRun} />}
      {loading && <ReportSkeleton cards={3} tableRows={8} tableCols={7} />}

      {/* ── Results ── */}
      {!loading && hasData && !error && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Collection",  value: INR(summary.totalCollection),   icon: TrendingUp,  bg: "bg-green-50",  tc: "text-green-600"  },
              { label: "Transactions",      value: summary.transactionCount,        icon: Receipt,     bg: "bg-blue-50",   tc: "text-blue-600"   },
              { label: "Average Payment",   value: INR(summary.averagePayment),     icon: Calculator,  bg: "bg-amber-50",  tc: "text-amber-600"  },
            ].map(({ label, value, icon: Icon, bg, tc }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${bg} ${tc} shrink-0`}><Icon size={17} /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide truncate">{label}</p>
                    <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Collection Trend chart */}
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Collection Trend</h3>
                <SvgBarChart
                  data={chartData}
                  xKey="label"
                  yKey="total"
                  color="#6366f1"
                  formatX={v => v}
                  formatY={v => `₹${(v / 1000).toFixed(0)}k`}
                  height={180}
                />
              </CardContent>
            </Card>
          )}

          {/* Table */}
          {rows.length === 0 ? (
            <EmptyState icon={Receipt} title="No collections found" description="Adjust the filters above and generate again." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-160">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Receipt No</th>
                      <th className="px-4 py-3 text-left font-medium">Student</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Class</th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">Mode</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Collected By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600">{row.receiptNo}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{row.studentName}</p>
                          <p className="text-xs text-gray-400">{row.admissionId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{row.class}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(row.paymentDate)}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${MODE_COLORS[row.paymentMode] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.paymentMode?.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{INR(row.amount)}</td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{row.collectedBy}</td>
                      </tr>
                    ))}
                  </tbody>
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
