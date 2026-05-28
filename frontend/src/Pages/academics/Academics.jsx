import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

import PromoteStudentsDialog from "@/components/academics/PromoteStudentsDialog";

import { getClassesBySchool } from "@/services/class.service";
import { getStudentsBySchool } from "@/services/student.service";

const Academics = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cls, stu] = await Promise.all([
        getClassesBySchool(schoolId),
        getStudentsBySchool(schoolId),
      ]);
      setClasses(cls);
      setStudents(stu);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) loadData();
  }, [schoolId]);

  const sortedClasses = useMemo(
    () =>
      [...classes].sort((a, b) => {
        const g = Number(a.grade) - Number(b.grade);
        return g !== 0 ? g : a.section.localeCompare(b.section);
      }),
    [classes]
  );

  const studentCountByClass = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      map[s.classId] = (map[s.classId] || 0) + 1;
    });
    return map;
  }, [students]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Academic Management</h1>
        <p className="text-gray-500">Manage student promotions, results, and grades</p>
      </div>

      <Tabs defaultValue="upgrade">
        <TabsList>
          <TabsTrigger value="upgrade">Class Promotion</TabsTrigger>
          <TabsTrigger value="results">Results Management</TabsTrigger>
          <TabsTrigger value="grades">Grade Configuration</TabsTrigger>
        </TabsList>

        {/* ── CLASS PROMOTION ── */}
        <TabsContent value="upgrade" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Student Class Promotion</h2>
              <p className="text-sm text-gray-500">
                Promote students to the next class. History is preserved on each student record.
              </p>
            </div>
            <Button onClick={() => setPromoteOpen(true)}>⬆️ Promote Students</Button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading classes...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {sortedClasses.map((cls) => {
                const count = studentCountByClass[cls.docId] || 0;
                return (
                  <Card key={cls.docId}>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          Class {cls.grade}-{cls.section}
                        </h3>
                        <span className="text-indigo-600">⬆️</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Students</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => setPromoteOpen(true)}
                      >
                        Promote from this class
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── RESULTS (placeholder) ── */}
        <TabsContent value="results">
          <Card>
            <CardContent className="p-6 text-gray-500">
              Results Management will be implemented in a future update.
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GRADE CONFIGURATION ── */}
        <TabsContent value="grades" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Grade Configuration</h2>
            <p className="text-sm text-gray-500">Configure grading system and score ranges</p>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Grade</th>
                  <th className="text-left px-4 py-3 font-medium">Min Score</th>
                  <th className="text-left px-4 py-3 font-medium">Max Score</th>
                  <th className="text-left px-4 py-3 font-medium">Color</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { grade: "A+", min: 90, max: 100, color: "bg-green-500" },
                  { grade: "A",  min: 80, max: 89,  color: "bg-blue-500" },
                  { grade: "B+", min: 70, max: 79,  color: "bg-yellow-400" },
                  { grade: "B",  min: 60, max: 69,  color: "bg-orange-500" },
                  { grade: "C",  min: 50, max: 59,  color: "bg-red-400" },
                  { grade: "F",  min: 0,  max: 49,  color: "bg-red-600" },
                ].map((row) => (
                  <tr key={row.grade}>
                    <td className="px-4 py-3 font-medium">{row.grade}</td>
                    <td className="px-4 py-3">
                      <Input className="w-20" defaultValue={row.min} />
                    </td>
                    <td className="px-4 py-3">
                      <Input className="w-20" defaultValue={row.max} />
                    </td>
                    <td className="px-4 py-3">
                      <div className={`w-6 h-6 rounded ${row.color}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button>Save Configuration</Button>
        </TabsContent>
      </Tabs>

      <PromoteStudentsDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        onSuccess={loadData}
      />
    </div>
  );
};

export default Academics;
