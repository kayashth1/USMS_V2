import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { getTimePeriodsBySchool } from "@/services/timePeriod.service";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat",
};

// Flatten byClass map into a period grid: { [day]: { [periodId]: { className, subjectName } } }
const buildGrid = (byClass) => {
  const grid = {};
  for (const [, classData] of Object.entries(byClass || {})) {
    const { className, ...daySlots } = classData;
    const hasSlots = DAYS.some((d) => (daySlots[d] || []).length > 0);
    if (!hasSlots) continue;
    for (const day of DAYS) {
      for (const slot of (daySlots[day] || [])) {
        if (!grid[day]) grid[day] = {};
        grid[day][slot.periodId] = { className, subjectName: slot.subjectName };
      }
    }
  }
  return grid;
};

const TeacherTimetableTab = ({ teacherId, schoolId }) => {
  const [byClass, setByClass] = useState({});
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId || !schoolId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [snap] = await Promise.all([
          getDoc(doc(db, "teacherTimetables", teacherId)),
          getTimePeriodsBySchool(schoolId).then((p) => { if (!cancelled) setPeriods(p); }),
        ]);
        if (!cancelled) setByClass(snap.exists() ? (snap.data().byClass ?? {}) : {});
      } catch (err) {
        console.error("Failed to load timetable", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [teacherId, schoolId]);

  if (loading) return <PageLoader label="Loading timetable…" />;

  const grid = buildGrid(byClass);
  const isEmpty = Object.keys(grid).length === 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Weekly Timetable</h2>
          <p className="text-xs text-gray-400">Auto-generated from class timetables</p>
        </div>

        {isEmpty ? (
          <div className="text-center py-12 space-y-1">
            <p className="text-sm text-gray-500">No timetable assigned yet.</p>
            <p className="text-xs text-gray-400">
              Set the class timetable from the Timetable page — this view updates automatically.
            </p>
          </div>
        ) : periods.length === 0 ? (
          <p className="text-sm text-gray-500">No time periods defined.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b w-32">
                    Period
                  </th>
                  {DAYS.map((d) => (
                    <th key={d} className="px-3 py-2 text-center font-medium text-gray-600 border-b">
                      {DAY_LABELS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {periods.map((period) => (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-r">
                      <p className="font-medium text-xs">{period.name}</p>
                      <p className="text-xs text-gray-400">{period.from} – {period.to}</p>
                    </td>
                    {DAYS.map((day) => {
                      const cell = grid[day]?.[period.id];
                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          {cell ? (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1 text-xs space-y-0.5 inline-block min-w-16">
                              <p className="font-medium text-indigo-700">{cell.subjectName}</p>
                              <p className="text-gray-500">Class {cell.className}</p>
                            </div>
                          ) : (
                            <span className="text-gray-200 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeacherTimetableTab;
