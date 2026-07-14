import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, Users } from "lucide-react";
import { getClassStrengthReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  ReportSkeleton, ErrorState, EmptyState, downloadExcel,
} from "./ReportShared";
import SvgBarChart from "./charts/SvgBarChart";

const COLS = [
  { key: "total",     label: "Total",     cls: "text-gray-900 font-semibold" },
  { key: "male",      label: "Male",      cls: "text-blue-700"   },
  { key: "female",    label: "Female",    cls: "text-pink-700"   },
  { key: "active",    label: "Active",    cls: "text-green-700"  },
  { key: "alumni",    label: "Alumni",    cls: "text-purple-700" },
  { key: "promoted",  label: "Promoted",  cls: "text-indigo-700" },
  { key: "graduated", label: "Graduated", cls: "text-amber-700"  },
];

function doCSV(rows, academicYear) {
  const headers = ["Class", "Total", "Male", "Female", "Active", "Alumni", "Promoted", "Graduated"];
  const totals  = rows.reduce((acc, r) => {
    COLS.forEach(c => { acc[c.key] = (acc[c.key] ?? 0) + r[c.key]; });
    return acc;
  }, {});
  const data = [
    ...rows.map(r => [r.classLabel, ...COLS.map(c => r[c.key])]),
    ["TOTAL", ...COLS.map(c => totals[c.key])],
  ];
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `class-strength-${academicYear}.csv` }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(rows, academicYear) {
  const headers = ["Class", "Total", "Male", "Female", "Active", "Alumni", "Promoted", "Graduated"];
  const totals  = rows.reduce((acc, r) => {
    COLS.forEach(c => { acc[c.key] = (acc[c.key] ?? 0) + r[c.key]; });
    return acc;
  }, {});
  const data = [
    ...rows.map(r => [r.classLabel, ...COLS.map(c => r[c.key])]),
    ["TOTAL", ...COLS.map(c => totals[c.key])],
  ];
  downloadExcel(headers, data, `class-strength-${academicYear}`);
}

export default function ClassStrengthReport({ schoolId, years, globalFilters }) {
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
    const cacheKey = `classstrength_${schoolId}_${academicYear}`;
    try {
      const data = await withCache(cacheKey, () => getClassStrengthReport(schoolId, academicYear));
      setRows(data);
      setRan(true);
    } catch (e) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const totals = rows.reduce((acc, r) => {
    COLS.forEach(c => { acc[c.key] = (acc[c.key] ?? 0) + r[c.key]; });
    return acc;
  }, {});

  // Client-side global class text filter on displayed rows
  const displayRows = globalFilters?.classSearch
    ? rows.filter(r => r.classLabel?.toLowerCase().includes(globalFilters.classSearch.toLowerCase()))
    : rows;

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
      {loading && <ReportSkeleton cards={4} tableRows={6} tableCols={8} />}

      {!loading && ran && !error && (
        <div className="space-y-5">
          {/* Top summary */}
          {rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Classes",  value: rows.length,    color: "text-gray-700"   },
                { label: "Students", value: totals.total,   color: "text-gray-700"   },
                { label: "Active",   value: totals.active,  color: "text-green-700"  },
                { label: "Alumni",   value: totals.alumni,  color: "text-purple-700" },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Bar chart: total students per class */}
          {rows.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Students per Class</h3>
                <SvgBarChart
                  data={rows}
                  xKey="classLabel"
                  yKey="total"
                  color="#6366f1"
                  height={180}
                />
              </CardContent>
            </Card>
          )}

          {displayRows.length === 0 ? (
            <EmptyState icon={Users} title={`No student profiles found for ${academicYear}`} />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-160">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Class</th>
                      {COLS.map(c => (
                        <th key={c.key} className="px-4 py-3 text-center font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRows.map(row => (
                      <tr key={row.classId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-800">{row.classLabel}</td>
                        {COLS.map(c => (
                          <td key={c.key} className={`px-4 py-3 text-center tabular-nums font-mono ${c.cls}`}>
                            {row[c.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <tr>
                      <td className="px-4 py-3 text-gray-700">Total</td>
                      {COLS.map(c => (
                        <td key={c.key} className={`px-4 py-3 text-center tabular-nums font-mono ${c.cls}`}>
                          {totals[c.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
