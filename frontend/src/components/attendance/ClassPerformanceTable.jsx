import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronRight } from "lucide-react";

const SORT_FIELDS = {
  label:         { key: "label",         label: "Class"        },
  attendancePct: { key: "attendancePct", label: "Attendance %"  },
  workingDays:   { key: "workingDays",   label: "Working Days"  },
  totalPresent:  { key: "totalPresent",  label: "Total Present" },
  totalAbsent:   { key: "totalAbsent",   label: "Total Absent"  },
};

function SortIcon({ field, sort }) {
  if (sort.field !== field) return <ArrowUpDown size={13} className="text-gray-300" />;
  return sort.dir === "asc"
    ? <ArrowUp   size={13} className="text-indigo-500" />
    : <ArrowDown size={13} className="text-indigo-500" />;
}

/**
 * Sortable class performance table for a given month.
 * Clicking a row navigates to ClassAttendance for detail view.
 *
 * @param {Array}   summaries — from getSchoolMonthlySummary()
 * @param {Array}   classes   — from getClassesBySchool()
 * @param {boolean} loading
 */
const ClassPerformanceTable = ({ summaries = [], classes = [], loading = false }) => {
  const navigate = useNavigate();
  const [sort, setSort] = useState({ field: "label", dir: "asc" });

  const classMap = {};
  classes.forEach((c) => { classMap[c.docId] = c; });

  const rows = summaries.map((s) => {
    const cls = classMap[s.classId];
    return {
      ...s,
      label:    cls ? `${cls.grade}-${cls.section}` : s.classId,
      sortKey:  cls ? `${String(cls.grade).padStart(3, "0")}${cls.section}` : s.classId,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    const av = sort.field === "label" ? a.sortKey : (a[sort.field] ?? 0);
    const bv = sort.field === "label" ? b.sortKey : (b[sort.field] ?? 0);
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field) =>
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );

  const Th = ({ field, children }) => (
    <th
      onClick={() => toggleSort(field)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
    >
      <div className="flex items-center gap-1.5">
        {children}
        <SortIcon field={field} sort={sort} />
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded-md bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No attendance data recorded for this month.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <Th field="label">Class</Th>
            <Th field="attendancePct">Attendance %</Th>
            <Th field="totalPresent">Present</Th>
            <Th field="totalAbsent">Absent</Th>
            <Th field="workingDays">Working Days</Th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((row) => {
            const pct = row.attendancePct;
            const barColor = pct >= 85 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";

            return (
              <tr
                key={row.classId}
                onClick={() => navigate(`/attendance/${row.classId}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors group"
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-semibold text-gray-800">{row.label}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-sm font-semibold ${pct >= 85 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-500"}`}>
                      {pct}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-medium">{row.totalPresent.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{row.totalAbsent.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{row.workingDays}</td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors ml-auto" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ClassPerformanceTable;
