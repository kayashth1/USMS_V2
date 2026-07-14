import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import {
  GraduationCap, Download, RefreshCw, Search, Users, Calendar,
  LayoutList, Eye,
} from "lucide-react";

import { getAlumni, searchAlumni } from "@/services/alumni.service";
import { useSchoolPlan } from "@/hooks/useSchoolPlan";
import AlumniProfileDrawer from "@/components/alumni/AlumniProfileDrawer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function downloadCSV(alumni) {
  const headers = [
    "Name", "Admission No.", "Roll No.", "Gender",
    "Graduated Class", "Graduation Year", "Phone", "Email", "Parent",
  ];
  const rows = alumni.map((a) => [
    a.name, a.admissionId, a.rollNo, a.gender ?? "",
    a.graduatedClassLabel, a.graduatedAcademicYear,
    a.phone, a.email, a.parentName,
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));

  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "alumni.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-md border animate-pulse">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {["Student", "Admission No.", "Gender", "Graduated Class", "Grad. Year", "Phone", ""].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 7 }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded w-full max-w-30" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ alumni, filtered, loading }) {
  const { years, latestYear, thisYear } = useMemo(() => {
    const yr  = new Set(alumni.map((a) => a.graduatedAcademicYear).filter(Boolean));
    const sorted = [...yr].sort().reverse();
    const currentYear = new Date().getFullYear();
    const thisYrStr   = `${currentYear - 1}-${String(currentYear).slice(2)}`;
    const thisYrCount = alumni.filter((a) => a.graduatedAcademicYear === thisYrStr).length;
    return { years: sorted, latestYear: sorted[0] ?? "—", thisYear: thisYrCount };
  }, [alumni]);

  const cards = [
    { icon: Users,       label: "Total Alumni",           value: alumni.length,  color: "text-indigo-600 bg-indigo-50" },
    { icon: Calendar,    label: "Latest Graduating Batch", value: latestYear,     color: "text-purple-600 bg-purple-50" },
    { icon: LayoutList,  label: "Graduation Years",        value: years.length,   color: "text-blue-600 bg-blue-50" },
    { icon: GraduationCap, label: "Students This Year",   value: thisYear,       color: "text-green-600 bg-green-50" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, label, value, color }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              {loading
                ? <div className="h-6 w-12 bg-gray-200 rounded animate-pulse mb-1" />
                : <p className="text-2xl font-bold">{value}</p>}
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function AlumniFilters({ alumni, search, onSearch, filterYear, onYearChange, filterClass, onClassChange, filterGender, onGenderChange }) {
  const years = useMemo(
    () => [...new Set(alumni.map((a) => a.graduatedAcademicYear).filter(Boolean))].sort().reverse(),
    [alumni]
  );

  const classes = useMemo(
    () => [...new Set(alumni.map((a) => a.graduatedClassLabel).filter(Boolean))].sort(),
    [alumni]
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search by name, admission no., phone…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>

          {/* Academic Year */}
          <Select value={filterYear} onValueChange={onYearChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Graduated Class */}
          <Select value={filterClass} onValueChange={onClassChange}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Gender */}
          <Select value={filterGender} onValueChange={onGenderChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Alumni Table ─────────────────────────────────────────────────────────────

const GENDER_STYLES = {
  male:   "bg-blue-50 text-blue-600",
  female: "bg-pink-50 text-pink-600",
};

function AlumniTable({ alumni, onViewProfile }) {
  if (alumni.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400">
        <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No alumni found.</p>
        <p className="text-xs mt-1">Try adjusting your filters or search.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Admission No.</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Gender</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Graduated Class</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Grad. Year</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Current Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {alumni.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50 transition-colors">
              {/* Student */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {a.photo ? (
                    <img src={a.photo} alt={a.name} className="h-8 w-8 rounded-full object-cover border" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-indigo-600">
                        {a.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-800">{a.name}</p>
                    {a.rollNo && a.rollNo !== "—" && (
                      <p className="text-xs text-gray-400">Roll {a.rollNo}</p>
                    )}
                  </div>
                </div>
              </td>

              {/* Admission No. */}
              <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.admissionId}</td>

              {/* Gender */}
              <td className="px-4 py-3">
                {a.gender ? (
                  <Badge className={`capitalize ${GENDER_STYLES[a.gender?.toLowerCase()] ?? "bg-gray-100 text-gray-500"}`}>
                    {a.gender}
                  </Badge>
                ) : <span className="text-gray-300">—</span>}
              </td>

              {/* Graduated Class */}
              <td className="px-4 py-3">
                <Badge className="bg-indigo-100 text-indigo-700">
                  {a.graduatedClassLabel}
                </Badge>
              </td>

              {/* Grad. Year */}
              <td className="px-4 py-3">
                <Badge className="bg-purple-100 text-purple-700">
                  {a.graduatedAcademicYear}
                </Badge>
              </td>

              {/* Current Status */}
              <td className="px-4 py-3">
                <Badge className="bg-gray-100 text-gray-600">Alumni</Badge>
              </td>

              {/* Phone */}
              <td className="px-4 py-3 text-gray-600">{a.phone}</td>

              {/* Actions */}
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 gap-1.5 text-xs"
                  onClick={() => onViewProfile(a)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Profile
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty State (no alumni at all) ──────────────────────────────────────────

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-20 text-center text-gray-400">
        <GraduationCap className="mx-auto mb-4 h-12 w-12 opacity-30" />
        <p className="text-base font-medium text-gray-500">No alumni yet</p>
        <p className="text-sm mt-2 max-w-sm mx-auto">
          Alumni appear here once students are graduated via the Academic Year Rollover.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Alumni() {
  const schoolId = localStorage.getItem("principalSchoolId");
  const { isFree } = useSchoolPlan();

  const [alumni,       setAlumni]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(null);
  const [refreshing,   setRefreshing]   = useState(false);

  // Filters
  const [search,        setSearch]        = useState("");
  const [filterYear,    setFilterYear]    = useState("all");
  const [filterClass,   setFilterClass]   = useState("all");
  const [filterGender,  setFilterGender]  = useState("all");

  // Profile drawer
  const [selectedStudent, setSelectedStudent] = useState(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (!schoolId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setLoadError(null);
    try {
      let data = await getAlumni(schoolId);
      // Free tier: limit to current year only
      if (isFree) {
        const yr = new Date().getFullYear();
        const cur = `${yr - 1}-${String(yr).slice(2)}`;
        data = data.filter((a) => a.graduatedAcademicYear === cur);
      }
      setAlumni(data);
    } catch (e) {
      setLoadError(e.message ?? "Failed to load alumni.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId, isFree]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = searchAlumni(alumni, search);
    if (filterYear   !== "all") list = list.filter((a) => a.graduatedAcademicYear === filterYear);
    if (filterClass  !== "all") list = list.filter((a) => a.graduatedClassLabel   === filterClass);
    if (filterGender !== "all") list = list.filter((a) => a.gender?.toLowerCase() === filterGender);
    // Newest graduation first
    return [...list].sort(
      (a, b) => (b.graduatedAcademicYear ?? "").localeCompare(a.graduatedAcademicYear ?? "")
    );
  }, [alumni, search, filterYear, filterClass, filterGender]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Alumni</h1>
          <p className="text-gray-500 text-sm mt-0.5">View and manage graduated students.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => load(true)}
            disabled={refreshing || loading}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => downloadCSV(filtered)}
            disabled={filtered.length === 0 || loading}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <SummaryCards alumni={alumni} filtered={filtered} loading={loading} />

      {/* Free tier notice */}
      {isFree && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <GraduationCap className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Free Plan — </span>
            Showing alumni from the current academic year only. Upgrade to Premium for lifetime access.
          </p>
        </div>
      )}

      {/* Filters */}
      {!loading && alumni.length > 0 && (
        <AlumniFilters
          alumni={alumni}
          search={search}
          onSearch={setSearch}
          filterYear={filterYear}
          onYearChange={setFilterYear}
          filterClass={filterClass}
          onClassChange={setFilterClass}
          filterGender={filterGender}
          onGenderChange={setFilterGender}
        />
      )}

      {/* Count */}
      {!loading && alumni.length > 0 && (
        <p className="text-xs text-gray-400">
          Showing {filtered.length} of {alumni.length} alumni
        </p>
      )}

      {/* Table / States */}
      {loading ? (
        <TableSkeleton />
      ) : alumni.length === 0 ? (
        <EmptyState />
      ) : (
        <AlumniTable alumni={filtered} onViewProfile={setSelectedStudent} />
      )}

      {/* Profile Drawer */}
      <AlumniProfileDrawer
        student={selectedStudent}
        open={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
