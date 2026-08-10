import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Eye, EyeOff } from "lucide-react";
import { createTeacher } from "@/services/teacher.service";
import { useToast } from "@/components/ui/toast";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";
import CustomFieldsForm from "@/components/common/CustomFieldsForm";

const AddTeacherDialog = ({ open, onOpenChange, onSuccess }) => {
  const { toast } = useToast();
  const [loading,      setLoading]      = useState(false);
  const [customValues, setCustomValues] = useState({});
  const [showPwd,      setShowPwd]      = useState(false);

  const schoolId = localStorage.getItem("principalSchoolId");
  const { defs: customDefs } = useCustomFieldDefs(schoolId, "teacher");

  const initialForm = {
    fullName: "",
    employeeId: "",
    email: "",
    password: "",
    phone: "",
    joiningDate: "",
    address: "",
  };

  const [form, setForm] = useState(initialForm);

  /* ================= HANDLE CHANGE ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* ================= CREATE TEACHER ================= */
  const handleAddTeacher = async () => {
    try {
      if (!schoolId) {
        throw new Error("School context missing. Please login again.");
      }

      if (!form.fullName || !form.email || !form.password) {
        throw new Error("Full name, email and password are required.");
      }

      const missingRequired = customDefs.filter((f) => f.required && !customValues[f.id]?.toString().trim());
      if (missingRequired.length > 0)
        throw new Error(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);

      setLoading(true);

      // 🔒 Trim + send only valid data
      await createTeacher({
        fullName:     form.fullName.trim(),
        employeeId:   form.employeeId.trim(),
        email:        form.email.trim(),
        password:     form.password,
        phone:        form.phone.trim(),
        joiningDate:  form.joiningDate,
        address:      form.address.trim(),
        schoolId,
        customFields: customValues,
      });

      setForm(initialForm);
      setCustomValues({});
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Create teacher error:", error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Teacher</DialogTitle>
        </DialogHeader>

        {/* ===== FORM ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="space-y-1">
            <Label>Full Name *</Label>
            <Input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1">
            <Label>Employee ID</Label>
            <Input
              name="employeeId"
              value={form.employeeId}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1">
            <Label>Email *</Label>
            <Input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1">
            <Label>Password *</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={handleChange}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Phone</Label>
            <Input
              name="phone"
              value={form.phone}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1">
            <Label>Joining Date</Label>
            <Input
              type="date"
              name="joiningDate"
              value={form.joiningDate}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Address</Label>
            <Input
              name="address"
              value={form.address}
              onChange={handleChange}
            />
          </div>

        </div>

        <CustomFieldsForm
          defs={customDefs}
          values={customValues}
          onChange={(fieldId, value) => setCustomValues((p) => ({ ...p, [fieldId]: value }))}
        />

        {/* ===== FOOTER ===== */}
        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleAddTeacher} disabled={loading}>
            {loading ? "Adding..." : "Add Teacher"}
          </Button>
        </DialogFooter>

        <p className="text-xs text-gray-500 mt-2">
          * Teacher will be automatically assigned to your school.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AddTeacherDialog;
