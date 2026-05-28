import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  GraduationCap,
  Users,
  Layers,
  BookOpen,
  Bell,
  Plus,
  Calendar,
  UserPlus,
} from "lucide-react";

import { getStudentsBySchool } from "@/services/student.service";
import { getTeachersBySchool } from "@/services/teacher.service";
import { getClassesBySchool } from "@/services/class.service";
import { getSubjectsBySchool } from "@/services/subject.service";
import { getRecentNoticesBySchool } from "@/services/notice.service";

const Dashboard = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [counts, setCounts] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0,
  });

  const [notices, setNotices] = useState([]);

  /* ================= FETCH COUNTS ================= */
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [students, teachers, classes, subjects] =
          await Promise.all([
            getStudentsBySchool(schoolId),
            getTeachersBySchool(schoolId),
            getClassesBySchool(schoolId),
            getSubjectsBySchool(schoolId),
          ]);

        setCounts({
          students: students.length,
          teachers: teachers.length,
          classes: classes.length,
          subjects: subjects.length,
        });
      } catch (err) {
        console.error("Failed to fetch dashboard counts", err);
      }
    };

    if (schoolId) fetchCounts();
  }, [schoolId]);

  /* ================= FETCH RECENT NOTICES ================= */
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const data = await getRecentNoticesBySchool(schoolId, 4);
        setNotices(data);
      } catch (err) {
        console.error("Failed to fetch notices", err);
      }
    };

    if (schoolId) fetchNotices();
  }, [schoolId]);

  const stats = [
    {
      title: "Total Students",
      value: counts.students,
      icon: GraduationCap,
      color: "bg-blue-500",
    },
    {
      title: "Total Teachers",
      value: counts.teachers,
      icon: Users,
      color: "bg-green-500",
    },
    {
      title: "Total Classes",
      value: counts.classes,
      icon: Layers,
      color: "bg-purple-500",
    },
    {
      title: "Total Subjects Offered",
      value: counts.subjects,
      icon: BookOpen,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ================= STATS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="rounded-xl">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {stat.title}
                </p>
                <h2 className="text-2xl font-bold mt-1">
                  {stat.value}
                </h2>
              </div>

              <div className={`p-3 rounded-lg text-white ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ================= NOTICES ================= */}
      <div className="">
        {/* ----------- RECENT NOTICES ----------- */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Recent Notices</h3>
              <Button variant="link" className="p-0">
                View All
              </Button>
            </div>

            <div className="space-y-4">
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="flex justify-between items-center bg-muted/50 rounded-lg p-4"
                >
                  <div className="flex gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                      <Bell size={18} />
                    </div>

                    <div>
                      <p className="font-medium">{notice.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {notice.targetAudience} •{" "}
                        {notice.createdAt?.toDate?.().toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <Badge variant="secondary">
                    {notice.status || "active"}
                  </Badge>
                </div>
              ))}

              {notices.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No notices found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


export default Dashboard;
