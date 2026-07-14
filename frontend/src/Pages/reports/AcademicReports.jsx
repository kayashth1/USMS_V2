import { useState } from "react";
import PromotionReport     from "@/components/reports/PromotionReport";
import GraduationReport    from "@/components/reports/GraduationReport";
import AlumniReport        from "@/components/reports/AlumniReport";
import ClassStrengthReport from "@/components/reports/ClassStrengthReport";
import { cn } from "@/lib/utils";

const REPORTS = [
  { id: "promotion",     label: "Promotion"      },
  { id: "graduation",    label: "Graduation"     },
  { id: "alumni",        label: "Alumni"         },
  { id: "classstrength", label: "Class Strength" },
];

export default function AcademicReports({ schoolId, years, globalFilters }) {
  const [active, setActive] = useState("promotion");

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
      {active === "promotion"     && <PromotionReport     schoolId={schoolId} years={years} globalFilters={globalFilters} />}
      {active === "graduation"    && <GraduationReport    schoolId={schoolId} years={years} globalFilters={globalFilters} />}
      {active === "alumni"        && <AlumniReport        schoolId={schoolId}               globalFilters={globalFilters} />}
      {active === "classstrength" && <ClassStrengthReport schoolId={schoolId} years={years} globalFilters={globalFilters} />}
    </div>
  );
}
