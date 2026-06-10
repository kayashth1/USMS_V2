import { getTeachersBySchool, deleteTeacher } from "@/services/teacher.service";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import EditTeacherDialog from "@/components/teachers/EditTeacherDialog";
import AddTeacherDialog from "@/components/teachers/AddTeacherDialog";
import DeleteTeacherDialog from "@/components/teachers/DeleteTeacherDialog";
import BulkDeactivateDialog from "@/components/teachers/BulkDeactivateDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Plus, Mail, Phone, Pencil, Trash2, Users } from "lucide-react";

const Teachers = () => {
  const navigate = useNavigate();

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);

  // Bulk deactivate state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const schoolId = localStorage.getItem("principalSchoolId");

  const reloadTeachers = async () => {
    try {
      setLoading(true);
      if (!schoolId) { setTeachers([]); return; }
      const data = await getTeachersBySchool(schoolId);
      setTeachers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching teachers:", error);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reloadTeachers(); }, [schoolId]);

  const activeTeachers = teachers.filter((t) => t.isActive !== false);

  const visibleTeachers = (tab === "active" ? activeTeachers : teachers).filter(
    (t) => t.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    try {
      setBulkLoading(true);
      for (const id of selectedIds) {
        await deleteTeacher(id);
      }
      setSelectedIds(new Set());
      setBulkOpen(false);
      reloadTeachers();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Teacher Management</h1>
          <p className="text-gray-500">Manage teachers associated with your school</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkOpen(true)}>
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            Add Teacher
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Search teachers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedIds(new Set()); }}>
        <TabsList>
          <TabsTrigger value="all">All ({teachers.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeTeachers.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Teacher Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                </div>
                <div className="h-8 bg-gray-100 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visibleTeachers.length === 0 ? (
        <div className="text-center py-16">
          <Users size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-sm">No teachers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {visibleTeachers.map((teacher) => {
            const isSelected = selectedIds.has(teacher.id);
            const initials = teacher.fullName
              ?.split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 2) ?? "T";
            return (
              <Card
                key={teacher.id}
                className={isSelected ? "ring-2 ring-indigo-400" : "hover:shadow-md transition-shadow"}
              >
                <CardContent className="p-6 space-y-4">
                  {/* Avatar + name + checkbox */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(teacher.id)}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{teacher.fullName}</h3>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          teacher.isActive !== false
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {teacher.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="text-sm text-gray-500 space-y-1">
                    <div className="flex items-center gap-2 truncate">
                      <Mail size={13} className="shrink-0" />
                      <span className="truncate">{teacher.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="shrink-0" />
                      {teacher.phone || "—"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between items-center pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => navigate(`/teachers/${teacher.id}`)}
                    >
                      View Profile
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-400 hover:text-amber-600"
                        onClick={() => { setSelectedTeacher(teacher); setEditOpen(true); }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={() => { setTeacherToDelete(teacher); setDeleteOpen(true); }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <AddTeacherDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={reloadTeachers} />
      <EditTeacherDialog open={editOpen} onOpenChange={setEditOpen} teacher={selectedTeacher} onUpdated={reloadTeachers} />
      <DeleteTeacherDialog open={deleteOpen} onOpenChange={setDeleteOpen} teacher={teacherToDelete} onDeleted={reloadTeachers} />
      <BulkDeactivateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selectedIds.size}
        loading={bulkLoading}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
};

export default Teachers;
