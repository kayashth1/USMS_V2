import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";

import AddStudentDialog from "@/components/students/AddStudentDialog";
import EditStudentDialog from "@/components/students/EditStudentDialog";
import DeleteStudentConfirmDialog from "@/components/students/DeleteStudentConfirmDialog";
import BulkDeleteConfirmDialog from "@/components/students/BulkDeleteConfirmDialog";

import { deleteStudent, getStudentsBySchool } from "@/services/student.service";
import { getClassesBySchool } from "@/services/class.service";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { Eye, Pencil, Trash2, GraduationCap } from "lucide-react";

const Students = () => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [classesMap, setClassesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [currentclass, setCurrentclass] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const loadClasses = async () => {
    const data = await getClassesBySchool(schoolId);
    setClasses(data);
  };
  useEffect(() => {
    if (schoolId) loadClasses();
  }, [schoolId]);

  const filteredAndSortedStudents = useMemo(() => {
    return (
      [...students]
        .filter((s) =>
          currentclass === "all" ? true : s.classId === currentclass
        )
        .filter((s) =>
          s.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => Number(a.roll) - Number(b.roll))
    );
  }, [students, currentclass, searchTerm]);

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      const gradeDiff = Number(a.grade) - Number(b.grade);
      if (gradeDiff !== 0) return gradeDiff;
      return a.section.localeCompare(b.section);
    });
  }, [classes]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const [studentData, classData] = await Promise.all([
        getStudentsBySchool(schoolId),
        getClassesBySchool(schoolId),
      ]);
      setStudents(Array.isArray(studentData) ? studentData : []);
      const map = {};
      (Array.isArray(classData) ? classData : []).forEach((c) => {
        map[c.docId] = `${c.grade}-${c.section}`;
      });
      setClassesMap(map);
    } catch (err) {
      console.error("Failed to fetch students:", err);
      setStudents([]);
      setClassesMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) loadStudents();
  }, [schoolId]);

  // Checkbox helpers
  const allVisibleIds = filteredAndSortedStudents.map((s) => s.id);
  const allChecked =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));
  const someChecked =
    allVisibleIds.some((id) => selectedIds.has(id)) && !allChecked;

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    try {
      setBulkDeleteLoading(true);
      for (const id of selectedIds) {
        await deleteStudent(id);
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadStudents();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student Management</h1>
          <p className="text-gray-500">
            Manage student records and information
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>+ Add Student</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex gap-4">
          <Input
            placeholder="Search by student name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select value={currentclass} onValueChange={setCurrentclass}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sortedClasses.map((c) => (
                <SelectItem key={c.docId} value={c.docId}>
                  {c.grade}-{c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Students Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={allChecked}
                    data-state={someChecked ? "indeterminate" : undefined}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 text-left">Roll</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Parent</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredAndSortedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <GraduationCap size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">No students found</p>
                  </td>
                </tr>
              ) : (
                filteredAndSortedStudents.map((s) => (
                  <tr
                    key={s.id}
                    className={selectedIds.has(s.id) ? "bg-indigo-50" : "hover:bg-gray-50 transition-colors"}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(s.id)}
                        onCheckedChange={() => toggleOne(s.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.roll || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0">
                          {s.fullName?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{s.fullName}</p>
                          <p className="text-xs text-gray-400">{s.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{classesMap[s.classId] || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.parentName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.contact || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-indigo-600"
                          onClick={() => navigate(`/students/${s.id}`)}>
                          <Eye size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-amber-600"
                          onClick={() => { setSelectedStudent(s); setEditOpen(true); }}>
                          <Pencil size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-red-600"
                          onClick={() => { setStudentToDelete(s); setDeleteOpen(true); }}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="p-4 text-sm text-gray-500">
            Showing {filteredAndSortedStudents.length} students
            {selectedIds.size > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {selectedIds.size} selected
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={loadStudents}
      />
      <EditStudentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={selectedStudent}
        onSuccess={loadStudents}
      />
      <DeleteStudentConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        student={studentToDelete}
        loading={deleteLoading}
        onConfirm={async () => {
          try {
            setDeleteLoading(true);
            await deleteStudent(studentToDelete.id);
            loadStudents();
            setDeleteOpen(false);
          } catch (err) {
            alert(err.message);
          } finally {
            setDeleteLoading(false);
          }
        }}
      />
      <BulkDeleteConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        count={selectedIds.size}
        loading={bulkDeleteLoading}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
};

export default Students;
