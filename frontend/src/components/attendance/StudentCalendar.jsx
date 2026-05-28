import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const StudentCalendar = ({ student, filters, onClose }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch attendance when opened or filters change
  useEffect(() => {
    if (!student || !filters.classId) return;

    const fetchAttendance = async () => {
      setLoading(true);

      const ref = doc(
        db,
        "attendance",
        schoolId,
        "classes",
        filters.classId,
        "years",
        filters.year,
        "months",
        filters.month
      );

      const snap = await getDoc(ref);
      setDays(snap.exists() ? snap.data().days || {} : {});
      setLoading(false);
    };

    fetchAttendance();
  }, [
    student?.id,
    filters.year,
    filters.month,
    filters.classId,
    schoolId,
  ]);

  const year = Number(filters.year);
  const monthIndex = Number(filters.month) - 1;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = new Date(year, monthIndex, 1).getDay();

  /* ✅ NEW: current month detection */
  const today = new Date();
  const isCurrentMonth =
    year === today.getFullYear() &&
    monthIndex === today.getMonth();

  const currentDate = today.getDate();

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Modal */}
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {student.fullName}
          </h2>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-lg"
          >
            ✕
          </button>
        </div>

        {/* Week day header */}
        <div className="mb-2 grid grid-cols-7 text-center text-sm font-medium text-gray-600">
          {WEEK_DAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500" />
          </div>
        )}

        {/* Calendar */}
        {!loading && (
          <div className="grid grid-cols-7 gap-2">
            {/* Empty slots before day 1 */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNumber = i + 1;

              /* ✅ NEW: hide future dates if current month */
              if (isCurrentMonth && dayNumber > currentDate) {
                return null;
              }

              const day = String(dayNumber).padStart(2, "0");
              const date = `${filters.year}-${filters.month}-${day}`;
              const status = days[date]?.[student.id];

              let cls = "bg-gray-100 text-gray-800";
              if (status === true)
                cls = "bg-green-500 text-white";
              if (status === false)
                cls = "bg-red-500 text-white";

              return (
                <div
                  key={date}
                  className={`flex h-10 items-center justify-center rounded text-sm font-medium ${cls}`}
                >
                  {dayNumber}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCalendar;
