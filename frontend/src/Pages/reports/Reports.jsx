import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getAcademicYearsBySchool } from "@/fees-v2";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarDays, Search, X } from "lucide-react";
import FinancialReports from "./FinancialReports";
import AcademicReports  from "./AcademicReports";

const TABS = [
  { id: "financial", label: "Financial" },
  { id: "academic",  label: "Academic"  },
];

export default function Reports() {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [activeTab, setActiveTab] = useState("financial");
  const [years,     setYears]     = useState([]);

  // Global filters — pre-populate individual report filter bars
  const [globalFilters, setGlobalFilters] = useState({
    academicYear: "",
    classSearch:  "",   // client-side text match on row.class
    dateFrom:     "",   // ISO date string, used by Monthly Collection
    dateTo:       "",
    search:       "",   // student name search (Ledger, Alumni)
  });

  const setGf = (key, val) => setGlobalFilters(f => ({ ...f, [key]: val }));
  const clearGf = () => setGlobalFilters({ academicYear: "", classSearch: "", dateFrom: "", dateTo: "", search: "" });

  const hasActiveFilters = Object.values(globalFilters).some(Boolean);

  useEffect(() => {
    if (!schoolId) return;
    getAcademicYearsBySchool(schoolId)
      .then(list => {
        setYears(list);
        // Auto-select active/latest year as global default
        const active = list.find(y => y.isActive) ?? list[0];
        if (active) setGf("academicYear", active.year);
      })
      .catch(() => setYears([]));
  }, [schoolId]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-0.5">Financial and Academic reports for your school.</p>
      </div>

      {/* ── Global filter bar ── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 print:hidden">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Academic Year */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year</label>
            <Select value={globalFilters.academicYear || "_all"} onValueChange={v => setGf("academicYear", v === "_all" ? "" : v)}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All years</SelectItem>
                {years.map(y => (
                  <SelectItem key={y.id} value={y.year}>{y.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class search */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class</label>
            <Input
              placeholder="Filter by class…"
              value={globalFilters.classSearch}
              onChange={e => setGf("classSearch", e.target.value)}
              className="h-8 text-sm w-36"
            />
          </div>

          {/* Date range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <CalendarDays size={10} /> From
            </label>
            <Input
              type="date"
              value={globalFilters.dateFrom}
              onChange={e => setGf("dateFrom", e.target.value)}
              className="h-8 text-sm w-36"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <CalendarDays size={10} /> To
            </label>
            <Input
              type="date"
              value={globalFilters.dateTo}
              onChange={e => setGf("dateTo", e.target.value)}
              className="h-8 text-sm w-36"
            />
          </div>

          {/* Search */}
          <div className="space-y-1 flex-1 min-w-36">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Search size={10} /> Search
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Student name…"
                value={globalFilters.search}
                onChange={e => setGf("search", e.target.value)}
                className="h-8 text-sm pl-7"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearGf}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 h-8 hover:bg-gray-50"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <p className="mt-2 text-xs text-indigo-600">
            Global filters active — individual reports will inherit these defaults.
          </p>
        )}
      </div>

      {/* ── Main tabs ── */}
      <div className="border-b border-gray-200 print:hidden">
        <nav className="flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "financial" && (
        <FinancialReports schoolId={schoolId} years={years} globalFilters={globalFilters} />
      )}
      {activeTab === "academic" && (
        <AcademicReports schoolId={schoolId} years={years} globalFilters={globalFilters} />
      )}
    </div>
  );
}
