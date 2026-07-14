import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageLoader, InlineLoader } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

import { getClassesBySchool } from "@/services/class.service";
import { getStudentsBySchool, promoteStudents, graduateStudents } from "@/services/student.service";
import {
  getStudentBalancesMap, createFeeProfileAfterPromotion, getStudentFeeProfiles,
  getFixedFeeStructures, getVariableFeeStructures,
} from "@/services/fees.service";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

const PromoteStudentsDialog = ({ open, onOpenChange, onSuccess }) => {
  const schoolId    = localStorage.getItem("principalSchoolId");
  const principalId = localStorage.getItem("principalId");
  const { academicYear: schoolAcademicYear } = useSchoolSettings(schoolId);

  const [step, setStep]           = useState(1);
  const [classes, setClasses]     = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [fromClassId, setFromClassId] = useState("");
  const [toClassId, setToClassId]     = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [processing, setProcessing]  = useState(false);
  const [done, setDone]              = useState(false);

  // Fee balances per student (loaded in step 2)
  const [feeBalances,      setFeeBalances]      = useState({}); // { studentId: number }
  const [loadingBalances,  setLoadingBalances]  = useState(false);
  const [carryFeeBalances, setCarryFeeBalances] = useState(true);
  const [duesConfirmed,    setDuesConfirmed]    = useState(false);

  // Fee preview for the target class (loaded in step 2)
  const [newClassFixed,    setNewClassFixed]    = useState([]);
  const [allVariableFees,  setAllVariableFees]  = useState([]);
  const [feeProfilesMap,   setFeeProfilesMap]   = useState({});

  /* ── derived ── */
  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => {
      const g = Number(a.grade) - Number(b.grade);
      return g !== 0 ? g : a.section.localeCompare(b.section);
    }), [classes]
  );

  const maxGrade = useMemo(
    () => Math.max(...classes.map((c) => Number(c.grade)), 0),
    [classes]
  );

  const classById = useMemo(() => {
    const m = {}; classes.forEach((c) => (m[c.docId] = c)); return m;
  }, [classes]);

  const classLabel = (c) => `${c.grade}-${c.section}`;

  const fromClass = classById[fromClassId];
  const isGraduation = fromClass && Number(fromClass.grade) === maxGrade;

  const studentsInFromClass = useMemo(
    () => allStudents.filter((s) => s.classId === fromClassId),
    [allStudents, fromClassId]
  );

  /* ── load ── */
  useEffect(() => {
    if (!open || !schoolId) return;
    setLoadingData(true);
    Promise.all([getClassesBySchool(schoolId), getStudentsBySchool(schoolId)])
      .then(([cls, stu]) => { setClasses(cls); setAllStudents(stu); })
      .finally(() => setLoadingData(false));
  }, [open, schoolId]);

  /* ── init / reset academicYear from school settings ── */
  useEffect(() => {
    if (schoolAcademicYear && !academicYear) setAcademicYear(schoolAcademicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolAcademicYear]);

  /* ── reset on close ── */
  useEffect(() => {
    if (!open) {
      setStep(1); setFromClassId(""); setToClassId("");
      setAcademicYear(schoolAcademicYear || "");
      setSelectedIds(new Set()); setDone(false);
      setFeeBalances({}); setCarryFeeBalances(true); setDuesConfirmed(false);
      setNewClassFixed([]); setAllVariableFees([]); setFeeProfilesMap({});
    }
  }, [open]);

  /* ── pre-select all students ── */
  useEffect(() => {
    setSelectedIds(new Set(studentsInFromClass.map((s) => s.id)));
  }, [fromClassId, allStudents]);

  /* ── checkbox helpers ── */
  const toggleAll = () => {
    const ids = studentsInFromClass.map((s) => s.id);
    setSelectedIds(ids.every((id) => selectedIds.has(id)) ? new Set() : new Set(ids));
  };
  const toggleOne = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* ── step 1 validation ── */
  const canProceed = fromClassId && studentsInFromClass.length > 0 &&
    (isGraduation ? academicYear.trim() : toClassId && toClassId !== fromClassId);

  /* ── load fee balances + fee preview when entering step 2 ── */
  const loadFeeBalances = async () => {
    setLoadingBalances(true);
    try {
      const studentIds = studentsInFromClass.map((s) => s.id);
      const [balMap, profiles, allFixed, allVar] = await Promise.all([
        getStudentBalancesMap(studentIds, schoolAcademicYear),
        getStudentFeeProfiles(schoolId, schoolAcademicYear),
        getFixedFeeStructures(schoolId),
        getVariableFeeStructures(schoolId),
      ]);
      setFeeBalances(balMap);
      setFeeProfilesMap(profiles);
      setNewClassFixed(allFixed.filter((f) => f.classId === toClassId));
      setAllVariableFees(allVar);
    } finally {
      setLoadingBalances(false);
    }
  };

  /* ── confirm action ── */
  const handleConfirm = async () => {
    try {
      setProcessing(true);
      const toClass = classById[toClassId];
      const newYear = academicYear.trim();

      if (isGraduation) {
        await graduateStudents({
          studentIds: [...selectedIds],
          fromClassId,
          fromClassLabel: classLabel(fromClass),
          academicYear: newYear,
          graduatedBy: principalId,
        });
      } else {
        await promoteStudents({
          studentIds: [...selectedIds],
          fromClassId,
          fromClassLabel: classLabel(fromClass),
          toClassId,
          toClassLabel: classLabel(toClass),
          promotedBy: principalId,
        });

        // Create fee profiles for the new class/year, carrying forward any balance
        const studentsToCreate = studentsInFromClass.filter((s) => selectedIds.has(s.id));
        await Promise.all(
          studentsToCreate.map(async (s) => {
            const profile = feeProfilesMap[s.id];
            const prevVarIds = profile
              ? [...new Set((profile.items || []).filter((i) => i.type === "variable").map((i) => i.structureId))]
              : [];
            await createFeeProfileAfterPromotion({
              studentId:              s.id,
              studentName:            s.fullName,
              newClassId:             toClassId,
              newClassLabel:          classLabel(classById[toClassId]),
              schoolId,
              oldAcademicYear:        schoolAcademicYear,
              newAcademicYear:        newYear,
              previousVariableFeeIds: prevVarIds,
              carryBalance:           carryFeeBalances,
            });
          })
        );
      }

      setDone(true);
      onSuccess?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isGraduation ? "Graduate Students to Alumni" : "Promote Students to Next Class"}
          </DialogTitle>
          {!done && (
            <p className="text-xs text-gray-500">
              Step {step} of 2 — {step === 1 ? "Select source & destination" : "Review & confirm students"}
            </p>
          )}
        </DialogHeader>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-4">
            {loadingData ? (
              <PageLoader label="Loading classes…" />
            ) : (
              <>
                {/* From class */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">From Class (current)</label>
                  <Select value={fromClassId} onValueChange={(v) => { setFromClassId(v); setToClassId(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source class" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedClasses.map((c) => (
                        <SelectItem key={c.docId} value={c.docId}>
                          {classLabel(c)} ({allStudents.filter((s) => s.classId === c.docId).length} students)
                          {Number(c.grade) === maxGrade && " 🎓"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Graduation mode: show academic year input */}
                {isGraduation ? (
                  <div className="space-y-3">
                    <Alert className="border-indigo-300 bg-indigo-50">
                      <AlertDescription className="text-indigo-800 text-sm">
                        🎓 Class {classLabel(fromClass)} is the final year. These students will be
                        moved to <strong>Alumni</strong> and deactivated from the student list.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Academic Year</label>
                      <Input
                        placeholder="e.g. 2024-25"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                      />
                      <p className="text-xs text-gray-400">Format: 2024-25</p>
                    </div>
                  </div>
                ) : (
                  /* Normal promotion: show target class + new academic year */
                  fromClassId && (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Promote To (target class)</label>
                        <Select value={toClassId} onValueChange={setToClassId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select target class" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedClasses
                              .filter((c) => c.docId !== fromClassId)
                              .map((c) => (
                                <SelectItem key={c.docId} value={c.docId}>
                                  {classLabel(c)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {toClassId && (
                        <div className="space-y-1">
                          <label className="text-sm font-medium">New Academic Year</label>
                          <Input
                            className="w-32"
                            placeholder="2025-26"
                            value={academicYear}
                            onChange={(e) => setAcademicYear(e.target.value)}
                          />
                          <p className="text-xs text-gray-400">Fee profiles will be created for this year (Format: 2025-26)</p>
                        </div>
                      )}
                    </>
                  )
                )}

                {fromClassId && studentsInFromClass.length === 0 && (
                  <Alert>
                    <AlertDescription className="text-sm">No students found in this class.</AlertDescription>
                  </Alert>
                )}

                {!isGraduation && fromClassId && (
                  <Alert className="border-yellow-300 bg-yellow-50">
                    <AlertDescription className="text-yellow-800 text-sm">
                      ⚠️ Promotion updates each student's class. Attendance and other records remain intact.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Review students ── */}
        {step === 2 && !done && (
          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {isGraduation ? (
                  <>Graduating <strong>{classLabel(fromClass)}</strong> → <strong>Alumni ({academicYear})</strong></>
                ) : (
                  <>Promoting <strong>{classLabel(fromClass)}</strong> → <strong>{classLabel(classById[toClassId])}</strong></>
                )}
              </span>
              <Badge variant="outline">{selectedIds.size} / {studentsInFromClass.length} selected</Badge>
            </div>

            <div className="border rounded-md overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={studentsInFromClass.length > 0 && studentsInFromClass.every((s) => selectedIds.has(s.id))}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Roll</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Fee Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {studentsInFromClass
                    .sort((a, b) => Number(a.roll) - Number(b.roll))
                    .map((s) => {
                      const bal = feeBalances[s.id];
                      return (
                        <tr key={s.id} className={selectedIds.has(s.id) ? (isGraduation ? "bg-indigo-50" : "bg-green-50") : ""}>
                          <td className="px-3 py-2">
                            <Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleOne(s.id)} />
                          </td>
                          <td className="px-3 py-2">{s.roll || "-"}</td>
                          <td className="px-3 py-2 font-medium">{s.fullName}</td>
                          <td className="px-3 py-2 text-xs">
                            {loadingBalances ? (
                              <InlineLoader label="" />
                            ) : bal === undefined || bal === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : bal > 0 ? (
                              <span className="text-red-500 font-medium">Owes ₹{bal.toLocaleString()}</span>
                            ) : (
                              <span className="text-green-600 font-medium">Credit ₹{Math.abs(bal).toLocaleString()}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* ── Fee preview: new class fees + carried variable fees (promotion only) ── */}
            {!isGraduation && !loadingBalances && (newClassFixed.length > 0 || allVariableFees.length > 0) && (() => {
              // Collect unique variable structureIds across all selected students
              const carriedVarIds = new Set();
              studentsInFromClass.filter((s) => selectedIds.has(s.id)).forEach((s) => {
                const p = feeProfilesMap[s.id];
                (p?.items || []).filter((i) => i.type === "variable").forEach((i) => carriedVarIds.add(i.structureId));
              });
              const carriedVarFees = allVariableFees.filter((v) => carriedVarIds.has(v.id));

              return (
                <div className="border rounded-md p-3 space-y-2 bg-blue-50 border-blue-200 text-sm">
                  <p className="font-semibold text-blue-800">New Class Fee Structure ({classLabel(classById[toClassId])})</p>
                  {newClassFixed.length > 0 ? (
                    <div className="space-y-1">
                      {newClassFixed.map((f) => (
                        <div key={f.id} className="flex justify-between text-blue-700">
                          <span>{f.label}{f.isOneTime ? <span className="ml-1 text-xs bg-purple-100 text-purple-700 rounded px-1">One-time</span> : null}</span>
                          <span className="font-medium">₹{Number(f.amount).toLocaleString()}{f.isOneTime ? "" : "/mo"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-blue-600 text-xs">No fixed fees defined for this class yet.</p>
                  )}
                  {carriedVarFees.length > 0 && (
                    <div className="pt-1 border-t border-blue-200">
                      <p className="text-xs text-blue-600 font-medium mb-1">Variable fees being carried over:</p>
                      <div className="flex flex-wrap gap-1">
                        {carriedVarFees.map((v) => (
                          <Badge key={v.id} className="bg-blue-100 text-blue-700 text-xs">{v.label}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Carry forward option (both promotion and graduation) */}
            {Object.values(feeBalances).some((b) => b !== 0) && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                <Checkbox
                  id="carry-fees"
                  checked={carryFeeBalances}
                  onCheckedChange={(v) => setCarryFeeBalances(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="carry-fees" className="font-medium text-amber-800 cursor-pointer">
                    Carry fee balances to new academic year
                  </label>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Outstanding dues and credits will be visible as a "Balance Carried" record in the student's fee history.
                  </p>
                </div>
              </div>
            )}

            {/* Alumni dues confirmation gate */}
            {isGraduation && [...selectedIds].some((id) => (feeBalances[id] || 0) > 0) && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-300 rounded-md p-3 text-sm">
                <Checkbox
                  id="dues-confirmed"
                  checked={duesConfirmed}
                  onCheckedChange={(v) => setDuesConfirmed(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="dues-confirmed" className="font-medium text-red-700 cursor-pointer">
                    I confirm all outstanding dues have been collected or waived
                  </label>
                  <p className="text-xs text-red-500 mt-0.5">
                    Some selected students have unpaid balances. You must confirm before graduating them.
                  </p>
                </div>
              </div>
            )}

            {selectedIds.size === 0 && (
              <p className="text-sm text-red-500">Select at least one student.</p>
            )}
          </div>
        )}

        {/* ── DONE ── */}
        {done && (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">{isGraduation ? "🎓" : "✅"}</p>
            <p className="font-semibold">
              {selectedIds.size} student{selectedIds.size !== 1 ? "s" : ""}{" "}
              {isGraduation ? "graduated to Alumni!" : "promoted successfully!"}
            </p>
            <p className="text-sm text-gray-500">
              {isGraduation
                ? `Academic Year: ${academicYear}`
                : `From ${classLabel(fromClass)} → ${classLabel(classById[toClassId])}`}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          {!done && step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!canProceed} onClick={() => { setStep(2); loadFeeBalances(); }}>
                Next →
              </Button>
            </>
          )}
          {!done && step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={processing}>Back</Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  selectedIds.size === 0 || processing ||
                  (isGraduation && [...selectedIds].some((id) => (feeBalances[id] || 0) > 0) && !duesConfirmed)
                }
                className={isGraduation ? "bg-indigo-600 hover:bg-indigo-700" : ""}
              >
                {processing
                  ? (isGraduation ? "Graduating..." : "Promoting...")
                  : isGraduation
                    ? `Graduate ${selectedIds.size} to Alumni`
                    : `Promote ${selectedIds.size} Student${selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {done && <Button onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromoteStudentsDialog;
