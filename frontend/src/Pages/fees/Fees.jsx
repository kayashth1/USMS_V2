import { Fragment, useEffect, useState, useMemo } from "react";
import jsPDF from "jspdf";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageLoader, InlineLoader, Spinner } from "@/components/ui/spinner";
import ManageStudentFeesDialog from "@/components/fees/ManageStudentFeesDialog";

import { getClassesBySchool } from "@/services/class.service";
import { invalidateSchoolSettingsCache } from "@/hooks/useSchoolSettings";
import { getStudentsBySchool } from "@/services/student.service";
import {
  getFixedFeeStructures, getVariableFeeStructures,
  addFeeStructure, updateFeeStructure, deleteFeeStructure,
  getStudentFeeProfiles, createStudentFeeProfile,
  getFeePaymentsByStudent, getFeePaymentsBySchool,
  getStudentFeeYearsAll,
  recordPayment, closePeriod,
  generatePeriods, formatPeriod, currentAcademicYear,
} from "@/services/fees.service";

const STATUS_COLORS = {
  paid:    "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  pending: "bg-red-100 text-red-700",
};

const EMPTY_FIXED = { classId: "", label: "Tuition Fee", amount: "", isOneTime: false, chargedDuringHolidays: true };
const EMPTY_VAR   = { label: "", amount: "", isOneTime: false, chargedDuringHolidays: true };

const downloadReceipt = (data) => {
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  const cx  = 74; // center x of A5

  // Header
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("Fee Receipt", cx, 24, { align: "center" });

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(150, 150, 150);
  pdf.text(data.receiptNo, cx, 31, { align: "center" });

  pdf.setDrawColor(200, 200, 200);
  pdf.line(14, 36, 134, 36);

  // Rows
  const rows = [
    ["Student",      data.studentName],
    ["Class",        data.classLabel],
    ["Period",       data.period],
    ...(data.carryForward > 0 ? [
      ["Regular Fee",   `Rs. ${Number(data.regularAmount).toLocaleString("en-IN")}`],
      ["Carry Forward", `Rs. ${Number(data.carryForward).toLocaleString("en-IN")}`],
    ] : []),
    ["Amount Paid",  `Rs. ${Number(data.amount).toLocaleString("en-IN")}`],
    ["Date",         data.date],
    ...(data.collectedBy ? [["Collected By", data.collectedBy]] : []),
  ];

  let y = 48;
  rows.forEach(([label, value]) => {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 120, 120);
    pdf.text(label, 18, y);

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(value), 75, y);

    pdf.setDrawColor(235, 235, 235);
    pdf.line(14, y + 4, 134, y + 4);
    y += 13;
  });

  // Footer
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 180, 180);
  pdf.text("This is a computer-generated receipt.", cx, y + 8, { align: "center" });

  pdf.save(`receipt-${data.receiptNo}.pdf`);
};

/* ══════════════════════════════════════════════════════ */

const Fees = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  // School fee settings
  const [feeSchedule,     setFeeSchedule]     = useState("monthly");
  const [feeAcademicYear, setFeeAcademicYear] = useState(currentAcademicYear());
  const [savingSettings,  setSavingSettings]  = useState(false);

  // Reference data
  const [classes,      setClasses]      = useState([]);
  const [students,     setStudents]     = useState([]);
  const [fixedFees,    setFixedFees]    = useState([]);
  const [variableFees, setVariableFees] = useState([]);
  const [feeProfiles,  setFeeProfiles]  = useState({}); // { studentId: profile }
  const [loading,      setLoading]      = useState(true);

  // Student Fees tab
  const [searchName,        setSearchName]        = useState("");
  const [filterClass,       setFilterClass]        = useState("all");
  const [expandedId,        setExpandedId]         = useState(null);
  const [expandedPays,      setExpandedPays]       = useState([]);
  const [expandedYears,     setExpandedYears]      = useState([]);
  const [loadingPays,       setLoadingPays]        = useState(false);
  const [showClosedHistory, setShowClosedHistory]  = useState(false);

  // Reports tab
  const [allPayments,      setAllPayments]      = useState([]);
  const [reportsLoaded,    setReportsLoaded]    = useState(false);
  const [reportSearch,      setReportSearch]      = useState("");
  const [reportFilterClass, setReportFilterClass] = useState("all");

  // Close period dialog
  const [closeDialogOpen,  setCloseDialogOpen]  = useState(false);
  const [closePeriodValue, setClosePeriodValue] = useState("");
  const [closingPeriod,    setClosingPeriod]    = useState(false);

  // ── Fee structure dialogs ──
  const [fixedOpen,   setFixedOpen]   = useState(false);
  const [editFixed,   setEditFixed]   = useState(null);
  const [fixedForm,   setFixedForm]   = useState(EMPTY_FIXED);
  const [fixedSaving, setFixedSaving] = useState(false);

  const [varOpen,   setVarOpen]   = useState(false);
  const [editVar,   setEditVar]   = useState(null);
  const [varForm,   setVarForm]   = useState(EMPTY_VAR);
  const [varSaving, setVarSaving] = useState(false);

  // ── Setup fees dialog ──
  const [setupOpen,     setSetupOpen]     = useState(false);
  const [setupStudent,  setSetupStudent]  = useState(null);
  const [setupVars,     setSetupVars]     = useState(new Set());
  const [setupSaving,   setSetupSaving]   = useState(false);

  // ── Manage fees dialog (mid-year changes) ──
  const [manageOpen,    setManageOpen]    = useState(false);
  const [manageStudent, setManageStudent] = useState(null);

  // Holiday months for this school
  const [holidayMonths, setHolidayMonths] = useState([]);

  // ── Collect payment dialog ──
  const [collectOpen,    setCollectOpen]    = useState(false);
  const [collectPayment, setCollectPayment] = useState(null);
  const [collectMode,    setCollectMode]    = useState("full");
  const [collectAmount,  setCollectAmount]  = useState("");
  const [collectBy,      setCollectBy]      = useState("");
  const [collectNotes,   setCollectNotes]   = useState("");
  const [collectSaving,  setCollectSaving]  = useState(false);

  // ── Receipt dialog (shown after payment) ──
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  /* ── Load initial data ── */
  const loadInitial = async () => {
    setLoading(true);
    try {
      const schoolSnap = await getDoc(doc(db, "schools", schoolId));
      let yearToLoad = feeAcademicYear;
      if (schoolSnap.exists()) {
        const sd = schoolSnap.data();
        if (sd.feeSchedule)     setFeeSchedule(sd.feeSchedule);
        if (sd.feeAcademicYear) { setFeeAcademicYear(sd.feeAcademicYear); yearToLoad = sd.feeAcademicYear; }
        if (sd.holidayMonths)   setHolidayMonths(sd.holidayMonths);
      }
      const [cls, stu, fixed, variable, profiles] = await Promise.all([
        getClassesBySchool(schoolId),
        getStudentsBySchool(schoolId),
        getFixedFeeStructures(schoolId),
        getVariableFeeStructures(schoolId),
        getStudentFeeProfiles(schoolId, yearToLoad),
      ]);
      setClasses(cls);
      setStudents(stu);
      setFixedFees(fixed);
      setVariableFees(variable);
      setFeeProfiles(profiles);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (schoolId) loadInitial(); }, [schoolId]);

  const sortedClasses = useMemo(() =>
    [...classes].sort((a, b) => {
      const g = Number(a.grade) - Number(b.grade);
      return g !== 0 ? g : a.section.localeCompare(b.section);
    }), [classes]);

  const classMap = useMemo(() => {
    const m = {}; classes.forEach((c) => (m[c.docId] = c)); return m;
  }, [classes]);

  const cycleLabel = "mo";

  const pastPeriods = useMemo(() =>
    generatePeriods("monthly", feeAcademicYear),
  [feeAcademicYear]);

  /* ── Save fee settings ── */
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, "schools", schoolId), { feeSchedule, feeAcademicYear });
      invalidateSchoolSettingsCache();
    } catch (e) { alert(e.message); }
    finally { setSavingSettings(false); }
  };

  /* ── Fixed fee CRUD ── */
  const openAddFixed = () => { setEditFixed(null); setFixedForm(EMPTY_FIXED); setFixedOpen(true); };
  const openEditFixed = (f) => {
    setEditFixed(f);
    setFixedForm({ classId: f.classId, label: f.label, amount: String(f.amount), isOneTime: f.isOneTime || false, chargedDuringHolidays: f.chargedDuringHolidays ?? true });
    setFixedOpen(true);
  };
  const saveFixed = async () => {
    if (!fixedForm.classId || !fixedForm.amount) { alert("Fill all fields"); return; }
    setFixedSaving(true);
    try {
      const cls = classMap[fixedForm.classId];
      const payload = {
        schoolId, type: "fixed",
        classId: fixedForm.classId,
        classLabel: `${cls.grade}-${cls.section}`,
        label: fixedForm.label,
        amount: Number(fixedForm.amount),
        isOneTime: fixedForm.isOneTime || false,
        chargedDuringHolidays: fixedForm.chargedDuringHolidays ?? true,
        academicYear: feeAcademicYear,
      };
      if (editFixed) await updateFeeStructure(editFixed.id, payload);
      else           await addFeeStructure(payload);
      setFixedOpen(false);
      setFixedFees(await getFixedFeeStructures(schoolId));
    } catch (e) { alert(e.message); }
    finally { setFixedSaving(false); }
  };
  const deleteFixed = async (id) => {
    if (!confirm("Delete this fee?")) return;
    await deleteFeeStructure(id);
    setFixedFees(await getFixedFeeStructures(schoolId));
  };

  /* ── Variable fee CRUD ── */
  const openAddVar = () => { setEditVar(null); setVarForm(EMPTY_VAR); setVarOpen(true); };
  const openEditVar = (v) => { setEditVar(v); setVarForm({ label: v.label, amount: String(v.amount), isOneTime: v.isOneTime || false, chargedDuringHolidays: v.chargedDuringHolidays ?? true }); setVarOpen(true); };
  const saveVar = async () => {
    if (!varForm.label || !varForm.amount) { alert("Fill all fields"); return; }
    setVarSaving(true);
    try {
      const payload = { schoolId, type: "variable", label: varForm.label, amount: Number(varForm.amount), isOneTime: varForm.isOneTime || false, chargedDuringHolidays: varForm.chargedDuringHolidays ?? true, academicYear: feeAcademicYear };
      if (editVar) await updateFeeStructure(editVar.id, payload);
      else         await addFeeStructure(payload);
      setVarOpen(false);
      setVariableFees(await getVariableFeeStructures(schoolId));
    } catch (e) { alert(e.message); }
    finally { setVarSaving(false); }
  };
  const deleteVar = async (id) => {
    if (!confirm("Delete this fee?")) return;
    await deleteFeeStructure(id);
    setVariableFees(await getVariableFeeStructures(schoolId));
  };

  /* ── Expand student row ── */
  const toggleExpand = async (studentId) => {
    if (expandedId === studentId) { setExpandedId(null); setExpandedPays([]); setExpandedYears([]); return; }
    setExpandedId(studentId);
    setShowClosedHistory(false);
    setLoadingPays(true);
    try {
      const [pays, years] = await Promise.all([
        getFeePaymentsByStudent(studentId, feeAcademicYear),
        getStudentFeeYearsAll(studentId),
      ]);
      setExpandedPays(pays);
      setExpandedYears(years);
    } finally { setLoadingPays(false); }
  };

  /* ── Setup fees for student ── */
  const openSetup = (student) => {
    setSetupStudent(student);
    setSetupVars(new Set());
    // Pre-select fixed fees that match the student's class
    const matched = new Set(fixedFees.filter((f) => f.classId === student.classId).map((f) => f.id));
    setSetupSelectedFixed(matched);
    setSetupOpen(true);
  };

  const setupFixedFees = useMemo(
    () => fixedFees,
    [fixedFees]
  );

  // Fixed fees the admin has selected for this student (pre-select all for student's class)
  const [setupSelectedFixed, setSetupSelectedFixed] = useState(new Set());

  const saveSetup = async () => {
    if (!setupStudent) return;
    setSetupSaving(true);
    try {
      const items = [];
      for (const f of setupFixedFees.filter((f) => setupSelectedFixed.has(f.id))) {
        items.push({ structureId: f.id, label: f.label, amount: f.amount, type: "fixed", isOneTime: f.isOneTime || false, chargedDuringHolidays: f.chargedDuringHolidays ?? true });
      }
      for (const id of setupVars) {
        const v = variableFees.find((x) => x.id === id);
        if (v) items.push({ structureId: v.id, label: v.label, amount: v.amount, type: "variable", isOneTime: v.isOneTime || false, chargedDuringHolidays: v.chargedDuringHolidays ?? true });
      }
      if (items.length === 0) { alert("Select at least one fee item"); return; }
      await createStudentFeeProfile({
        studentId: setupStudent.id,
        studentName: setupStudent.fullName,
        classId: setupStudent.classId,
        classLabel: setupStudent.classLabel || "",
        schoolId, academicYear: feeAcademicYear, schedule: feeSchedule, items, holidayMonths,
      });
      setSetupOpen(false);
      setFeeProfiles(await getStudentFeeProfiles(schoolId, feeAcademicYear));
      if (expandedId === setupStudent.id) setExpandedPays(await getFeePaymentsByStudent(setupStudent.id, feeAcademicYear));
    } catch (e) { alert(e.message); }
    finally { setSetupSaving(false); }
  };

  /* ── Collect payment ── */
  const openCollect = (payment) => {
    setCollectPayment(payment);
    setCollectMode("full");
    setCollectAmount("");
    setCollectBy("");
    setCollectNotes("");
    setCollectOpen(true);
  };

  const savePayment = async () => {
    if (!collectPayment) return;
    setCollectSaving(true);
    try {
      let newAmountPaid;
      let amountCollectedNow;

      if (collectMode === "full") {
        // Pay exactly what's outstanding (carryForward + totalDue)
        newAmountPaid       = (collectPayment.carryForward || 0) + (collectPayment.totalDue || 0);
        amountCollectedNow  = collectPayment.outstanding || 0;
      } else {
        if (!collectAmount || Number(collectAmount) <= 0) { alert("Enter a valid amount"); return; }
        amountCollectedNow = Number(collectAmount);
        newAmountPaid      = (collectPayment.amountPaid || 0) + amountCollectedNow;
      }

      const payAcademicYear = collectPayment.academicYear || feeAcademicYear;
      const receiptNo = await recordPayment(collectPayment.id, collectPayment.studentId, payAcademicYear, {
        amountPaid:  newAmountPaid,
        collectedBy: collectBy,
        notes:       collectNotes,
      });

      setCollectOpen(false);

      // Refresh expanded row (ledger was recalculated, so re-fetch)
      if (expandedId === collectPayment.studentId) {
        setExpandedPays(await getFeePaymentsByStudent(collectPayment.studentId, payAcademicYear));
      }

      if (receiptNo) {
        setReceiptData({
          receiptNo,
          studentName:   collectPayment.studentName,
          classLabel:    collectPayment.classLabel,
          period:        collectPayment.periodLabel,
          regularAmount: collectPayment.totalDue || 0,
          carryForward:  collectPayment.carryForward || 0,
          amount:        amountCollectedNow,
          date:          new Date().toLocaleDateString("en-IN"),
          collectedBy:   collectBy || "",
        });
        setReceiptOpen(true);
      }
    } catch (e) { alert(e.message); }
    finally { setCollectSaving(false); }
  };

  /* ── Load reports ── */
  const loadReports = async () => {
    if (reportsLoaded) return;
    setAllPayments(await getFeePaymentsBySchool(schoolId, feeAcademicYear));
    setReportsLoaded(true);
  };

  /* ── Close period ── */
  const handleClosePeriod = async () => {
    if (!closePeriodValue) return;
    setClosingPeriod(true);
    try {
      const { closed, carriedForward, credited } = await closePeriod(schoolId, closePeriodValue, feeAcademicYear);
      setCloseDialogOpen(false);
      setClosePeriodValue("");
      const parts = [`Period closed (${closed} student${closed !== 1 ? "s" : ""}).`];
      if (carriedForward > 0) parts.push(`Outstanding balances carried forward to next month.`);
      alert(parts.join(" "));
      if (expandedId) setExpandedPays(await getFeePaymentsByStudent(expandedId, feeAcademicYear));
    } catch (e) { alert(e.message); }
    finally { setClosingPeriod(false); }
  };

  /* ── Filtered students ── */
  const filteredStudents = useMemo(() => students.filter((s) => {
    if (filterClass !== "all" && s.classId !== filterClass) return false;
    if (searchName && !s.fullName?.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [students, filterClass, searchName]);

  /* ── Report stats ── */
  const stats = useMemo(() => {
    const total     = allPayments.reduce((s, p) => s + (p.totalDue || 0), 0);
    const collected = allPayments.reduce((s, p) => s + (p.amountPaid || 0), 0);
    const rate      = total > 0 ? Math.round((collected / total) * 100) : 0;
    return {
      total, collected, rate,
      pending: allPayments.filter((p) => p.status === "pending").length,
      partial: allPayments.filter((p) => p.status === "partial").length,
      paid:    allPayments.filter((p) => p.status === "paid").length,
    };
  }, [allPayments]);

  const studentSummary = useMemo(() => {
    const activeIds = new Set(students.map((s) => s.id));
    const map = {};
    allPayments.forEach((p) => {
      if (!activeIds.has(p.studentId)) return; // skip graduated / inactive students
      if (!map[p.studentId]) {
        map[p.studentId] = { studentId: p.studentId, studentName: p.studentName, classId: p.classId, classLabel: p.classLabel, totalDue: 0, totalPaid: 0 };
      }
      map[p.studentId].totalDue  += (p.totalDue   || 0);
      map[p.studentId].totalPaid += (p.amountPaid || 0);
    });
    return Object.values(map).map((s) => ({
      ...s,
      remaining: s.totalDue - s.totalPaid,
      percent:   s.totalDue > 0 ? Math.round((s.totalPaid / s.totalDue) * 100) : 0,
    }));
  }, [allPayments, students]);

  const classBreakdown = useMemo(() =>
    sortedClasses
      .map((cls) => {
        const rows = allPayments.filter((p) => p.classId === cls.docId);
        if (rows.length === 0) return null;
        const billed    = rows.reduce((s, p) => s + (p.totalDue   || 0), 0);
        const collected = rows.reduce((s, p) => s + (p.amountPaid || 0), 0);
        const rate      = billed > 0 ? Math.round((collected / billed) * 100) : 0;
        return { cls, billed, collected, due: billed - collected, rate };
      })
      .filter(Boolean),
  [sortedClasses, allPayments]);

  const filteredSummary = useMemo(() =>
    studentSummary
      .filter((s) => {
        if (reportFilterClass !== "all" && s.classId !== reportFilterClass) return false;
        if (reportSearch && !s.studentName?.toLowerCase().includes(reportSearch.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) =>
        (a.classLabel ?? "").localeCompare(b.classLabel ?? "") ||
        (a.studentName ?? "").localeCompare(b.studentName ?? "")
      ),
  [studentSummary, reportFilterClass, reportSearch]);

  if (loading) return <PageLoader label="Loading fees…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fee Management</h1>
        <p className="text-gray-500">Define fee structures and track student payments period-wise</p>
      </div>

      <Tabs defaultValue="structure" onValueChange={(v) => v === "reports" && loadReports()}>
        <TabsList>
          <TabsTrigger value="structure">Fee Structure</TabsTrigger>
          <TabsTrigger value="students">Student Fees</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: FEE STRUCTURE ═══ */}
        <TabsContent value="structure" className="space-y-4">

          {/* School settings */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">School Fee Settings</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Fee Schedule</label>
                  <Select value={feeSchedule} onValueChange={setFeeSchedule}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Academic Year</label>
                  <Input className="w-28" value={feeAcademicYear} placeholder="2025-26"
                    onChange={(e) => setFeeAcademicYear(e.target.value)} />
                </div>
                <Button onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Fixed fees */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Fixed Fees <span className="text-sm font-normal text-gray-500">(per class — auto-assigned)</span></h2>
                </div>
                <Button size="sm" onClick={openAddFixed}>+ Add</Button>
              </div>
              {fixedFees.length === 0 ? (
                <p className="text-sm text-gray-400">No fixed fees defined yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Class</th>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fixedFees.sort((a, b) => a.classLabel?.localeCompare(b.classLabel)).map((f) => (
                      <tr key={f.id}>
                        <td className="px-3 py-2 font-medium">Class {f.classLabel}</td>
                        <td className="px-3 py-2">{f.label}</td>
                        <td className="px-3 py-2">₹{f.amount?.toLocaleString()}{!f.isOneTime && "/mo"}</td>
                        <td className="px-3 py-2">
                          {f.isOneTime
                            ? <Badge className="bg-purple-100 text-purple-700">One-time</Badge>
                            : <Badge className="bg-blue-100 text-blue-700">Monthly</Badge>}
                        </td>
                        <td className="px-3 py-2 flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditFixed(f)}>✏️</Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteFixed(f.id)}>🗑️</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Variable fees */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Variable Fees <span className="text-sm font-normal text-gray-500">(optional add-ons — Transport, Library etc.)</span></h2>
                </div>
                <Button size="sm" onClick={openAddVar}>+ Add</Button>
              </div>
              {variableFees.length === 0 ? (
                <p className="text-sm text-gray-400">No variable fees defined yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {variableFees.map((v) => (
                      <tr key={v.id}>
                        <td className="px-3 py-2 font-medium">{v.label}</td>
                        <td className="px-3 py-2">₹{v.amount?.toLocaleString()}{!v.isOneTime && "/mo"}</td>
                        <td className="px-3 py-2">
                          {v.isOneTime
                            ? <Badge className="bg-purple-100 text-purple-700">One-time</Badge>
                            : <Badge className="bg-blue-100 text-blue-700">Monthly</Badge>}
                        </td>
                        <td className="px-3 py-2 flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditVar(v)}>✏️</Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteVar(v.id)}>🗑️</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 2: STUDENT FEES ═══ */}
        <TabsContent value="students" className="space-y-4">

          {/* Close Period card */}
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800">Close Fee Period</p>
                <p className="text-xs text-amber-600">Locks a past month and carries any unpaid balance forward to the next month</p>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => setCloseDialogOpen(true)}>
                Close Period
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex flex-wrap gap-3">
              <Input placeholder="Search student..." className="w-52" value={searchName}
                onChange={(e) => setSearchName(e.target.value)} />
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {sortedClasses.map((c) => (
                    <SelectItem key={c.docId} value={c.docId}>Class {c.grade}-{c.section}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {filteredStudents.length === 0 ? (
            <Card><CardContent className="p-6 text-gray-400 text-sm">No students found.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Amount / Month</th>
                      <th className="px-4 py-3 text-left">Schedule</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => {
                      const profile    = feeProfiles[student.id];
                      const isExpanded = expandedId === student.id;
                      return (
                        <Fragment key={student.id}>
                          <tr
                            className="border-t hover:bg-gray-50 cursor-pointer"
                            onClick={() => profile && toggleExpand(student.id)}
                          >
                            <td className="px-4 py-3 text-gray-400">
                              {profile && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                            </td>
                            <td className="px-4 py-3 font-medium">{student.fullName}</td>
                            <td className="px-4 py-3">{student.classLabel || "—"}</td>
                            <td className="px-4 py-3">
                              {profile ? `₹${profile.totalPerCycle?.toLocaleString()}` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {profile ? (
                                <Badge className="bg-green-100 text-green-700 capitalize">{profile.schedule}</Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-500">No Profile</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {!profile ? (
                                <Button size="sm" variant="outline" onClick={() => openSetup(student)}>
                                  Setup Fees
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="text-indigo-600 hover:text-indigo-700"
                                  onClick={() => { setManageStudent(student); setManageOpen(true); }}>
                                  Manage Fees
                                </Button>
                              )}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-t bg-indigo-50/30">
                              <td colSpan={6} className="px-10 py-4">
                                {loadingPays ? (
                                  <div className="space-y-2 animate-pulse">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                      <div key={i} className="h-8 bg-white rounded border" />
                                    ))}
                                  </div>
                                ) : (() => {
                                  // Previous closed academic years — show as summary, not month-by-month
                                  const prevYears = expandedYears.filter(
                                    (y) => y.academicYear !== feeAcademicYear && y.status === "closed"
                                  );

                                  // Separate opening-balance record from monthly rows
                                  const openingRec  = expandedPays.find((p) => p.sortIndex === -1);
                                  const monthlyPays = expandedPays.filter((p) => p.sortIndex !== -1);
                                  const openPays    = monthlyPays.filter((p) => !p.isClosed);
                                  const closedPays  = monthlyPays.filter((p) =>  p.isClosed);

                                  const renderRows = (rows) => rows.map((p) => {
                                    const effDue = (p.totalDue || 0) + (p.carryForward || 0);
                                    return (
                                      <tr key={p.id} className={p.isClosed ? "opacity-50" : ""}>
                                        <td className="py-2 pr-6">{p.periodLabel}</td>
                                        <td className="py-2 pr-6">
                                          ₹{effDue.toLocaleString()}
                                          {(p.carryForward || 0) > 0 && (
                                            <span className="block text-xs text-orange-500">+₹{p.carryForward.toLocaleString()} C/F</span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-6">₹{(p.amountPaid || 0).toLocaleString()}</td>
                                        <td className="py-2 pr-6">
                                          <Badge className={STATUS_COLORS[p.status] ?? ""}>{p.status}</Badge>
                                        </td>
                                        <td className="py-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {!p.isClosed && p.status !== "paid" && (
                                              <Button size="sm" variant="outline" onClick={() => openCollect(p)}>
                                                Collect
                                              </Button>
                                            )}
                                            {p.isClosed && p.status !== "paid" && !p.receiptNo && (
                                              <span className="text-xs text-gray-400 italic">Locked</span>
                                            )}
                                            {p.receiptNo && (
                                              <button
                                                className="text-xs text-indigo-600 hover:underline"
                                                onClick={() => {
                                                  const effDue = (p.totalDue || 0) + (p.carryForward || 0);
                                                  downloadReceipt({
                                                    receiptNo:     p.receiptNo,
                                                    studentName:   p.studentName,
                                                    classLabel:    p.classLabel,
                                                    period:        p.periodLabel,
                                                    regularAmount: p.totalDue || 0,
                                                    carryForward:  p.carryForward || 0,
                                                    amount:        p.amountPaid || 0,
                                                    date:          p.paidAt?.toDate?.()?.toLocaleDateString("en-IN") || "—",
                                                    collectedBy:   p.collectedBy || "",
                                                  });
                                                }}
                                              >
                                                ↓ Receipt
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  });

                                  const tableHead = (
                                    <thead className="text-gray-500 text-xs">
                                      <tr>
                                        <th className="text-left pb-2 pr-6">Period</th>
                                        <th className="text-left pb-2 pr-6">Due</th>
                                        <th className="text-left pb-2 pr-6">Paid</th>
                                        <th className="text-left pb-2 pr-6">Status</th>
                                        <th className="text-left pb-2">Action</th>
                                      </tr>
                                    </thead>
                                  );

                                  return (
                                    <div className="space-y-4">

                                      {/* ── Previous year summaries (one line per closed year) ── */}
                                      {prevYears.length > 0 && (
                                        <div className="space-y-1.5">
                                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Past Academic Years</p>
                                          {prevYears.map((y) => {
                                            const bal = y.closingBalance ?? 0;
                                            return (
                                              <div key={y.id} className="flex items-center justify-between bg-white border rounded-md px-3 py-2 text-sm">
                                                <span className="font-medium text-gray-700">{y.academicYear}</span>
                                                <span className="text-xs text-gray-400">{y.classLabel}</span>
                                                {bal === 0
                                                  ? <Badge className="bg-green-100 text-green-700">No Dues</Badge>
                                                  : bal > 0
                                                    ? <Badge className="bg-red-100 text-red-600">₹{bal.toLocaleString()} outstanding</Badge>
                                                    : <Badge className="bg-blue-100 text-blue-700">₹{Math.abs(bal).toLocaleString()} credit</Badge>
                                                }
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* ── Opening balance carried from previous year ── */}
                                      {openingRec && (
                                        <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm border ${openingRec.outstanding > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                                          <span className="font-medium text-gray-700">Opening Balance (carried in)</span>
                                          {openingRec.outstanding === 0
                                            ? <Badge className="bg-green-100 text-green-700">Settled</Badge>
                                            : openingRec.outstanding > 0
                                              ? <span className="text-red-600 font-semibold text-xs">₹{openingRec.outstanding.toLocaleString()} due</span>
                                              : <span className="text-green-600 font-semibold text-xs">₹{Math.abs(openingRec.outstanding).toLocaleString()} credit</span>
                                          }
                                        </div>
                                      )}

                                      {/* ── Current year months ── */}
                                      {expandedPays.length === 0 ? (
                                        <p className="text-sm text-gray-400">No payment records for {feeAcademicYear}.</p>
                                      ) : monthlyPays.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic">No monthly records yet.</p>
                                      ) : (
                                        <>
                                          {openPays.length === 0 ? (
                                            <p className="text-sm text-gray-400 italic">No open periods — all months closed.</p>
                                          ) : (
                                            <table className="w-full text-sm">
                                              {tableHead}
                                              <tbody className="divide-y divide-gray-200">{renderRows(openPays)}</tbody>
                                            </table>
                                          )}
                                          {closedPays.length > 0 && (
                                            <div>
                                              <button
                                                className="text-xs text-gray-400 hover:text-gray-600 underline"
                                                onClick={() => setShowClosedHistory((v) => !v)}
                                              >
                                                {showClosedHistory ? "Hide" : "Show"} {closedPays.length} closed month{closedPays.length > 1 ? "s" : ""} ({feeAcademicYear})
                                              </button>
                                              {showClosedHistory && (
                                                <table className="w-full text-sm mt-2">
                                                  {tableHead}
                                                  <tbody className="divide-y divide-gray-200">{renderRows(closedPays)}</tbody>
                                                </table>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ TAB 3: REPORTS ═══ */}
        <TabsContent value="reports" className="space-y-4">
          {!reportsLoaded ? (
            <InlineLoader label="Loading reports…" />
          ) : (
            <>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-wrap gap-3 items-center">
                    <h2 className="font-semibold flex-1">Student Fee Summary</h2>
                    <Input
                      placeholder="Search student..."
                      className="w-44"
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                    />
                    <Select value={reportFilterClass} onValueChange={setReportFilterClass}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="All Classes" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Classes</SelectItem>
                        {sortedClasses.map((c) => (
                          <SelectItem key={c.docId} value={c.docId}>Class {c.grade}-{c.section}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {filteredSummary.length === 0 ? (
                    <p className="text-sm text-gray-400">No students found.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Student</th>
                          <th className="px-3 py-2 text-left">Class</th>
                          <th className="px-3 py-2 text-left">Total Due</th>
                          <th className="px-3 py-2 text-left">Paid</th>
                          <th className="px-3 py-2 text-left">Remaining</th>
                          <th className="px-3 py-2 text-left">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredSummary.map((s) => (
                          <tr key={s.studentId} className={s.remaining === 0 ? "bg-green-50/40" : ""}>
                            <td className="px-3 py-2 font-medium">{s.studentName}</td>
                            <td className="px-3 py-2 text-gray-500">{s.classLabel}</td>
                            <td className="px-3 py-2">₹{s.totalDue.toLocaleString()}</td>
                            <td className="px-3 py-2 text-green-600">₹{s.totalPaid.toLocaleString()}</td>
                            <td className={`px-3 py-2 font-medium ${s.remaining > 0 ? "text-red-500" : "text-green-600"}`}>
                              ₹{s.remaining.toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${s.percent}%` }} />
                                </div>
                                <span className="text-xs text-gray-500">{s.percent}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-3">
                  <h2 className="font-semibold">Per-Class Breakdown</h2>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Class</th>
                        <th className="px-3 py-2 text-left">Billed</th>
                        <th className="px-3 py-2 text-left">Collected</th>
                        <th className="px-3 py-2 text-left">Due</th>
                        <th className="px-3 py-2 text-left">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {classBreakdown.map(({ cls, billed, collected, due, rate }) => (
                        <tr key={cls.docId}>
                          <td className="px-3 py-2 font-medium">Class {cls.grade}-{cls.section}</td>
                          <td className="px-3 py-2">₹{billed.toLocaleString()}</td>
                          <td className="px-3 py-2 text-green-600">₹{collected.toLocaleString()}</td>
                          <td className="px-3 py-2 text-red-500">₹{due.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${rate}%` }} />
                              </div>
                              <span className="text-xs text-gray-500">{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOG: Add / Edit Fixed Fee ═══ */}
      <Dialog open={fixedOpen} onOpenChange={setFixedOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editFixed ? "Edit Fixed Fee" : "Add Fixed Fee"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Class</label>
              <Select value={fixedForm.classId} onValueChange={(v) => setFixedForm((p) => ({ ...p, classId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {sortedClasses.map((c) => <SelectItem key={c.docId} value={c.docId}>Class {c.grade}-{c.section}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Label</label>
              <Input placeholder="e.g. Tuition Fee" value={fixedForm.label}
                onChange={(e) => setFixedForm((p) => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                {fixedForm.isOneTime ? "Amount (₹)" : "Amount per Month (₹)"}
              </label>
              <Input type="number" value={fixedForm.amount}
                onChange={(e) => setFixedForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="fixed-onetime"
                checked={fixedForm.isOneTime}
                onCheckedChange={(checked) => setFixedForm((p) => ({ ...p, isOneTime: !!checked }))}
              />
              <label htmlFor="fixed-onetime" className="text-sm cursor-pointer">
                One-time fee <span className="text-gray-400">(charged only once, not every month)</span>
              </label>
            </div>
            {!fixedForm.isOneTime && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="fixed-holiday"
                  checked={fixedForm.chargedDuringHolidays}
                  onCheckedChange={(checked) => setFixedForm((p) => ({ ...p, chargedDuringHolidays: !!checked }))}
                />
                <label htmlFor="fixed-holiday" className="text-sm cursor-pointer">
                  Charge during holiday months
                </label>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFixedOpen(false)}>Cancel</Button>
            <Button onClick={saveFixed} disabled={fixedSaving}>{fixedSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Add / Edit Variable Fee ═══ */}
      <Dialog open={varOpen} onOpenChange={setVarOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editVar ? "Edit Variable Fee" : "Add Variable Fee"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Label</label>
              <Input placeholder="e.g. Transport, Library, Lab" value={varForm.label}
                onChange={(e) => setVarForm((p) => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input type="number" value={varForm.amount}
                onChange={(e) => setVarForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="var-onetime"
                checked={varForm.isOneTime}
                onCheckedChange={(checked) => setVarForm((p) => ({ ...p, isOneTime: !!checked }))}
              />
              <label htmlFor="var-onetime" className="text-sm cursor-pointer">
                One-time fee <span className="text-gray-400">(charged only once, not every month)</span>
              </label>
            </div>
            {!varForm.isOneTime && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="var-holiday"
                  checked={varForm.chargedDuringHolidays}
                  onCheckedChange={(checked) => setVarForm((p) => ({ ...p, chargedDuringHolidays: !!checked }))}
                />
                <label htmlFor="var-holiday" className="text-sm cursor-pointer">
                  Charge during holiday months
                </label>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVarOpen(false)}>Cancel</Button>
            <Button onClick={saveVar} disabled={varSaving}>{varSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Setup Student Fees ═══ */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Setup Fees — {setupStudent?.fullName}</DialogTitle>
          </DialogHeader>
          {setupStudent && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Class {setupStudent.classLabel} · monthly · {feeAcademicYear} · 12 monthly payment records will be created
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">Fixed Fees</p>
                {setupFixedFees.length === 0 ? (
                  <p className="text-xs text-amber-600">No fixed fees defined. Add one in Fee Structure first.</p>
                ) : (
                  setupFixedFees.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 border rounded-md p-3">
                      <Checkbox
                        checked={setupSelectedFixed.has(f.id)}
                        onCheckedChange={(checked) => setSetupSelectedFixed((prev) => {
                          const next = new Set(prev);
                          checked ? next.add(f.id) : next.delete(f.id);
                          return next;
                        })}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{f.label}</span>
                        <span className="text-xs text-gray-400 ml-2">Class {f.classLabel}</span>
                      </div>
                      {f.isOneTime
                        ? <Badge className="bg-purple-100 text-purple-700 text-xs mr-1">One-time</Badge>
                        : null}
                      <span className="text-sm font-medium">
                        ₹{f.amount?.toLocaleString()}{f.isOneTime ? "" : `/${cycleLabel}`}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {variableFees.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Variable Fees (select applicable)</p>
                  {variableFees.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 border rounded-md p-3">
                      <Checkbox
                        checked={setupVars.has(v.id)}
                        onCheckedChange={(checked) => setSetupVars((prev) => {
                          const next = new Set(prev);
                          checked ? next.add(v.id) : next.delete(v.id);
                          return next;
                        })}
                      />
                      <span className="text-sm flex-1">{v.label}</span>
                      {v.isOneTime
                        ? <Badge className="bg-purple-100 text-purple-700 text-xs mr-1">One-time</Badge>
                        : null}
                      <span className="text-sm font-medium">
                        ₹{v.amount?.toLocaleString()}{v.isOneTime ? "" : "/mo"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(() => {
                const selectedVarFees  = variableFees.filter((v) => setupVars.has(v.id));
                const selectedFixed    = setupFixedFees.filter((f) => setupSelectedFixed.has(f.id));
                const fixedRecurring   = selectedFixed.filter((f) => !f.isOneTime).reduce((s, f) => s + f.amount, 0);
                const fixedOneTime     = selectedFixed.filter((f) =>  f.isOneTime).reduce((s, f) => s + f.amount, 0);
                const recurringTotal   = fixedRecurring + selectedVarFees.filter((v) => !v.isOneTime).reduce((s, v) => s + v.amount, 0);
                const oneTimeTotal     = fixedOneTime   + selectedVarFees.filter((v) =>  v.isOneTime).reduce((s, v) => s + v.amount, 0);
                return (
                  <div className="bg-gray-50 rounded-md p-3 space-y-1">
                    {recurringTotal > 0 && (
                      <div className="flex justify-between text-sm font-medium">
                        <span>Total / Month</span>
                        <span className="text-indigo-600">₹{recurringTotal.toLocaleString()}</span>
                      </div>
                    )}
                    {oneTimeTotal > 0 && (
                      <div className="flex justify-between text-sm font-medium">
                        <span>One-time Charges</span>
                        <span className="text-purple-600">₹{oneTimeTotal.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button>
            <Button onClick={saveSetup} disabled={setupSaving || (setupSelectedFixed.size === 0 && setupVars.size === 0)}>
              {setupSaving ? "Creating..." : "Create Fee Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Collect Payment ═══ */}
      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Collect Fee Payment</DialogTitle></DialogHeader>
          {collectPayment && (() => {
            const effDue  = (collectPayment.totalDue || 0) + (collectPayment.carryForward || 0);
            const balance = effDue - (collectPayment.amountPaid || 0);
            return (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-md p-3 text-sm space-y-1">
                <p className="font-medium">{collectPayment.studentName}</p>
                <p className="text-gray-500">Class {collectPayment.classLabel} · {collectPayment.periodLabel}</p>
                {(collectPayment.carryForward || 0) > 0 && (
                  <div className="mt-1 space-y-0.5 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Regular Fee</span>
                      <span>₹{collectPayment.totalDue?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-orange-600 font-medium">
                      <span>Carry Forward (prev. months)</span>
                      <span>₹{collectPayment.carryForward?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t pt-0.5 font-semibold text-gray-700">
                      <span>Total Due</span>
                      <span>₹{effDue.toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {(collectPayment.carryForward || 0) < 0 && (
                  <div className="mt-1 space-y-0.5 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Regular Fee</span>
                      <span>₹{collectPayment.totalDue?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Credit from previous month</span>
                      <span>−₹{Math.abs(collectPayment.carryForward).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t pt-0.5 font-semibold text-gray-700">
                      <span>Net Due</span>
                      <span className={effDue <= 0 ? "text-green-600" : ""}>
                        {effDue <= 0 ? `Credit ₹${Math.abs(effDue).toLocaleString()}` : `₹${effDue.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}
                {!(collectPayment.carryForward) && (
                  <p className="text-gray-500">Total Due: ₹{effDue.toLocaleString()}</p>
                )}
                {collectPayment.amountPaid > 0 && (
                  <p className="text-xs text-green-600">Already paid: ₹{collectPayment.amountPaid.toLocaleString()} · Balance: ₹{balance.toLocaleString()}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant={collectMode === "full" ? "default" : "outline"} onClick={() => setCollectMode("full")}>
                  Full Payment
                </Button>
                <Button size="sm" variant={collectMode === "partial" ? "default" : "outline"} onClick={() => setCollectMode("partial")}>
                  Partial Payment
                </Button>
              </div>

              {collectMode === "partial" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Amount Collected (₹)</label>
                  <Input type="number" placeholder={`Max ₹${balance}`} value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)} />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">Collected By <span className="text-gray-400">(optional)</span></label>
                <Input placeholder="Your name" value={collectBy} onChange={(e) => setCollectBy(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Notes <span className="text-gray-400">(optional)</span></label>
                <Input placeholder="Any remarks" value={collectNotes} onChange={(e) => setCollectNotes(e.target.value)} />
              </div>
            </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCollectOpen(false)}>Cancel</Button>
            <Button onClick={savePayment} disabled={collectSaving}>
              {collectSaving ? "Saving..." : collectMode === "full" ? "Mark as Paid & Get Receipt" : "Save & Get Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Receipt ═══ */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fee Receipt</DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-3 text-sm">
              <p className="text-center text-xs text-gray-400">{receiptData.receiptNo}</p>
              <div className="divide-y border rounded-md">
                {[
                  ["Student",      receiptData.studentName],
                  ["Class",        receiptData.classLabel],
                  ["Period",       receiptData.period],
                  ...(receiptData.carryForward > 0 ? [
                    ["Regular Fee",   `₹${Number(receiptData.regularAmount).toLocaleString("en-IN")}`],
                    ["Carry Forward", `₹${Number(receiptData.carryForward).toLocaleString("en-IN")}`],
                  ] : []),
                  ["Amount Paid",  `₹${Number(receiptData.amount).toLocaleString("en-IN")}`],
                  ["Date",         receiptData.date],
                  ...(receiptData.collectedBy ? [["Collected By", receiptData.collectedBy]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between px-3 py-2">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-400">Computer-generated receipt</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Close</Button>
            <Button onClick={() => receiptData && downloadReceipt(receiptData)}>
              Download Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Manage Student Fees (mid-year) ═══ */}
      <ManageStudentFeesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        student={manageStudent}
        profile={manageStudent ? feeProfiles[manageStudent.id] : null}
        variableFees={variableFees}
        onUpdated={async () => {
          const studentId = manageStudent?.id;
          const [profiles, pays] = await Promise.all([
            getStudentFeeProfiles(schoolId, feeAcademicYear),
            expandedId === studentId
              ? getFeePaymentsByStudent(studentId, feeAcademicYear)
              : Promise.resolve(null),
          ]);
          setFeeProfiles(profiles);
          if (pays !== null) setExpandedPays(pays);
        }}
      />

      {/* ═══ DIALOG: Close Period ═══ */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Close Fee Period</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-1.5">
              <p className="font-medium text-amber-800">What happens when you close a period?</p>
              <ul className="text-xs text-amber-700 space-y-0.5 list-disc pl-4">
                <li>That month gets <strong>locked</strong> — no new payments can be recorded for it</li>
                <li>Any unpaid or partial balance is <strong>carried forward</strong> to the next month</li>
                <li>The carry-forward amount appears clearly in the next month's collection dialog</li>
                <li>This action <strong>cannot be undone</strong></li>
              </ul>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Select Month to Close</label>
              {pastPeriods.length === 0 ? (
                <p className="text-xs text-gray-400">No past periods available to close.</p>
              ) : (
                <Select value={closePeriodValue} onValueChange={setClosePeriodValue}>
                  <SelectTrigger><SelectValue placeholder="Select month..." /></SelectTrigger>
                  <SelectContent>
                    {pastPeriods.map((p) => (
                      <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCloseDialogOpen(false); setClosePeriodValue(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={!closePeriodValue || closingPeriod} onClick={handleClosePeriod}>
              {closingPeriod ? "Closing..." : "Close Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Fees;
