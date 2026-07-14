import { useEffect, useState } from "react";
import { PageLoader } from "@/components/ui/spinner";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";

const StudentTable = ({ filters, onStudentClick }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [students, setStudents] = useState([]);
  const [attendanceDays, setAttendanceDays] = useState({});
  const [loading, setLoading] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  /* =======================
     1️⃣ Fetch students
  ======================= */
  useEffect(() => {
    if (!filters.classId) {
      setStudents([]);
      return;
    }

    let cancelled = false;

    const fetchStudents = async () => {
      setLoading(true);

      const q = query(
        collection(db, "students"),
        where("schoolId", "==", schoolId),
        where("classId", "==", filters.classId),
        where("isActive", "==", true)
      );

      const snap = await getDocs(q);

      if (!cancelled) {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    };

    fetchStudents();
    return () => { cancelled = true; };
  }, [filters.classId, schoolId]);

  /* =======================
     2️⃣ Fetch attendance
     - Month → month data
     - Year only → merge all months
  ======================= */
  useEffect(() => {
    if (!filters.classId || !filters.year) {
      setAttendanceDays({});
      return;
    }

    let cancelled = false;

    const fetchAttendance = async () => {
      let mergedDays = {};

      if (filters.month) {
        const ref = doc(
          db,
          "attendance", schoolId,
          "classes", filters.classId,
          "years", filters.year,
          "months", filters.month
        );
        const snap = await getDoc(ref);
        mergedDays = snap.exists() ? snap.data().days || {} : {};
      } else {
        // getDocs already returns each month document with its data —
        // no need to re-fetch each doc individually.
        const monthsSnap = await getDocs(
          collection(
            db,
            "attendance", schoolId,
            "classes", filters.classId,
            "years", filters.year,
            "months"
          )
        );
        for (const m of monthsSnap.docs) {
          mergedDays = { ...mergedDays, ...(m.data().days || {}) };
        }
      }

      if (!cancelled) setAttendanceDays(mergedDays);
    };

    fetchAttendance();
    return () => { cancelled = true; };
  }, [filters.classId, filters.year, filters.month, schoolId]);

  /* =======================
     3️⃣ Calculate percentage
  ======================= */
  const calculatePercentage = (studentId) => {
    const dates = Object.keys(attendanceDays);
    if (dates.length === 0) return "0%";

    let present = 0;
    let total = 0;

    dates.forEach((date) => {
      if (attendanceDays[date]?.[studentId] !== undefined) {
        total++;
        if (attendanceDays[date][studentId] === true) present++;
      }
    });

    if (total === 0) return "0%";
    return `${Math.round((present / total) * 100)}%`;
  };

  if (!filters.classId) {
    return <p className="text-gray-500 text-xl">Select a class to view students Attendance</p>;
  }

  if (loading) {
    return <PageLoader label="Loading students…" />;
  }

 return (
  <>
    <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="border-b px-4 py-3 text-left text-sm font-semibold text-gray-700">
              Roll Number
            </th>
            <th className="border-b px-4 py-3 text-left text-sm font-semibold text-gray-700">
              Name
            </th>
            <th className="border-b px-4 py-3 text-center text-sm font-semibold text-gray-700">
              Attendance % {filters.month ? "(Month)" : "(Year)"}
            </th>
            <th className="border-b px-4 py-3 text-center text-sm font-semibold text-gray-700">
              View Calendar
            </th>
          </tr>
        </thead>

        <tbody>
          {students.length === 0 && (
            <tr>
              <td
                colSpan="4"
                className="px-4 py-6 text-center text-sm text-gray-500"
              >
                No students found
              </td>
            </tr>
          )}

          {students.map((s) => (
            <tr
              key={s.id}
              className="transition hover:bg-gray-50"
            >
              <td className="border-b px-4 py-3 text-sm text-gray-700">
                {s.roll}
              </td>

              <td className="border-b px-4 py-3 text-sm font-medium text-gray-800">
                {s.fullName}
              </td>

              <td className="border-b px-4 py-3 text-center text-sm font-semibold text-gray-800">
                {calculatePercentage(s.id)}
              </td>

              <td className="border-b px-4 py-3 text-center">
                <button
                  onClick={() => {
                    if (!filters.year || !filters.month) {
                      setShowWarning(true);
                      return;
                    }
                    onStudentClick(s);
                  }}
                  className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600 active:scale-95"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* ⚠️ Dialog (no background dimming) */}
    {showWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="w-80 rounded-lg bg-white p-6 text-center shadow-2xl">
          <p className="mb-4 text-sm font-medium text-gray-800">
            Please select both Year and Month
          </p>
          <button
            onClick={() => setShowWarning(false)}
            className="rounded-md bg-blue-500 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            OK
          </button>
        </div>
      </div>
    )}
  </>
);

};

export default StudentTable;
