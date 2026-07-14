import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getCountFromServer } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  GraduationCap, Users, Layers, BookOpen, Bell,
  Calendar, UserPlus, ClipboardList, CalendarDays,
  ChevronRight, School,
} from "lucide-react";

import { getStudentsBySchool } from "@/services/student.service";
import { getRecentNoticesBySchool } from "@/services/notice.service";

const DAYS    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const Dashboard = () => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const navigate = useNavigate();

  const [schoolName, setSchoolName] = useState("");
  const [students,   setStudents]   = useState([]);
  const [counts, setCounts] = useState({ students: 0, teachers: 0, classes: 0, subjects: 0 });
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;

    const load = async () => {
      try {
        // Students fetched in full — needed for recent admissions card.
        // Teachers/classes/subjects use aggregate counts to avoid reading every doc.
        const schoolQ = (col) => query(collection(db, col), where("schoolId", "==", schoolId));

        const [schoolSnap, studentList, teacherCount, classCount, subjectCount, noticeList] =
          await Promise.all([
            getDoc(doc(db, "schools", schoolId)),
            getStudentsBySchool(schoolId),
            getCountFromServer(schoolQ("teachers")),
            getCountFromServer(schoolQ("classes")),
            getCountFromServer(schoolQ("subjects")),
            getRecentNoticesBySchool(schoolId, 4),
          ]);

        setSchoolName(schoolSnap.exists() ? schoolSnap.data().name : "");
        setStudents(studentList);
        setCounts({
          students: studentList.length,
          teachers: teacherCount.data().count,
          classes:  classCount.data().count,
          subjects: subjectCount.data().count,
        });
        setNotices(noticeList);
      } catch (err) {
        console.error("Dashboard load error", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [schoolId]);

  // Recent admissions — top 4 by createdAt, derived from already-fetched students
  const recentAdmissions = [...students]
    .filter((s) => s.createdAt)
    .sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return tb - ta;
    })
    .slice(0, 4);

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" :
    now.getHours() < 17 ? "Good afternoon" : "Good evening";

  const stats = [
    { title: "Total Students",        value: counts.students, icon: GraduationCap, color: "bg-blue-500"   },
    { title: "Total Teachers",        value: counts.teachers, icon: Users,          color: "bg-green-500"  },
    { title: "Total Classes",         value: counts.classes,  icon: Layers,         color: "bg-purple-500" },
    { title: "Total Subjects Offered",value: counts.subjects, icon: BookOpen,       color: "bg-orange-500" },
  ];

  const quickActions = [
    { label: "Add Student",     icon: UserPlus,      path: "/students",   color: "bg-blue-50 text-blue-700 hover:bg-blue-100"     },
    { label: "Add Teacher",     icon: Users,         path: "/teachers",   color: "bg-green-50 text-green-700 hover:bg-green-100"   },
    { label: "Post Notice",     icon: Bell,          path: "/notices",    color: "bg-amber-50 text-amber-700 hover:bg-amber-100"   },
    { label: "Check Attendance", icon: ClipboardList, path: "/attendance", color: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { label: "Class Timetable", icon: CalendarDays,  path: "/timetable",  color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
    { label: "Fee Management",  icon: Calendar,      path: "/fees",       color: "bg-rose-50 text-rose-700 hover:bg-rose-100"      },
  ];

  return (
    <div className="space-y-6">

      {/* ── Greeting header ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{greeting}</p>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {schoolName && <School size={22} className="text-indigo-600" />}
            {schoolName || "Dashboard"}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">
            {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}
          </p>
          <p className="text-xs text-gray-400">{now.getFullYear()}</p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="rounded-xl">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <h2 className="text-2xl font-bold mt-1">
                  {loading ? <span className="text-gray-300">—</span> : stat.value}
                </h2>
              </div>
              <div className={`p-3 rounded-lg text-white ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {quickActions.map(({ label, icon: Icon, path, color }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl text-xs font-medium transition-colors ${color}`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Recent Admissions + Recent Notices ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Admissions */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Recent Admissions</h3>
              <button
                onClick={() => navigate("/students")}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              >
                View all <ChevronRight size={13} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : recentAdmissions.length === 0 ? (
              <div className="text-center py-8">
                <GraduationCap size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No students enrolled yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAdmissions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold shrink-0">
                        {s.fullName?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-700">{s.fullName}</p>
                        <p className="text-xs text-gray-400">{s.classLabel || "—"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">{fmt(s.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Notices */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Recent Notices</h3>
              <button
                onClick={() => navigate("/notices")}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              >
                View all <ChevronRight size={13} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No notices posted yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                        <Bell size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{notice.title}</p>
                        <p className="text-xs text-gray-400">
                          {notice.targetAudience} · {fmt(notice.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 ml-2 capitalize text-xs">
                      {notice.status || "active"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default Dashboard;
