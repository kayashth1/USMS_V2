import { useState } from "react";
import MonthlyCollectionReport from "@/components/reports/MonthlyCollectionReport";
import OutstandingReport       from "@/components/reports/OutstandingReport";
import StudentLedgerReport     from "@/components/reports/StudentLedgerReport";
import ScholarshipReport       from "@/components/reports/ScholarshipReport";
import { cn } from "@/lib/utils";

const REPORTS = [
  { id: "monthly",     label: "Monthly Collection" },
  { id: "outstanding", label: "Outstanding"        },
  { id: "ledger",      label: "Student Ledger"     },
  { id: "scholarship", label: "Scholarship"        },
];

export default function FinancialReports({ schoolId, years, globalFilters }) {
  const [active, setActive] = useState("monthly");

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto print:hidden">
        {REPORTS.map(r => (
          <button
            key={r.id}
            onClick={() => setActive(r.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
              active === r.id
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Print-only label */}
      <div className="hidden print:block text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {REPORTS.find(r => r.id === active)?.label}
      </div>

      {/* Active report */}
      {active === "monthly"     && <MonthlyCollectionReport schoolId={schoolId} years={years} globalFilters={globalFilters} />}
      {active === "outstanding" && <OutstandingReport       schoolId={schoolId} years={years} globalFilters={globalFilters} />}
      {active === "ledger"      && <StudentLedgerReport     schoolId={schoolId} years={years} globalFilters={globalFilters} />}
      {active === "scholarship" && <ScholarshipReport       schoolId={schoolId} years={years} globalFilters={globalFilters} />}
    </div>
  );
}
