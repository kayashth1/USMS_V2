import { useEffect, useState } from "react";
import AttendanceFilters from "../../components/attendance/AttendanceFilters";
import StudentTable from "../../components/attendance/StudentTable";
import StudentCalendar from "../../components/attendance/StudentCalendar";

const AttendancePage = () => {
  const [filters, setFilters] = useState({
    year: "",
    month: "",
    classId: "",
  });

  const [selectedStudent, setSelectedStudent] = useState(null);

  /* =======================
     RESET YEAR & MONTH
     WHEN CLASS CHANGES
  ======================= */
  useEffect(() => {
    if (filters.classId) {
      setFilters((prev) => ({
        ...prev,
        year: "",
        month: "",
      }));
    }
  }, [filters.classId]);

  return (
    <div style={{ padding: 20 }}>
     <h2 className="mb-6 text-center text-2xl font-semibold text-gray-800">
  Attendance
</h2>


      <AttendanceFilters
        filters={filters}
        setFilters={setFilters}
      />

      <StudentTable
        filters={filters}
        onStudentClick={setSelectedStudent}
      />

      {selectedStudent && (
        <StudentCalendar
          student={selectedStudent}
          filters={filters}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
};

export default AttendancePage;
