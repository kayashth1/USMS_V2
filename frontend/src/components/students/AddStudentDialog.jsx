import { useEffect, useState, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { createStudent } from "@/services/student.service";
import { getClassesBySchool } from "@/services/class.service";
import {
  getFixedFeeStructures, getVariableFeeStructures,
  createStudentFeeProfile, currentAcademicYear,
} from "@/services/fees.service";

const EMPTY_FORM = {
  fullName: "", email: "", password: "", roll: "",
  classId: "", classLabel: "", parentName: "", contact: "",
};

const AddStudentDialog = ({ open, onOpenChange, onSuccess }) => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [loading,   setLoading]   = useState(false);
  const [classes,   setClasses]   = useState([]);
  const [form,      setForm]      = useState(EMPTY_FORM);

  // Fee-related state
  const [feeSchedule,     setFeeScheduleState] = useState("monthly");
  const [feeAcademicYear, setFeeAcademicYear]  = useState(currentAcademicYear());
  const [fixedFees,       setFixedFees]        = useState([]);
  const [variableFees,    setVariableFees]     = useState([]);
  const [selectedVars,    setSelectedVars]     = useState(new Set());

  /* Load classes + fee settings when dialog opens */
  useEffect(() => {
    if (!schoolId || !open) return;
    const load = async () => {
      const [cls, schoolSnap, variable] = await Promise.all([
        getClassesBySchool(schoolId),
        getDoc(doc(db, "schools", schoolId)),
        getVariableFeeStructures(schoolId),
      ]);
      setClasses(cls.filter((c) => c.isActive));
      setVariableFees(variable);
      if (schoolSnap.exists()) {
        const sd = schoolSnap.data();
        if (sd.feeSchedule)     setFeeScheduleState(sd.feeSchedule);
        if (sd.feeAcademicYear) setFeeAcademicYear(sd.feeAcademicYear);
      }
    };
    load();
    setForm(EMPTY_FORM);
    setSelectedVars(new Set());
    setFixedFees([]);
  }, [schoolId, open]);

  /* When class changes, load fixed fee for that class */
  useEffect(() => {
    if (!form.classId || !schoolId) { setFixedFees([]); return; }
    getFixedFeeStructures(schoolId).then((fees) => {
      setFixedFees(fees.filter((f) => f.classId === form.classId));
    });
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

  const fixedFee = fixedFees[0] || null;

  const totalPerCycle = useMemo(() => {
    return (fixedFee?.amount || 0) +
      variableFees.filter((v) => selectedVars.has(v.id) && !v.isOneTime).reduce((s, v) => s + v.amount, 0);
  }, [fixedFee, variableFees, selectedVars]);

  const cycleLabel = "mo";
  const hasFeeStructure = fixedFee || variableFees.length > 0;

  const handleSubmit = async () => {
    try {
      if (!schoolId) throw new Error("School context missing. Please login again.");
      if (!form.fullName || !form.email || !form.password || !form.roll || !form.classId)
        throw new Error("Please fill all required fields");

      setLoading(true);

      const result = await createStudent({
        fullName:   form.fullName,
        email:      form.email,
        password:   form.password,
        roll:       form.roll,
        classId:    form.classId,
        classLabel: form.classLabel,
        parentName: form.parentName,
        contact:    form.contact,
        schoolId,
      });

      // Create fee profile if fee structures are defined
      const studentId = result?.uid;
      if (studentId && (fixedFee || selectedVars.size > 0)) {
        const items = [];
        if (fixedFee) items.push({ structureId: fixedFee.id, label: fixedFee.label, amount: fixedFee.amount, type: "fixed" });
        for (const id of selectedVars) {
          const v = variableFees.find((x) => x.id === id);
          if (v) items.push({ structureId: v.id, label: v.label, amount: v.amount, type: "variable", isOneTime: v.isOneTime || false });
        }
        if (items.length > 0) {
          await createStudentFeeProfile({
            studentId,
            studentName: form.fullName,
            classId:     form.classId,
            classLabel:  form.classLabel,
            schoolId,
            academicYear: feeAcademicYear,
            schedule:     feeSchedule,
            items,
          });
        }
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      alert(err.message);
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
          <Input name="password"  type="password" placeholder="Password *" value={form.password} onChange={handleChange} />
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

          {/* ── Fee Setup (shown after class is selected) ── */}
          {form.classId && hasFeeStructure && (
            <div className="border rounded-md p-4 space-y-3 bg-indigo-50/40">
              <p className="text-sm font-medium text-indigo-700">
                Fee Setup — {feeSchedule} · {feeAcademicYear}
              </p>

              {fixedFee ? (
                <div className="flex items-center gap-3 bg-white rounded-md p-2.5 border">
                  <Checkbox checked disabled />
                  <span className="text-sm flex-1">{fixedFee.label} (auto)</span>
                  <span className="text-sm font-medium">₹{fixedFee.amount?.toLocaleString()}/{cycleLabel}</span>
                </div>
              ) : (
                <p className="text-xs text-amber-600">No fixed fee defined for this class.</p>
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
                const oneTimeTotal = variableFees.filter((v) => selectedVars.has(v.id) && v.isOneTime).reduce((s, v) => s + v.amount, 0);
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
