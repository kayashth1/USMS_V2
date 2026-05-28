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

import { Plus, Mail, Phone, Pencil, Trash2 } from "lucide-react";

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

  if (loading) {
    return <div className="p-6 text-gray-500">Loading teachers...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Teacher Management</h1>
          <p className="text-gray-500">
            Manage teachers associated with your school
          </p>
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
      {visibleTeachers.length === 0 ? (
        <p className="text-gray-500">No teachers found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {visibleTeachers.map((teacher) => {
            const isSelected = selectedIds.has(teacher.id);
            return (
              <Card
                key={teacher.id}
                className={isSelected ? "ring-2 ring-red-400" : ""}
              >
                <CardContent className="p-6 space-y-4">
                  {/* Header row with checkbox */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(teacher.id)}
                      />
                      <h3 className="font-semibold">{teacher.fullName}</h3>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <Mail size={14} />
                      {teacher.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} />
                      {teacher.phone || "-"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between pt-2">
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/teachers/${teacher.id}`)}
                    >
                      View Profile
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedTeacher(teacher);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => {
                          setTeacherToDelete(teacher);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
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
