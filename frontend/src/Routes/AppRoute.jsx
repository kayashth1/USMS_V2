import Login from "../Pages/auth/LoginPage";
import Dashboard from "../Pages/dashboard/Dashboard";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AdminLayout from "@/components/Layout/AdminLayout";
import SuperAdminLayout from "@/components/Layout/SuperAdminLayout";
import ProtectedRoute from "@/Routes/ProtectedRoute";
import SuperAdminRoute from "@/Routes/SuperAdminRoute";
import SuperAdminDashboard from "@/Pages/superadmin/SuperAdminDashboard";
import SuperAdminSchools from "@/Pages/superadmin/SuperAdminSchools";
import SuperAdminCreateSchool from "@/Pages/superadmin/SuperAdminCreateSchool";
import SuperAdminSchoolDetail from "@/Pages/superadmin/SuperAdminSchoolDetail";
import SuperAdminLibrary from "@/Pages/library/SuperAdminLibrary";

import Notices from "@/Pages/notices/NoticeManagement";
import Teachers from "@/Pages/teachers/Teachers";
import TeacherProfile from "@/Pages/teachers/TeacherProfile";
import Students from "@/Pages/students/Students";
import Attendance from "@/Pages/attendance/Attendance";
import Timetable        from "@/Pages/timetable/Timetable";
import ClassAttendance  from "@/Pages/attendance/ClassAttendance";
import FeesV2 from "@/Pages/fees/FeesV2";
import Alumni from "@/Pages/alumni/Alumni";
import Books from "@/Pages/books/Books";
import Settings from "@/Pages/settings/Settings";
import StudentProfile from "@/Pages/students/StudentProfile";
import Exams from "@/Pages/exams/Exams";
import VehicleTracking from "@/Pages/vehicle/VehicleTracking";
import Promotion from "@/Pages/promotion/Promotion";
import PromotionBatchDetails from "@/Pages/promotion/PromotionBatchDetails";
import AcademicYearRollover from "@/Pages/rollover/AcademicYearRollover";
import Reports from "@/Pages/reports/Reports";

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* ================= PUBLIC ================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        {/* ================= PROTECTED (SUPERADMIN) ================= */}
        <Route
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route path="/superadmin"                      element={<SuperAdminDashboard />} />
          <Route path="/superadmin/schools"              element={<SuperAdminSchools />} />
          <Route path="/superadmin/schools/new"          element={<SuperAdminCreateSchool />} />
          <Route path="/superadmin/schools/:schoolId"    element={<SuperAdminSchoolDetail />} />
          <Route path="/superadmin/library"              element={<SuperAdminLibrary />} />
        </Route>

        {/* ================= PROTECTED (PRINCIPAL) ================= */}
        <Route
          element={
            <ProtectedRoute role="principal">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route
            path="/teachers/:teacherId"
            element={<TeacherProfile />}
          />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:studentId" element={<StudentProfile/>} />
          <Route path="/attendance"            element={<Attendance />} />
          <Route path="/attendance/:classId"  element={<ClassAttendance />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/fees-v2" element={<FeesV2 />} />
          <Route path="/alumni" element={<Alumni />} />
          <Route path="/books" element={<Books />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/vehicle" element={<VehicleTracking />} />
          <Route path="/promotion" element={<Promotion />} />
          <Route path="/promotion/:batchId" element={<PromotionBatchDetails />} />
          <Route path="/academic-rollover" element={<AcademicYearRollover />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default AppRoutes;
