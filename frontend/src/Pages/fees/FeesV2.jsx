import { Fragment, useEffect, useState, useMemo, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageLoader, InlineLoader } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";

import AcademicYearDialog       from "@/components/fees/AcademicYearDialog";
import FeeStructuresDialog      from "@/components/fees/FeeStructuresDialog";
import CreateDraftProfileDialog from "@/components/fees/CreateDraftProfileDialog";
import EditDraftProfileDialog   from "@/components/fees/EditDraftProfileDialog";
import CollectPaymentDialog     from "@/components/fees/CollectPaymentDialog";
import ReceiptDialog            from "@/components/fees/ReceiptDialog";
import CancelPaymentDialog      from "@/components/fees/CancelPaymentDialog";
import FeeRevisionSection       from "@/components/fees/FeeRevisionSection";

import { getClassesBySchool }   from "@/services/class.service";
import { getStudentsBySchool }  from "@/services/student.service";
import {
  getActiveAcademicYear,
  getAcademicYearsBySchool,
  getProfilesBySchoolAndYear,
  closeProfile,
  deleteDraftProfile,
  createInstallments,
  getInstallments,
  getPaymentsByStudent,
  getAllFeeStructuresOrdered,
  buildReceipt,
  ProfileStatus,
  InstallmentStatus,
  PaymentStatus,
  AcademicYearStatus,
} from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

const PROFILE_STATUS_COLORS = {
  [ProfileStatus.DRAFT]:  "bg-amber-100 text-amber-700",
  [ProfileStatus.ACTIVE]: "bg-green-100 text-green-700",
  [ProfileStatus.CLOSED]: "bg-gray-100 text-gray-500",
};

const INSTALLMENT_STATUS_COLORS = {
  [InstallmentStatus.UPCOMING]: "bg-blue-100 text-blue-600",
  [InstallmentStatus.DUE]:      "bg-yellow-100 text-yellow-700",
  [InstallmentStatus.PARTIAL]:  "bg-orange-100 text-orange-700",
  [InstallmentStatus.OVERDUE]:  "bg-red-100 text-red-600",
  [InstallmentStatus.PAID]:     "bg-green-100 text-green-700",
  [InstallmentStatus.CANCELLED]:"bg-gray-100 text-gray-500",
};

// ─── Builds allocation-like objects from a payment's allocationSummary field ──
function allocsFromSummary(allocationSummary) {
  return (allocationSummary ?? []).map((s) => ({
    allocationTarget:     s.target,
    installmentId:        s.installmentId ?? null,
    period:               s.period ?? null,
    periodLabel:          s.periodLabel ?? "—",
    allocatedAmount:      s.amount ?? 0,
    componentAllocations: [],
  }));
}

// ─── Subcomponent: Installment table ─────────────────────────────────────────

function InstallmentTable({ installments, onCollect }) {
  if (!installments || installments.length === 0) {
    return <p className="text-sm text-gray-400 italic">No installments found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 border-b">
          <tr>
            <th className="text-left pb-2 pr-4">#</th>
            <th className="text-left pb-2 pr-4">Period</th>
            <th className="text-left pb-2 pr-4">Due Date</th>
            <th className="text-left pb-2 pr-4">Amount</th>
            <th className="text-left pb-2 pr-4">Balance</th>
            <th className="text-left pb-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {installments.map((inst) => {
            const dueDateStr = inst.dueDate?.toDate?.()?.toLocaleDateString("en-IN")
              ?? (inst.dueDate instanceof Date ? inst.dueDate.toLocaleDateString("en-IN") : "—");
            return (
              <tr key={inst.id} className={inst.status === "cancelled" ? "opacity-40" : ""}>
                <td className="py-2 pr-4 text-gray-400">{inst.installmentNumber}</td>
                <td className="py-2 pr-4 font-medium">{inst.periodLabel}</td>
                <td className="py-2 pr-4 text-gray-500">{dueDateStr}</td>
                <td className="py-2 pr-4">{INR(inst.netAmount)}</td>
                <td className="py-2 pr-4">
                  <span className={inst.balance > 0 ? "text-red-500 font-medium" : "text-green-600"}>
                    {INR(inst.balance)}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <Badge className={INSTALLMENT_STATUS_COLORS[inst.status] ?? ""}>
                    {inst.status}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Subcomponent: Payment history row ───────────────────────────────────────

function PaymentHistoryRow({ payment, profile, school, onCancelClick, onReceiptClick }) {
  const dateStr = payment.paymentDate?.toDate?.()?.toLocaleDateString("en-IN")
    ?? (payment.paymentDate instanceof Date ? payment.paymentDate.toLocaleDateString("en-IN") : "—");

  return (
    <div className={`flex items-center gap-3 px-3 py-2 text-sm ${payment.status === PaymentStatus.CANCELLED ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium font-mono text-xs text-gray-600">{payment.receiptNo}</span>
          {payment.status === PaymentStatus.CANCELLED && (
            <Badge className="bg-red-100 text-red-500 text-xs">Cancelled</Badge>
          )}
        </div>
        <p className="text-xs text-gray-400">{dateStr} · {payment.paymentMode?.toUpperCase()}</p>
        {payment.collectedBy && <p className="text-xs text-gray-400">by {payment.collectedBy}</p>}
      </div>
      <span className="font-semibold text-indigo-600 shrink-0">{INR(payment.paymentAmount)}</span>
      <div className="flex gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-indigo-600 hover:text-indigo-700 h-7 px-2"
          onClick={() => onReceiptClick(payment)}
        >
          Receipt
        </Button>
        {payment.status === PaymentStatus.CONFIRMED && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-red-500 hover:text-red-600 h-7 px-2"
            onClick={() => onCancelClick(payment)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponent: Expanded profile detail ────────────────────────────────────

function FeeProfileDetail({
  profile,
  studentMap,
  school,
  allYears,
  onActivated,
  onInstallmentsGenerated,
  onPaymentCreated,
  onPaymentCancelled,
}) {
  const confirm = useConfirm();
  const [installments,    setInstallments]    = useState(null);
  const [payments,        setPayments]        = useState(null);
  const [feeStructures,   setFeeStructures]   = useState([]);
  const [loadingInst,     setLoadingInst]     = useState(false);
  const [loadingPays,     setLoadingPays]     = useState(false);
  const [closingProfile,  setClosingProfile]  = useState(false);
  const [generatingInst,  setGeneratingInst]  = useState(false);
  const [actionError,     setActionError]     = useState(null);
  const [collectOpen,     setCollectOpen]     = useState(false);
  const [editOpen,        setEditOpen]        = useState(false);
  const [cancelPayment,   setCancelPayment]   = useState(null);
  const [receiptPayment,  setReceiptPayment]  = useState(null); // { model }
  const schoolId = localStorage.getItem("principalSchoolId");

  // Determine if this profile's academic year is CLOSED (enables Close Profile)
  const profileYear = (allYears ?? []).find((y) => y.id === profile.academicYearId);
  const yearIsClosed = profileYear?.status === AcademicYearStatus.CLOSED;

  // Load installments + payments when component mounts
  useEffect(() => {
    if (!profile?.id) return;
    if (profile.installmentsGenerated) {
      setLoadingInst(true);
      getInstallments(profile.id)
        .then(setInstallments)
        .catch((e) => setActionError(e.message))
        .finally(() => setLoadingInst(false));
    }
    setLoadingPays(true);
    getPaymentsByStudent(profile.studentId, profile.academicYear)
      .then(setPayments)
      .catch((e) => setActionError(e.message))
      .finally(() => setLoadingPays(false));
  }, [profile?.id, profile?.installmentsGenerated, profile?.studentId, profile?.academicYear]);

  // Load fee structures for revision dialogs (non-fatal)
  useEffect(() => {
    if (!schoolId) return;
    getAllFeeStructuresOrdered(schoolId)
      .then(setFeeStructures)
      .catch(() => {});
  }, [schoolId]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete draft fee profile?",
      description: `This will permanently remove the profile for ${studentMap[profile.studentId] ?? profile.studentId}.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      await deleteDraftProfile(profile.id);
      onActivated?.(); // reloads the profiles list
    } catch (e) {
      setActionError(e.message);
    }
  };

  const handleCloseProfile = async () => {
    const ok = await confirm({
      title: "Close fee profile?",
      description: "The academic year must already be closed. This cannot be undone.",
      confirmLabel: "Close Profile",
      danger: true,
    });
    if (!ok) return;
    setClosingProfile(true);
    setActionError(null);
    try {
      await closeProfile(profile.id);
      onActivated?.();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setClosingProfile(false);
    }
  };

  const handleGenerateInstallments = async () => {
    setGeneratingInst(true);
    setActionError(null);
    try {
      // Load holiday months from school document for schoolSettings
      let holidayMonths = [];
      try {
        const schoolSnap = await getDoc(doc(db, "schools", schoolId));
        if (schoolSnap.exists()) holidayMonths = schoolSnap.data().holidayMonths ?? [];
      } catch (_) { /* non-fatal */ }

      await createInstallments({
        profileId:      profile.id,
        schoolSettings: { holidayMonths },
      });
      const newInst = await getInstallments(profile.id);
      setInstallments(newInst);
      onInstallmentsGenerated?.();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setGeneratingInst(false);
    }
  };

  const handlePaymentCreated = async ({ receiptModel }) => {
    // Refresh payments + installments
    setLoadingPays(true);
    setLoadingInst(true);
    try {
      const [newPays, newInst] = await Promise.all([
        getPaymentsByStudent(profile.studentId, profile.academicYear),
        profile.installmentsGenerated ? getInstallments(profile.id) : Promise.resolve(installments),
      ]);
      setPayments(newPays);
      setInstallments(newInst);
    } finally {
      setLoadingPays(false);
      setLoadingInst(false);
    }
    setReceiptPayment({ model: receiptModel });
    onPaymentCreated?.();
  };

  const handlePaymentCancelled = async () => {
    setLoadingPays(true);
    setLoadingInst(true);
    try {
      const [newPays, newInst] = await Promise.all([
        getPaymentsByStudent(profile.studentId, profile.academicYear),
        profile.installmentsGenerated ? getInstallments(profile.id) : Promise.resolve(installments),
      ]);
      setPayments(newPays);
      setInstallments(newInst);
    } finally {
      setLoadingPays(false);
      setLoadingInst(false);
    }
    onPaymentCancelled?.();
  };

  const handleReceiptClick = (payment) => {
    // Build receipt from the allocationSummary stored on the payment doc
    const allocs = allocsFromSummary(payment.allocationSummary);
    const model  = buildReceipt(payment, profile, allocs, school ?? null);
    setReceiptPayment({ model });
  };

  const handleRevisionApplied = async () => {
    // Refresh installments (balances / statuses changed)
    if (profile.installmentsGenerated) {
      setLoadingInst(true);
      try {
        setInstallments(await getInstallments(profile.id));
      } catch (e) {
        setActionError(e.message);
      } finally {
        setLoadingInst(false);
      }
    }
    // Refresh the profile row (lastRevisionId/Type/At + annual totals changed)
    onActivated?.();
  };

  const studentName = studentMap[profile.studentId] ?? profile.studentId;

  return (
    <div className="space-y-4 py-2">
      {/* ── Profile summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border rounded-md p-3 space-y-0.5">
          <p className="text-xs text-gray-400">Annual Fee (Gross)</p>
          <p className="text-base font-semibold">{INR(profile.grossAnnualFee)}</p>
        </div>
        {profile.totalAdjustmentAmount > 0 && (
          <div className="bg-white border rounded-md p-3 space-y-0.5">
            <p className="text-xs text-gray-400">Total Adjustment</p>
            <p className="text-base font-semibold text-green-600">−{INR(profile.totalAdjustmentAmount)}</p>
          </div>
        )}
        <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3 space-y-0.5">
          <p className="text-xs text-gray-400">Net Annual Fee</p>
          <p className="text-base font-semibold text-indigo-700">{INR(profile.netAnnualFee)}</p>
        </div>
        {(profile.appliedOpeningOutstanding ?? profile.openingOutstanding ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-md p-3 space-y-0.5">
            <p className="text-xs text-gray-400">Opening Outstanding</p>
            <p className="text-base font-semibold text-amber-700">
              {INR(profile.appliedOpeningOutstanding ?? profile.openingOutstanding)}
            </p>
          </div>
        )}
        {(profile.appliedOpeningCredit ?? profile.openingCredit ?? 0) > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-md p-3 space-y-0.5">
            <p className="text-xs text-gray-400">Opening Credit</p>
            <p className="text-base font-semibold text-green-700">
              {INR(profile.appliedOpeningCredit ?? profile.openingCredit)}
            </p>
          </div>
        )}
      </div>

      {/* ── Fee line items ── */}
      {Array.isArray(profile.feeLineItems) && profile.feeLineItems.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Fee Components
          </div>
          <div className="divide-y">
            {profile.feeLineItems.map((item) => (
              <div key={item.feeStructureId} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{item.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{item.type}</span>
                  {item.isOneTime && <span className="text-xs text-purple-500 ml-1">· one-time</span>}
                  {!item.chargedDuringHolidays && <span className="text-xs text-orange-400 ml-1">· excl. holidays</span>}
                </div>
                <span className="font-medium">{INR(item.amount)}{!item.isOneTime ? "/cycle" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Adjustments ── */}
      {Array.isArray(profile.feeAdjustments) && profile.feeAdjustments.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Adjustments
          </div>
          <div className="divide-y">
            {profile.feeAdjustments.map((adj, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{adj.label ?? adj.type}</span>
                <span className="font-medium text-green-600">−{INR(adj.computedAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* ── Lifecycle actions ── */}
      <div className="flex flex-wrap gap-2">
        {profile.status === ProfileStatus.DRAFT && (
          <>
            <Button size="sm" onClick={handleGenerateInstallments} disabled={generatingInst}>
              {generatingInst ? "Generating..." : "Generate & Activate"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Edit Draft
            </Button>
            <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600"
              onClick={handleDelete}>
              Delete Draft
            </Button>
          </>
        )}
        {profile.status === ProfileStatus.ACTIVE && profile.installmentsGenerated && installments && (
          <Button size="sm" onClick={() => setCollectOpen(true)}>
            Collect Payment
          </Button>
        )}
        {(profile.status === ProfileStatus.DRAFT || profile.status === ProfileStatus.ACTIVE) && yearIsClosed && (
          <Button size="sm" variant="outline"
            className="text-orange-600 hover:text-orange-700 border-orange-200"
            disabled={closingProfile}
            onClick={handleCloseProfile}>
            {closingProfile ? "Closing..." : "Close Profile"}
          </Button>
        )}
      </div>

      {/* ── Installments ── */}
      {profile.installmentsGenerated && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Installments</p>
          {loadingInst
            ? <InlineLoader label="Loading installments…" />
            : <InstallmentTable installments={installments} />
          }
        </div>
      )}

      {/* ── Payment history ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment History</p>
        {loadingPays ? (
          <InlineLoader label="Loading payments…" />
        ) : !payments || payments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No payments recorded.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {payments.map((pay) => (
              <PaymentHistoryRow
                key={pay.id}
                payment={pay}
                profile={profile}
                school={school}
                onCancelClick={setCancelPayment}
                onReceiptClick={handleReceiptClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Fee Revisions ── */}
      {profile.status !== ProfileStatus.DRAFT && (
        <div>
          <FeeRevisionSection
            profile={profile}
            installments={installments}
            feeStructures={feeStructures}
            onRevisionApplied={handleRevisionApplied}
          />
        </div>
      )}

      {/* ── Dialogs ── */}
      <EditDraftProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        schoolId={schoolId}
        onUpdated={() => { setEditOpen(false); onActivated?.(); }}
      />

      <CollectPaymentDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        profile={profile}
        installments={installments ?? []}
        school={school}
        studentName={studentName}
        onPaymentCreated={handlePaymentCreated}
      />

      <CancelPaymentDialog
        open={!!cancelPayment}
        onOpenChange={(v) => { if (!v) setCancelPayment(null); }}
        payment={cancelPayment}
        onCancelled={handlePaymentCancelled}
      />

      <ReceiptDialog
        open={!!receiptPayment}
        onOpenChange={(v) => { if (!v) setReceiptPayment(null); }}
        receiptModel={receiptPayment?.model ?? null}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FeesV2 = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [loading,     setLoading]     = useState(true);
  const [activeYear,  setActiveYear]  = useState(null);
  const [allYears,    setAllYears]    = useState([]);
  const [profiles,    setProfiles]    = useState([]);
  const [students,    setStudents]    = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [school,      setSchool]      = useState(null);

  const [searchName,    setSearchName]    = useState("");
  const [filterClass,   setFilterClass]   = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [expandedId,    setExpandedId]    = useState(null);

  const [yearDialogOpen,      setYearDialogOpen]      = useState(false);
  const [createProfileOpen,   setCreateProfileOpen]   = useState(false);
  const [feeStructuresOpen,   setFeeStructuresOpen]   = useState(false);
  const [loadError,           setLoadError]           = useState(null);

  const loadAll = useCallback(async () => {
    if (!schoolId) {
      setLoadError("School ID not found. Please log in again.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // Load years + students + classes + school doc independently so one failure
      // doesn't silently kill the whole page.
      const [yearsResult, studsResult, clsResult, schoolResult] = await Promise.allSettled([
        getAcademicYearsBySchool(schoolId),
        getStudentsBySchool(schoolId),
        getClassesBySchool(schoolId),
        getDoc(doc(db, "schools", schoolId)),
      ]);

      if (yearsResult.status === "fulfilled") {
        setAllYears(yearsResult.value);
      } else {
        console.error("getAcademicYearsBySchool failed:", yearsResult.reason);
        setLoadError(`Failed to load academic years: ${yearsResult.reason?.message ?? yearsResult.reason}`);
      }

      if (studsResult.status === "fulfilled") setStudents(studsResult.value);
      if (clsResult.status   === "fulfilled") setClasses(clsResult.value);
      if (schoolResult.status === "fulfilled" && schoolResult.value.exists()) {
        const sd = schoolResult.value.data();
        setSchool({ name: sd.name ?? sd.schoolName ?? null, address: sd.address ?? null });
      }

      // Active year — required for profile loading
      let ay = null;
      try {
        ay = await getActiveAcademicYear(schoolId);
        setActiveYear(ay);
      } catch (e) {
        console.error("getActiveAcademicYear failed:", e);
        setLoadError((prev) => prev ?? `Failed to load active year: ${e.message}`);
      }

      if (ay) {
        try {
          const profs = await getProfilesBySchoolAndYear(schoolId, ay.year);
          setProfiles(profs);
        } catch (e) {
          console.error("getProfilesBySchoolAndYear failed:", e);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadProfiles = async () => {
    if (!activeYear) return;
    const profs = await getProfilesBySchoolAndYear(schoolId, activeYear.year);
    setProfiles(profs);
  };

  // Lookups
  const studentMap = useMemo(() => {
    const m = {};
    students.forEach((s) => { m[s.id] = s.fullName; });
    return m;
  }, [students]);

  const sortedClasses = useMemo(() =>
    [...classes].sort((a, b) =>
      Number(a.grade) - Number(b.grade) || a.section.localeCompare(b.section)
    ),
  [classes]);

  const filteredProfiles = useMemo(() => {
    const name = searchName.toLowerCase();
    return profiles.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterClass  !== "all" && p.classId !== filterClass)  return false;
      if (name) {
        const sName = (studentMap[p.studentId] ?? "").toLowerCase();
        if (!sName.includes(name)) return false;
      }
      return true;
    }).sort((a, b) =>
      (a.classLabel ?? "").localeCompare(b.classLabel ?? "") ||
      (studentMap[a.studentId] ?? "").localeCompare(studentMap[b.studentId] ?? "")
    );
  }, [profiles, filterStatus, filterClass, searchName, studentMap]);

  if (loading) return <PageLoader label="Loading Fee Management V2…" />;

  return (
    <div className="space-y-6">
      {/* ── Load error banner ── */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            className="text-xs text-red-500 underline shrink-0"
            onClick={loadAll}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fee Management</h1>
          <p className="text-gray-500 text-sm">Manage student fee profiles, installments, and payments</p>
        </div>
        <div className="flex items-center gap-2">
          {activeYear ? (
            <div className="text-sm text-right">
              <span className="text-gray-500">Active Year: </span>
              <Badge className="bg-green-100 text-green-700 ml-1">{activeYear.year}</Badge>
            </div>
          ) : (
            <Badge className="bg-amber-100 text-amber-700">No Active Year</Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setFeeStructuresOpen(true)}>
            Fee Structures
          </Button>
          <Button size="sm" variant="outline" onClick={() => setYearDialogOpen(true)}>
            Manage Years
          </Button>
        </div>
      </div>

      {/* ── No active year warning ── */}
      {!activeYear && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5 text-sm text-amber-800 space-y-2">
            <p className="font-medium">No active academic year</p>
            <p className="text-amber-700">Create and activate an academic year before creating fee profiles.</p>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => setYearDialogOpen(true)}>
              Setup Academic Year
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Main content (only when active year exists) ── */}
      {activeYear && (
        <>
          {/* Filters + create button */}
          <Card>
            <CardContent className="p-4 flex flex-wrap gap-3 items-center">
              <Input
                placeholder="Search student..."
                className="w-52"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {sortedClasses.map((c) => (
                    <SelectItem key={c.docId} value={c.docId}>Class {c.grade}-{c.section}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value={ProfileStatus.DRAFT}>Draft</SelectItem>
                  <SelectItem value={ProfileStatus.ACTIVE}>Active</SelectItem>
                  <SelectItem value={ProfileStatus.CLOSED}>Closed</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button size="sm" onClick={() => setCreateProfileOpen(true)}>
                + New Fee Profile
              </Button>
            </CardContent>
          </Card>

          {/* Profile table */}
          {filteredProfiles.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-400 text-sm">
                {profiles.length === 0
                  ? "No fee profiles for this academic year. Click \"New Fee Profile\" to get started."
                  : "No profiles match the current filters."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs">
                    <tr>
                      <th className="px-4 py-3 w-6"></th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Schedule</th>
                      <th className="px-4 py-3 text-left">Net Annual</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Installments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map((profile) => {
                      const isExpanded  = expandedId === profile.id;
                      const studentName = studentMap[profile.studentId] ?? profile.studentId;
                      return (
                        <Fragment key={profile.id}>
                          <tr
                            className="border-t hover:bg-gray-50 cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                          >
                            <td className="px-4 py-3 text-gray-400">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </td>
                            <td className="px-4 py-3 font-medium">{studentName}</td>
                            <td className="px-4 py-3 text-gray-500">{profile.classLabel}</td>
                            <td className="px-4 py-3 capitalize text-gray-500">{profile.schedule}</td>
                            <td className="px-4 py-3 font-medium">{INR(profile.netAnnualFee)}</td>
                            <td className="px-4 py-3">
                              <Badge className={PROFILE_STATUS_COLORS[profile.status] ?? ""}>
                                {profile.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {profile.installmentsGenerated
                                ? <Badge className="bg-indigo-100 text-indigo-600">Generated</Badge>
                                : <span className="text-gray-400 text-xs">—</span>
                              }
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-t bg-indigo-50/20">
                              <td colSpan={7} className="px-8 py-4">
                                <FeeProfileDetail
                                  profile={profile}
                                  studentMap={studentMap}
                                  school={school}
                                  allYears={allYears}
                                  onActivated={reloadProfiles}
                                  onInstallmentsGenerated={reloadProfiles}
                                  onPaymentCreated={reloadProfiles}
                                  onPaymentCancelled={reloadProfiles}
                                />
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
        </>
      )}

      {/* ── Dialogs ── */}
      <FeeStructuresDialog
        open={feeStructuresOpen}
        onOpenChange={setFeeStructuresOpen}
        schoolId={schoolId}
        classes={classes}
      />

      <AcademicYearDialog
        open={yearDialogOpen}
        onOpenChange={setYearDialogOpen}
        schoolId={schoolId}
        years={allYears}
        onChanged={loadAll}
      />

      <CreateDraftProfileDialog
        open={createProfileOpen}
        onOpenChange={setCreateProfileOpen}
        schoolId={schoolId}
        activeYear={activeYear}
        students={students}
        classes={classes}
        existingProfiles={profiles}
        onCreated={async () => {
          setCreateProfileOpen(false);
          await reloadProfiles();
        }}
      />
    </div>
  );
};

export default FeesV2;
