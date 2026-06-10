import { useState, useEffect } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { updateStudent } from "@/services/student.service";
import { getClassesBySchool } from "@/services/class.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";
import CustomFieldsForm from "@/components/common/CustomFieldsForm";

const EditStudentDialog = ({ open, onOpenChange, student, onSuccess }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [loading,      setLoading]      = useState(false);
  const [classes,      setClasses]      = useState([]);
  const [form,         setForm]         = useState(null);
  const [customValues, setCustomValues] = useState({});

  const { defs: customDefs } = useCustomFieldDefs(schoolId, "student");

  /* ================= INIT FORM ================= */
  useEffect(() => {
    if (!student) return;

    setForm({
      fullName:   student.fullName   || "",
      roll:       student.roll       || "",
      classId:    student.classId    || "",
      parentName: student.parentName || "",
      contact:    student.contact    || "",
    });
    setCustomValues(student.customFields || {});
  }, [student]);

  /* ================= LOAD CLASSES ================= */
  useEffect(() => {
    if (!schoolId) return;

    const loadClasses = async () => {
      try {
        const data = await getClassesBySchool(schoolId);
        setClasses(
          Array.isArray(data)
            ? data.filter((c) => c.isActive !== false)
            : []
        );
      } catch (err) {
        console.error("Failed to load classes:", err);
        setClasses([]);
      }
    };

    loadClasses();
  }, [schoolId]);

  if (!open || !student || !form) return null;

  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSave = async () => {
    try {
      if (!form.fullName || !form.roll || !form.classId) {
        throw new Error("Please fill all required fields");
      }

      setLoading(true);

      const missingRequired = customDefs.filter((f) => f.required && !customValues[f.id]?.toString().trim());
      if (missingRequired.length > 0)
        throw new Error(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);

      await updateStudent(student.id, {
        fullName:     form.fullName,
        roll:         form.roll,
        classId:      form.classId,
        parentName:   form.parentName,
        contact:      form.contact,
        customFields: customValues,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      alert(err.message || "Failed to update student");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Student Name</label>
            <Input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
            />
          </div>

          {/* Class */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Class</label>
            <Select
              value={form.classId}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, classId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.docId} value={c.docId}>
                    {c.grade}-{c.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Roll */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Roll Number</label>
            <Input
              name="roll"
              value={form.roll}
              onChange={handleChange}
            />
          </div>

          {/* Parent */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Parent Name</label>
            <Input
              name="parentName"
              value={form.parentName}
              onChange={handleChange}
            />
          </div>

          {/* Contact */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Parent Contact</label>
            <Input
              name="contact"
              value={form.contact}
              onChange={handleChange}
            />
          </div>

          <CustomFieldsForm
            defs={customDefs}
            values={customValues}
            onChange={(fieldId, value) => setCustomValues((p) => ({ ...p, [fieldId]: value }))}
          />

          {/* Email (read-only) */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <Input value={student.email} disabled />
            <p className="text-xs text-gray-500">
              Email cannot be changed (login credential)
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditStudentDialog;
