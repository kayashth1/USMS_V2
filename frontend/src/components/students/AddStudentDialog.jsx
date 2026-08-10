import { useEffect, useState, useMemo } from "react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { Eye, EyeOff } from "lucide-react";
import { createStudent } from "@/services/student.service";
import { getClassesBySchool } from "@/services/class.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";
import CustomFieldsForm from "@/components/common/CustomFieldsForm";
import {
  getActiveAcademicYear,
  getFixedFeeStructuresForClass, getVariableFeeStructuresOrdered,
  createDraftProfile, updateDraftProfile, activateProfile,
} from "@/fees-v2";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useToast } from "@/components/ui/toast";

const EMPTY_FORM = {
  fullName: "", email: "", password: "", roll: "",
  classId: "", classLabel: "", parentName: "", contact: "",
};

const AddStudentDialog = ({ open, onOpenChange, onSuccess }) => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const { toast } = useToast();

  const [loading,       setLoading]       = useState(false);
  const [showPwd,       setShowPwd]       = useState(false);
  const [classes,       setClasses]       = useState([]);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [customValues,  setCustomValues]  = useState({});

  const { defs: customDefs } = useCustomFieldDefs(schoolId, "student");

  // feeSchedule is still a real school-level default; the academic year
  // must come from the fees-v2 academicYears collection (the id, not just
  // the display string) since that's what createDraftProfile requires.
  const { feeSchedule } = useSchoolSettings(schoolId);
  const [activeYear, setActiveYear] = useState(null);

  // Fee-related state
  const [fixedFees,     setFixedFees]     = useState([]);
  const [variableFees,  setVariableFees]  = useState([]);
  const [selectedVars,  setSelectedVars]  = useState(new Set());

  /* Load classes + variable fees + active year when dialog opens */
  useEffect(() => {
    if (!schoolId || !open) return;
    const load = async () => {
      const [cls, variable, year] = await Promise.all([
        getClassesBySchool(schoolId),
        getVariableFeeStructuresOrdered(schoolId),
        getActiveAcademicYear(schoolId).catch(() => null),
      ]);
      setClasses(cls.filter((c) => c.isActive));
      setVariableFees(variable);
      setActiveYear(year);
    };
    load();
    setForm(EMPTY_FORM);
    setCustomValues({});
    setSelectedVars(new Set());
    setFixedFees([]);
  }, [schoolId, open]);

  /* When class changes, load fixed fees for that class.
   * Fixed fees are not individually optional in the real fee pipeline —
   * createDraftProfile() always snapshots every active fixed structure for
   * the class, so they're shown here as informational, not as checkboxes. */
  useEffect(() => {
    if (!form.classId || !schoolId) { setFixedFees([]); return; }
    getFixedFeeStructuresForClass(schoolId, form.classId).then(setFixedFees);
  }, [form.classId, schoolId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleClassSelect = (docId) => {
    const cls = classes.find((c) => c.docId === docId);
    if (!cls) return;
    setForm((p) => ({ ...p, classId: cls.docId, classLabel: `${cls.grade}-${cls.section}` }));
    setSelectedVars(new Set());
  };

  const totalPerCycle = useMemo(() => {
    const fixedRecurring = fixedFees.filter((f) => !f.isOneTime).reduce((s, f) => s + f.amount, 0);
    const varRecurring   = variableFees.filter((v) => selectedVars.has(v.id) && !v.isOneTime).reduce((s, v) => s + v.amount, 0);
    return fixedRecurring + varRecurring;
  }, [fixedFees, variableFees, selectedVars]);

  const cycleLabel = "mo";
  const hasFeeStructure = fixedFees.length > 0 || variableFees.length > 0;

  const handleSubmit = async () => {
    try {
      if (!schoolId) throw new Error("School context missing. Please login again.");
      if (!form.fullName || !form.email || !form.password || !form.roll || !form.classId)
        throw new Error("Please fill all required fields");

      const missingRequired = customDefs.filter((f) => f.required && !customValues[f.id]?.toString().trim());
      if (missingRequired.length > 0)
        throw new Error(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);

      setLoading(true);

      const result = await createStudent({
        fullName:     form.fullName,
        email:        form.email,
        password:     form.password,
        roll:         form.roll,
        classId:      form.classId,
        classLabel:   form.classLabel,
        parentName:   form.parentName,
        contact:      form.contact,
        schoolId,
        customFields: customValues,
      });

      // Create a fee profile through the real Fees V2 pipeline — this used
      // to call the old fees.service.js, which wrote to a completely
      // different collection (studentFeeYears) that the actual Fees V2
      // admin screen never reads, silently orphaning every new student's
      // fee data. createDraftProfile() always loads every active fixed fee
      // structure for the class itself (that's not caller-selectable in
      // this pipeline); only variable add-ons are a choice here.
      const studentId = result?.uid;
      if (studentId && fixedFees.length > 0) {
        if (!activeYear?.id) {
          throw new Error(
            "Student was created, but no active academic year is configured — " +
            "set one up in Fees V2, then create this student's fee profile manually."
          );
        }
        const profileId = await createDraftProfile({
          studentId,
          academicYearId: activeYear.id,
          schoolId,
          classId:    form.classId,
          classLabel: form.classLabel,
          schedule:   feeSchedule,
        });
        if (selectedVars.size > 0) {
          await updateDraftProfile(profileId, { variableFeeIds: [...selectedVars] });
        }
        await activateProfile(profileId);
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add New Student</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input name="fullName"  placeholder="Student Name *"    value={form.fullName}  onChange={handleChange} />
          <Input name="email"     placeholder="Email *"           value={form.email}     onChange={handleChange} />
          <div className="relative">
            <Input
              name="password"
              type={showPwd ? "text" : "password"}
              placeholder="Password *"
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
          <Input name="roll"      placeholder="Roll Number *"     value={form.roll}      onChange={handleChange} />

          <Select onValueChange={handleClassSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Class & Section *" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((cls) => (
                <SelectItem key={cls.docId} value={cls.docId}>
                  {cls.grade}-{cls.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input name="parentName" placeholder="Parent Name"      value={form.parentName} onChange={handleChange} />
          <Input name="contact"    placeholder="Parent Contact"   value={form.contact}    onChange={handleChange} />

          <CustomFieldsForm
            defs={customDefs}
            values={customValues}
            onChange={(fieldId, value) => setCustomValues((p) => ({ ...p, [fieldId]: value }))}
          />

          {/* ── Fee Setup (shown after class is selected) ── */}
          {form.classId && hasFeeStructure && (
            <div className="border rounded-md p-4 space-y-3 bg-indigo-50/40">
              <p className="text-sm font-medium text-indigo-700">
                Fee Setup — {feeSchedule}{activeYear ? ` · ${activeYear.year}` : ""}
              </p>
              {!activeYear && (
                <p className="text-xs text-amber-600">
                  No active academic year configured — the fee profile can't be created until one is set up in Fees V2.
                </p>
              )}

              {fixedFees.length === 0 ? (
                <p className="text-xs text-amber-600">No fixed fee defined for this class.</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500">Charged automatically for this class:</p>
                  {fixedFees.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 bg-white rounded-md p-2.5 border">
                      <span className="text-sm flex-1">{f.label}</span>
                      {f.isOneTime && (
                        <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">One-time</span>
                      )}
                      <span className="text-sm font-medium">
                        ₹{f.amount?.toLocaleString()}{f.isOneTime ? "" : `/${cycleLabel}`}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {variableFees.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Optional add-ons:</p>
                  {variableFees.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 bg-white rounded-md p-2.5 border">
                      <Checkbox
                        checked={selectedVars.has(v.id)}
                        onCheckedChange={(checked) => setSelectedVars((prev) => {
                          const next = new Set(prev);
                          checked ? next.add(v.id) : next.delete(v.id);
                          return next;
                        })}
                      />
                      <span className="text-sm flex-1">{v.label}</span>
                      {v.isOneTime && (
                        <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">One-time</span>
                      )}
                      <span className="text-sm font-medium">
                        ₹{v.amount?.toLocaleString()}{v.isOneTime ? "" : `/${cycleLabel}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(() => {
                const fixedOneTime = fixedFees.filter((f) => f.isOneTime).reduce((s, f) => s + f.amount, 0);
                const varOneTime   = variableFees.filter((v) => selectedVars.has(v.id) && v.isOneTime).reduce((s, v) => s + v.amount, 0);
                const oneTimeTotal = fixedOneTime + varOneTime;
                return (
                  <div className="pt-1 space-y-1 text-sm font-medium">
                    {totalPerCycle > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total / Month</span>
                        <span className="text-indigo-600">₹{totalPerCycle.toLocaleString()}</span>
                      </div>
                    )}
                    {oneTimeTotal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">One-time Charges</span>
                        <span className="text-purple-600">₹{oneTimeTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Adding..." : "Add Student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddStudentDialog;
