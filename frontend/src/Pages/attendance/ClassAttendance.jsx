import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from "lucide-react";

import { getClassesBySchool } from "@/services/class.service";
import {
  currentMonthStr,
  resolveActiveAcademicYearId,
  getAcademicYearsForSchool,
  getClassMonthFullData,
} from "@/services/attendance.service";

import ClassMonthCalendar from "@/components/attendance/ClassMonthCalendar";
import DayDetailPanel     from "@/components/attendance/DayDetailPanel";
import TeacherActivityLog from "@/components/attendance/TeacherActivityLog";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function prevMonthOf(year, month) {
  const m = parseInt(month, 10);
  return m === 1 ? { year: year - 1, month: "12" } : { year, month: String(m - 1).padStart(2, "0") };
}
function nextMonthOf(year, month) {
  const m = parseInt(month, 10);
  return m === 12 ? { year: year + 1, month: "01" } : { year, month: String(m + 1).padStart(2, "0") };
}

const ClassAttendance = () => {
  const { classId } = useParams();
  const navigate    = useNavigate();
  const schoolId    = localStorage.getItem("principalSchoolId");
  const AY_SESSION_KEY = `attendance_ayId_${schoolId}`;

  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [month,    setMonth]    = useState(currentMonthStr());

  // Reference data
  const [classes,    setClasses]    = useState([]);
  const [ayId,       setAyId]       = useState(null);
  const [aysList,    setAysList]    = useState([]);
  const [students,   setStudents]   = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [subjectMap, setSubjectMap] = useState({});
  const [periodMap,  setPeriodMap]  = useState({});

  // Month data (all from one Firestore read via getClassMonthFullData)
  const [monthDays,    setMonthDays]    = useState({});
  const [byStudent,    setByStudent]    = useState({});
  const [workingDays,  setWorkingDays]  = useState(0);
  const [actPct,       setActPct]       = useState(0);
  const [activityLog,  setActivityLog]  = useState([]);

  const [selectedDate,  setSelectedDate]  = useState(null);
  const [initLoading,   setInitLoading]   = useState(true);
  const [monthLoading,  setMonthLoading]  = useState(false);

  // ── Init: load all reference data ─────────────────────────────────────────

  useEffect(() => {
    if (!schoolId || !classId) return;

    const init = async () => {
      const [cls, activeAyId, ays, studentSnap, teacherSnap, subjectSnap, periodSnap] =
        await Promise.all([
          getClassesBySchool(schoolId),
          resolveActiveAcademicYearId(schoolId),
          getAcademicYearsForSchool(schoolId),
          getDocs(query(
            collection(db, "students"),
            where("classId", "==", classId),
            where("isActive", "==", true)
          )),
          getDocs(query(collection(db, "teachers"), where("schoolId", "==", schoolId))),
          getDocs(query(collection(db, "subjects"),    where("schoolId", "==", schoolId))),
          getDocs(query(collection(db, "timePeriods"), where("schoolId", "==", schoolId))),
        ]);

      setClasses(cls);
      setAysList(ays);
      const storedAyId = sessionStorage.getItem(AY_SESSION_KEY);
      const validStored = storedAyId && ays.some((ay) => ay.id === storedAyId);
      setAyId(validStored ? storedAyId : activeAyId);
      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const tMap = {}; teacherSnap.forEach((d) => { tMap[d.id] = d.data(); }); setTeacherMap(tMap);
      const sMap = {}; subjectSnap.forEach((d) => { sMap[d.id] = d.data(); }); setSubjectMap(sMap);
      const pMap = {}; periodSnap.forEach((d)  => { pMap[d.id] = d.data(); }); setPeriodMap(pMap);
    };

    init().catch(console.error).finally(() => setInitLoading(false));
  }, [schoolId, classId]);

  // ── Load month data whenever ayId / month / year changes ──────────────────

  useEffect(() => {
    if (!ayId || initLoading) return;

    setMonthLoading(true);
    setSelectedDate(null);

    getClassMonthFullData(schoolId, ayId, classId, month)
      .then((data) => {
        setMonthDays(data.days);
        setByStudent(data.byStudent ?? {});
        setWorkingDays(data.workingDays ?? 0);
        setActPct(data.attendancePct ?? 0);
        setActivityLog(data.activityLog ?? []);
      })
      .catch(console.error)
      .finally(() => setMonthLoading(false));
  }, [ayId, month, initLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month navigation ───────────────────────────────────────────────────────

  const goToPrev = () => {
    const { year, month: m } = prevMonthOf(calYear, month);
    setCalYear(year);
    setMonth(m);
  };

  const goToNext = () => {
    const today = new Date();
    if (calYear === today.getFullYear() && parseInt(month, 10) >= today.getMonth() + 1) return;
    const { year, month: m } = nextMonthOf(calYear, month);
    setCalYear(year);
    setMonth(m);
  };

  const isAtCurrentMonth =
    calYear === now.getFullYear() && parseInt(month, 10) >= now.getMonth() + 1;

  // ── Derived ────────────────────────────────────────────────────────────────

  const classInfo  = classes.find((c) => c.docId === classId);
  const classLabel = classInfo ? `${classInfo.grade}-${classInfo.section}` : "—";
  const selectedDayData = selectedDate ? monthDays[selectedDate] : null;

  // Build student rows for the summary table
  const studentRows = students
    .map((s) => {
      const stats = byStudent[s.id] ?? { present: 0, absent: 0 };
      const total = stats.present + stats.absent;
      return {
        ...s,
        present: stats.present,
        absent:  stats.absent,
        pct:     total > 0 ? Math.round((stats.present / total) * 100) : 0,
        rollNum: parseInt(s.roll ?? s.rollNumber ?? "999", 10),
      };
    })
    .sort((a, b) => a.rollNum - b.rollNum);

  if (initLoading) return <PageLoader label="Loading class attendance…" />;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate("/attendance")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">Class {classLabel}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Attendance detail — read only</p>
        </div>

        {aysList.length > 1 && (
          <select
            value={ayId ?? ""}
            onChange={(e) => {
              setAyId(e.target.value);
              sessionStorage.setItem(AY_SESSION_KEY, e.target.value);
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 shrink-0"
          >
            {aysList.map((ay) => (
              <option key={ay.id} value={ay.id}>
                {ay.year}{ay.status === "active" ? " (Active)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {!ayId ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No academic year found.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: Calendar ── */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={goToPrev}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-gray-700">
                    {MONTH_NAMES[parseInt(month, 10) - 1]} {calYear}
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={isAtCurrentMonth}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {monthLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <ClassMonthCalendar
                    monthData={{ days: monthDays }}
                    calYear={calYear}
                    month={month}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                  />
                )}
              </CardContent>
            </Card>

            {/* Month summary tiles */}
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Working Days" value={workingDays} />
              <MiniStat
                label="Avg Attendance"
                value={`${actPct}%`}
                color={actPct >= 85 ? "text-green-600" : actPct >= 70 ? "text-amber-600" : "text-red-500"}
              />
            </div>
          </div>

          {/* ── Right: Detail ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Day detail */}
            {selectedDate && (
              <DayDetailPanel
                date={selectedDate}
                dayData={selectedDayData}
                students={students}
                teacherMap={teacherMap}
                subjectMap={subjectMap}
                periodMap={periodMap}
                onClose={() => setSelectedDate(null)}
              />
            )}

            {/* Student monthly summary */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Student Attendance — {MONTH_NAMES[parseInt(month, 10) - 1]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Based on {workingDays} recorded days</p>
                </div>

                {monthLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />)}
                  </div>
                ) : studentRows.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">No active students in this class.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <Th>Roll</Th>
                          <Th>Name</Th>
                          <Th right>Present</Th>
                          <Th right>Absent</Th>
                          <Th right>Attendance %</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {studentRows.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-xs font-mono text-gray-400">{row.roll ?? row.rollNumber ?? "—"}</td>
                            <td className="px-4 py-3 text-gray-800 font-medium">{row.fullName}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="flex items-center justify-end gap-1 text-green-600 font-medium">
                                <CheckCircle2 size={13} />
                                {row.present}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="flex items-center justify-end gap-1 text-red-400">
                                <XCircle size={13} />
                                {row.absent}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                row.pct >= 85 ? "bg-green-100 text-green-700"
                                  : row.pct >= 70 ? "bg-amber-100 text-amber-700"
                                  : row.pct > 0  ? "bg-red-100 text-red-600"
                                  : "text-gray-300"
                              }`}>
                                {row.pct > 0 ? `${row.pct}%` : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Teacher Activity Log */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Teacher Activity</p>
                  <p className="text-xs text-gray-400 mt-0.5">All attendance recordings this month — monitoring only</p>
                </div>
                {monthLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />)}
                  </div>
                ) : (
                  <TeacherActivityLog
                    entries={activityLog}
                    teacherMap={teacherMap}
                    subjectMap={subjectMap}
                    periodMap={periodMap}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const MiniStat = ({ label, value, color = "text-gray-800" }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4">
    <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
    <p className={`text-xl font-bold ${color}`}>{value}</p>
  </div>
);

const Th = ({ children, right }) => (
  <th className={`px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100 ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);

export default ClassAttendance;
