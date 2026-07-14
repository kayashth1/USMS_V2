import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, Gift, RefreshCw } from "lucide-react";
import { getScholarshipReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState, Pagination,
  downloadExcel, INR, fmtDate,
} from "./ReportShared";

const PAGE_SIZE = 25;

const TYPE_LABELS = {
  scholarship:       "Scholarship",
  concession:        "Concession",
  sibling_discount:  "Sibling Discount",
  staff_benefit:     "Staff Benefit",
  government_scheme: "Govt. Scheme",
};

const TYPE_COLORS = {
  scholarship:       "bg-purple-100 text-purple-700",
  concession:        "bg-blue-100 text-blue-700",
  sibling_discount:  "bg-teal-100 text-teal-700",
  staff_benefit:     "bg-amber-100 text-amber-700",
  government_scheme: "bg-green-100 text-green-700",
};

const STATUS_COLORS = {
  draft:  "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-400",
};

function doCSV(rows, academicYear) {
  const headers = [
    "Student", "Admission No", "Class", "Scholarship Type", "Label",
    "Recurring", "Applied By", "Revision Date", "Annual Amount (₹)", "Status",
  ];
  const data = rows.map(r => [
    r.studentName, r.admissionId, r.class,
    TYPE_LABELS[r.scholarshipType] ?? r.scholarshipType, r.label,
    r.recurring ? "Yes" : "No",
    r.appliedBy, fmtDate(r.revisionDate), r.annualAmount, r.status,
  ]);
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `scholarship-${academicYear}.csv` }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(rows, academicYear) {
  const headers = [
    "Student", "Admission No", "Class", "Scholarship Type", "Label",
    "Recurring", "Applied By", "Revision Date", "Annual Amount", "Status",
  ];
  const data = rows.map(r => [
    r.studentName, r.admissionId, r.class,
    TYPE_LABELS[r.scholarshipType] ?? r.scholarshipType, r.label,
    r.recurring ? "Yes" : "No",
    r.appliedBy, fmtDate(r.revisionDate), r.annualAmount, r.status,
  ]);
  downloadExcel(headers, data, `scholarship-${academicYear}`);
}

export default function ScholarshipReport({ schoolId, years, globalFilters }) {
  const [filters, setFilters] = useState({
    academicYear: globalFilters?.academicYear ?? "",
    classId:      "",
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
    const cacheKey = `scholarship_${schoolId}_${filters.academicYear}_${filters.classId}`;
    try {
      const data = await withCache(cacheKey, () =>
        getScholarshipReport(schoolId, filters.academicYear, {
          classId: filters.classId || undefined,
        })
      );
      setResult(data);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const { classOptions = [] } = result ?? {};
  let { rows = [] } = result ?? {};

  if (globalFilters?.classSearch) {
    const q = globalFilters.classSearch.toLowerCase();
    rows = rows.filter(r => r.class?.toLowerCase().includes(q));
  }

  const totalAmount = rows.reduce((s, r) => s + (r.annualAmount ?? 0), 0);
  const totalPages  = Math.ceil(rows.length / PAGE_SIZE);
  const paginated   = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  return (
    <div className="space-y-5">
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
                  <Button variant="outline" size="sm" onClick={() => doExcelExport(rows, filters.academicYear)}>
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
      {loading && <ReportSkeleton cards={2} tableRows={6} tableCols={8} />}

      {!loading && result && !error && (
        <div className="space-y-5">
          {rows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0"><Gift size={17} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Beneficiaries</p>
                    <p className="text-xl font-bold text-gray-900">{rows.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-green-50 text-green-600 shrink-0"><RefreshCw size={17} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Annual Benefit</p>
                    <p className="text-xl font-bold text-green-700 tabular-nums">{INR(totalAmount)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState icon={Gift} title="No scholarships found" description="No scholarship or concession records for the selected filters." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-160">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Student</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Class</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-center font-medium hidden md:table-cell">Recurring</th>
                      <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Applied By</th>
                      <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Date</th>
                      <th className="px-4 py-3 text-right font-medium">Annual Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((row, i) => (
                      <tr key={`${row.profileId}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{row.studentName}</p>
                          <p className="text-xs text-gray-400">{row.admissionId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{row.class}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${TYPE_COLORS[row.scholarshipType] ?? "bg-gray-100 text-gray-600"}`}>
                            {TYPE_LABELS[row.scholarshipType] ?? row.scholarshipType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {row.recurring
                            ? <span className="text-xs text-green-600 font-medium">Yes</span>
                            : <span className="text-xs text-gray-400">One-time</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{row.appliedBy}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap hidden lg:table-cell">{fmtDate(row.revisionDate)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700 tabular-nums">{INR(row.annualAmount)}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs capitalize ${STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-sm">
                    <tr>
                      <td className="px-4 py-3" colSpan={6}>Total ({rows.length})</td>
                      <td className="px-4 py-3 text-right text-green-700 tabular-nums">{INR(totalAmount)}</td>
                      <td />
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
