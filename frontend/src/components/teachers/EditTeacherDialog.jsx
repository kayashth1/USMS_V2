import { useEffect, useState } from "react";

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
import { updateTeacher, changeTeacherPassword } from "@/services/teacher.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";
import CustomFieldsForm from "@/components/common/CustomFieldsForm";

const EditTeacherDialog = ({ open, onOpenChange, teacher, onUpdated }) => {
  const schoolId = teacher?.schoolId || localStorage.getItem("principalSchoolId");
  const [loading,      setLoading]      = useState(false);
  const [form,         setForm]         = useState(null);
  const [customValues, setCustomValues] = useState({});
  const [newPwd,       setNewPwd]       = useState("");
  const [showPwd,      setShowPwd]      = useState(false);
  const [pwdLoading,   setPwdLoading]   = useState(false);

  const { defs: customDefs } = useCustomFieldDefs(schoolId, "teacher");

  /* ================= INIT FORM ================= */
  useEffect(() => {
    if (teacher) {
      setForm({
        fullName:    teacher.fullName    || "",
        email:       teacher.email       || "",
        phone:       teacher.phone       || "",
        joiningDate: teacher.joiningDate || "",
        address:     teacher.address     || "",
      });
      setCustomValues(teacher.customFields || {});
    }
  }, [teacher]);

  if (!teacher || !form) return null;

  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6) return alert("Password must be at least 6 characters");
    try {
      setPwdLoading(true);
      await changeTeacherPassword(teacher.id, newPwd);
      setNewPwd("");
      alert("Password updated successfully");
    } catch (err) {
      alert(err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      const missingRequired = customDefs.filter((f) => f.required && !customValues[f.id]?.toString().trim());
      if (missingRequired.length > 0)
        throw new Error(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);

      await updateTeacher(teacher.id, { ...form, customFields: customValues });

      onUpdated();           // 🔥 ADD THIS
      onOpenChange(false);
    } catch (error) {
      console.error("Update teacher error:", error);
      alert("Failed to update teacher");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Teacher</DialogTitle>
        </DialogHeader>

        {/* ===== FORM ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="space-y-1">
            <Label>Full Name</Label>
            <Input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1">
            <Label>Employee ID</Label>
            <Input value={teacher.employeeId} disabled />
          </div>

          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              name="email"
              value={form.email}
              onChange={handleChange}
            />
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

        {/* ===== CHANGE PASSWORD ===== */}
        <div className="border-t pt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Change Password</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPwd ? "text" : "password"}
                placeholder="New password (min 6 chars)"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
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
            <Button
              variant="outline"
              onClick={handleChangePassword}
              disabled={pwdLoading || !newPwd}
            >
              {pwdLoading ? "Updating..." : "Update"}
            </Button>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <DialogFooter className="mt-6">
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

export default EditTeacherDialog;
