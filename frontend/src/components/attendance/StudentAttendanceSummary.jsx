import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  currentMonthStr,
  resolveActiveAcademicYearId,
  getStudentMonthlySummary,
} from "@/services/attendance.service";

const MONTH_OPTIONS = [
  { value: "01", label: "January"   }, { value: "02", label: "February"  },
  { value: "03", label: "March"     }, { value: "04", label: "April"     },
  { value: "05", label: "May"       }, { value: "06", label: "June"      },
  { value: "07", label: "July"      }, { value: "08", label: "August"    },
  { value: "09", label: "September" }, { value: "10", label: "October"   },
  { value: "11", label: "November"  }, { value: "12", label: "December"  },
];

const WEEK_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * Drop-in attendance widget for StudentProfile.
 * Shows the student's current month attendance with a mini calendar.
 * Read-only — no attendance edits.
 *
 * @param {string} schoolId
 * @param {string} classId   — Firestore document ID of the student's class
 * @param {string} studentId — Firestore document ID of the student
 */
const StudentAttendanceSummary = ({ schoolId, classId, studentId }) => {
  const [ayId,         setAyId]         = useState(null);
  const [month,        setMonth]        = useState(currentMonthStr());
  const [summary,      setSummary]      = useState(null);
  const [loading,      setLoading]      = useState(true);

  // Resolve active academic year once
  useEffect(() => {
    if (!schoolId) return;
    resolveActiveAcademicYearId(schoolId)
      .then(setAyId)
      .catch(console.error);
  }, [schoolId]);

  // Fetch attendance whenever ayId or month changes
  useEffect(() => {
    if (!ayId || !classId || !studentId) return;

    setLoading(true);
    getStudentMonthlySummary(schoolId, ayId, classId, studentId, month)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ayId, month, classId, studentId, schoolId]);

  const year = new Date().getFullYear();
  const monthIndex = parseInt(month, 10) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth();

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700">Attendance</h3>
          </div>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Stat row */}
            <div className="grid grid-cols-3 gap-3">
              <StatPill label="Present" value={summary?.present ?? 0} color="text-green-600" bg="bg-green-50" />
              <StatPill label="Absent"  value={summary?.absent  ?? 0} color="text-red-500"   bg="bg-red-50"   />
              <StatPill label="Attendance"
                value={summary && summary.pct > 0 ? `${summary.pct}%` : "—"}
                color={summary?.pct >= 85 ? "text-green-600" : summary?.pct >= 70 ? "text-amber-600" : "text-red-500"}
                bg="bg-indigo-50"
              />
            </div>

            {/* Mini calendar */}
            {summary && Object.keys(summary.byDate).length > 0 && (
              <div>
                <div className="grid grid-cols-7 mb-1">
                  {WEEK_LABELS.map((d) => (
                    <div key={d} className="text-center text-xs text-gray-300 font-medium py-0.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    if (isCurrentMonth && dayNum > today.getDate()) return <div key={dayNum} />;
                    const dayStr  = String(dayNum).padStart(2, "0");
                    const dateKey = `${year}-${month}-${dayStr}`;
                    const status  = summary.byDate[dateKey];

                    let cls = "h-6 flex items-center justify-center rounded text-xs font-medium ";
                    if (status === true)  cls += "bg-green-500 text-white";
                    else if (status === false) cls += "bg-red-400 text-white";
                    else cls += "text-gray-300";

                    return (
                      <div key={dayNum} className={cls} title={dateKey}>
                        {dayNum}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <CheckCircle2 size={10} className="text-green-500" /> Present
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <XCircle size={10} className="text-red-400" /> Absent
                  </span>
                  <span className="text-xs text-gray-300 ml-auto">{summary.workingDays} school days</span>
                </div>
              </div>
            )}

            {(!summary || Object.keys(summary.byDate).length === 0) && (
              <p className="text-center text-xs text-gray-400 py-4">No attendance recorded this month.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const StatPill = ({ label, value, color, bg }) => (
  <div className={`rounded-lg p-3 text-center ${bg}`}>
    <p className={`text-lg font-bold ${color}`}>{value}</p>
    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
  </div>
);

export default StudentAttendanceSummary;
