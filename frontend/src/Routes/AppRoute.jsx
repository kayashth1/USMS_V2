import Home from "../Pages/Home/Home";
import Login from "../Pages/auth/LoginPage";
import Dashboard from "../Pages/dashboard/Dashboard";

import { BrowserRouter, Routes, Route } from "react-router-dom";

import AdminLayout from "@/components/Layout/AdminLayout";
import ProtectedRoute from "@/Routes/ProtectedRoute";

import Notices from "@/Pages/notices/NoticeManagement";
import Teachers from "@/Pages/teachers/Teachers";
import TeacherProfile from "@/Pages/teachers/TeacherProfile";
import Students from "@/Pages/students/Students";
import Attendance from "@/Pages/attendance/Attendance";
import Academics from "@/Pages/academics/Academics";
import Timetable from "@/Pages/timetable/Timetable";
import Fees from "@/Pages/fees/Fees";
import Alumni from "@/Pages/alumni/Alumni";
import Books from "@/Pages/books/Books";
import Settings from "@/Pages/settings/Settings";
import StudentProfile from "@/Pages/students/StudentProfile";

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* ================= PUBLIC ================= */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

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
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/academics" element={<Academics />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/alumni" element={<Alumni />} />
          <Route path="/books" element={<Books />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default AppRoutes;
