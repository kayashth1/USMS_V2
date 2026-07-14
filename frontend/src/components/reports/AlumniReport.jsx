import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Printer, UserCheck, Users } from "lucide-react";
import { getAlumniReport } from "@/reports";
import { withCache } from "@/reports/cache";
import {
  TableSkeleton, ErrorState, EmptyState, Pagination,
  downloadExcel, fmtDate,
} from "./ReportShared";

const PAGE_SIZE = 25;

function _val(a, ...keys) {
  for (const k of keys) if (a[k]) return a[k];
  return "";
}

function doCSV(rows) {
  const headers = ["Name", "Admission No", "Class", "Graduation Year", "Gender", "Phone", "Email"];
  const data    = rows.map(r => [
    _val(r, "fullName", "name"), _val(r, "admissionId", "admissionNo"),
    _val(r, "class", "currentClass", "classId"), _val(r, "graduationYear", "passoutYear"),
    r.gender ?? "", _val(r, "phone", "mobile"), r.email ?? "",
  ]);
  const lines = [headers, ...data].map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: "alumni-report.csv" }).click();
  URL.revokeObjectURL(url);
}

function doExcelExport(rows) {
  const headers = ["Name", "Admission No", "Class", "Graduation Year", "Gender", "Phone", "Email"];
  const data    = rows.map(r => [
    _val(r, "fullName", "name"), _val(r, "admissionId", "admissionNo"),
    _val(r, "class", "currentClass", "classId"), _val(r, "graduationYear", "passoutYear"),
    r.gender ?? "", _val(r, "phone", "mobile"), r.email ?? "",
  ]);
  downloadExcel(headers, data, "alumni-report");
}

export default function AlumniReport({ schoolId, globalFilters }) {
  const [allAlumni, setAllAlumni] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [page,      setPage]      = useState(1);

  const [filters, setFilters] = useState({
    graduationYear: "",
    classId:        "",
    gender:         "",
  });
  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  const doLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await withCache(`alumni_${schoolId}`, () => getAlumniReport(schoolId));
      setAllAlumni(data);
    } catch (e) {
      setError(e.message ?? "Failed to load alumni");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { doLoad(); }, [schoolId]);

  const yearOptions = useMemo(() => {
    const s = new Set(allAlumni.map(a => _val(a, "graduationYear", "passoutYear")).filter(Boolean));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [allAlumni]);

  const classOptions = useMemo(() => {
    const s = new Set(allAlumni.map(a => _val(a, "class", "currentClass", "classId")).filter(Boolean));
    return [...s].sort();
  }, [allAlumni]);

  const filtered = useMemo(() => allAlumni.filter(a => {
    const year = _val(a, "graduationYear", "passoutYear");
    const cls  = _val(a, "class", "currentClass", "classId");
    const gdr  = (a.gender ?? "").toLowerCase();

    if (filters.graduationYear && year !== filters.graduationYear)  return false;
    if (filters.classId        && cls  !== filters.classId)         return false;
    if (filters.gender         && gdr  !== filters.gender)          return false;

    // Global class text filter
    if (globalFilters?.classSearch && !cls.toLowerCase().includes(globalFilters.classSearch.toLowerCase())) return false;
    // Global search
    if (globalFilters?.search) {
      const q = globalFilters.search.toLowerCase();
      const name = _val(a, "fullName", "name").toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  }), [allAlumni, filters, globalFilters]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const byGender = useMemo(() => ({
    male:   filtered.filter(a => (a.gender ?? "").toLowerCase() === "male").length,
    female: filtered.filter(a => (a.gender ?? "").toLowerCase() === "female").length,
  }), [filtered]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Graduation Year</label>
              <Select value={filters.graduationYear || "_all"} onValueChange={v => setFilter("graduationYear", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All years" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All years</SelectItem>
                  {yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class</label>
              <Select value={filters.classId || "_all"} onValueChange={v => setFilter("classId", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All classes</SelectItem>
                  {classOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gender</label>
              <Select value={filters.gender || "_all"} onValueChange={v => setFilter("gender", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-28"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!loading && allAlumni.length > 0 && (
              <div className="col-span-2 sm:col-auto flex gap-2 items-end flex-wrap">
                <Button variant="outline" size="sm" onClick={() => doCSV(filtered)}>
                  <Download size={13} className="mr-1.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => doExcelExport(filtered)}>
                  <FileSpreadsheet size={13} className="mr-1.5" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer size={13} className="mr-1.5" /> Print
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <ErrorState message={error} onRetry={doLoad} />}

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Alumni", value: filtered.length,  icon: UserCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Male",         value: byGender.male,    icon: Users,     color: "text-blue-600",   bg: "bg-blue-50"   },
              { label: "Female",       value: byGender.female,  icon: Users,     color: "text-pink-600",   bg: "bg-pink-50"   },
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

          {filtered.length === 0 ? (
            <EmptyState icon={UserCheck} title="No alumni match the current filters" />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-135">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Admission No</th>
                      <th className="px-4 py-3 text-left font-medium">Class</th>
                      <th className="px-4 py-3 text-left font-medium">Grad. Year</th>
                      <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Gender</th>
                      <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((a, i) => (
                      <tr key={a.id ?? i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{_val(a, "fullName", "name") || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{_val(a, "admissionId", "admissionNo") || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{_val(a, "class", "currentClass", "classId") || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{_val(a, "graduationYear", "passoutYear") || "—"}</td>
                        <td className="px-4 py-3 capitalize text-gray-500 hidden md:table-cell">{a.gender ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{_val(a, "phone", "mobile") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
