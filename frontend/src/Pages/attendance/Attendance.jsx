import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { getClassesBySchool } from "@/services/class.service";
import {
  currentMonthStr,
  getAcademicYearsForSchool,
  getSchoolTodayStatus,
  getSchoolMonthlySummary,
} from "@/services/attendance.service";

import TodayOperationalView from "@/components/attendance/TodayOperationalView";
import ClassPerformanceTable from "@/components/attendance/ClassPerformanceTable";

const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_ABBR  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_OPTIONS = [
  { value: "01", label: "January"   }, { value: "02", label: "February"  },
  { value: "03", label: "March"     }, { value: "04", label: "April"     },
  { value: "05", label: "May"       }, { value: "06", label: "June"      },
  { value: "07", label: "July"      }, { value: "08", label: "August"    },
  { value: "09", label: "September" }, { value: "10", label: "October"   },
  { value: "11", label: "November"  }, { value: "12", label: "December"  },
];

const Attendance = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const AY_SESSION_KEY = `attendance_ayId_${schoolId}`;

  const [academicYears,    setAcademicYears]    = useState([]);
  const [selectedAyId,     setSelectedAyId]     = useState(null);
  const [classes,          setClasses]          = useState([]);
  const [todayStatus,      setTodayStatus]      = useState([]);
  const [monthlySummaries, setMonthlySummaries] = useState([]);
  const [selectedMonth,    setSelectedMonth]    = useState(currentMonthStr());
  const [teacherMap,       setTeacherMap]       = useState({});

  const [initLoading,    setInitLoading]    = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId) return;

    const init = async () => {
      const [cls, aysList, teacherSnap] = await Promise.all([
        getClassesBySchool(schoolId),
        getAcademicYearsForSchool(schoolId),
        getDocs(query(collection(db, "teachers"), where("schoolId", "==", schoolId))),
      ]);

      const active = cls.filter((c) => c.isActive !== false);
      setClasses(active);
      setAcademicYears(aysList);

      const tMap = {};
      teacherSnap.forEach((d) => { tMap[d.id] = d.data(); });
      setTeacherMap(tMap);

      const activeAy = aysList.find((ay) => ay.status === "active");
      const storedAyId = sessionStorage.getItem(AY_SESSION_KEY);
      const validStored = storedAyId && aysList.some((ay) => ay.id === storedAyId);
      const ayId = validStored ? storedAyId : (activeAy?.id ?? aysList[0]?.id ?? null);
      setSelectedAyId(ayId);

      if (ayId && active.length > 0) {
        const ids = active.map((c) => c.docId);
        const [today, monthly] = await Promise.all([
          getSchoolTodayStatus(schoolId, ayId, ids),
          getSchoolMonthlySummary(schoolId, ayId, ids, currentMonthStr()),
        ]);
        setTodayStatus(today);
        setMonthlySummaries(monthly);
      }
    };

    init().catch(console.error).finally(() => setInitLoading(false));
  }, [schoolId]);

  // ── Re-fetch monthly summary when month or academic year changes ───────────

  useEffect(() => {
    if (!selectedAyId || classes.length === 0 || initLoading) return;

    const ids = classes.map((c) => c.docId);
    setMonthlyLoading(true);
    getSchoolMonthlySummary(schoolId, selectedAyId, ids, selectedMonth)
      .then(setMonthlySummaries)
      .catch(console.error)
      .finally(() => setMonthlyLoading(false));
  }, [selectedMonth, selectedAyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also re-fetch today's status when academic year changes
  useEffect(() => {
    if (!selectedAyId || classes.length === 0 || initLoading) return;

    const ids = classes.map((c) => c.docId);
    getSchoolTodayStatus(schoolId, selectedAyId, ids)
      .then(setTodayStatus)
      .catch(console.error);
  }, [selectedAyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ──────────────────────────────────────────────────────────

  const recorded    = todayStatus.filter((s) => s.recorded).length;
  const pending     = todayStatus.length - recorded;
  const totalPres   = todayStatus.reduce((sum, s) => sum + s.present, 0);
  const totalAbs    = todayStatus.reduce((sum, s) => sum + s.absent, 0);
  const totalStud   = totalPres + totalAbs;
  const schoolPct   = totalStud > 0 ? Math.round((totalPres / totalStud) * 100) : null;

  const now = new Date();
  const todayLabel = `${DAY_NAMES[now.getDay()]}, ${MONTH_ABBR[now.getMonth()]} ${now.getDate()}`;

  if (initLoading) return <PageLoader label="Loading attendance…" />;

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monitoring &amp; analytics — read only</p>
        </div>

        {academicYears.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400 font-medium">Academic Year</span>
            <select
              value={selectedAyId ?? ""}
              onChange={(e) => {
                setSelectedAyId(e.target.value);
                sessionStorage.setItem(AY_SESSION_KEY, e.target.value);
              }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.year}{ay.status === "active" ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedAyId ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-400">
            No academic year found. Set one in Settings → Academic Year.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Today's Section ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Today</h2>
              <span className="text-xs text-gray-400">{todayLabel}</span>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Total Classes" value={classes.length} />
              <StatTile label="Recorded"      value={recorded}  color="text-green-600" bg="bg-green-50 border-green-100" />
              <StatTile label="Pending"        value={pending}   color="text-amber-600" bg="bg-amber-50 border-amber-100" />
              <StatTile
                label="Present Today"
                value={schoolPct !== null ? `${schoolPct}%` : "—"}
                sub={totalStud > 0 ? `${totalPres} of ${totalStud} students` : "No data yet"}
                color={schoolPct !== null ? (schoolPct >= 75 ? "text-green-600" : "text-red-500") : "text-gray-400"}
              />
            </div>

            {/* Operational class list */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Class Status</p>
                    <p className="text-xs text-gray-400 mt-0.5">Pending classes shown first. Click any class for details.</p>
                  </div>
                  {pending > 0 && (
                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                      {pending} pending
                    </span>
                  )}
                </div>
                <TodayOperationalView
                  status={todayStatus}
                  classes={classes}
                  teacherMap={teacherMap}
                />
              </CardContent>
            </Card>
          </section>

          {/* ── Monthly Performance ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly Performance</h2>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <Card>
              <CardContent className="p-0">
                <ClassPerformanceTable
                  summaries={monthlySummaries}
                  classes={classes}
                  loading={monthlyLoading}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatTile = ({ label, value, sub, color = "text-gray-800", bg = "bg-white border-gray-100" }) => (
  <div className={`rounded-xl border p-4 ${bg}`}>
    <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

export default Attendance;
