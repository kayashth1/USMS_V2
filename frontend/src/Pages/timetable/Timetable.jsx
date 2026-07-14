import { useEffect, useState, useMemo } from "react";
import {
  collection, getDocs, getDoc, doc, query, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import { getClassesBySchool } from "@/services/class.service";
import { getTimePeriodsBySchool } from "@/services/timePeriod.service";
import {
  getClassTimetable,
  saveClassTimetable,
} from "@/services/classTimetable.service";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat" };

const Timetable = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [classes,   setClasses]   = useState([]);
  const [periods,   setPeriods]   = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [week,   setWeek]   = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  // Subject+teacher assignments for the selected class
  const [classAssignments,    setClassAssignments]    = useState([]); // [{ subjectId, subjectName, teacherId, teacherName }]
  const [loadingAssignments,  setLoadingAssignments]  = useState(false);

  // Cell editor
  const [editCell,    setEditCell]    = useState(null); // { day, periodId }
  const [cellSubject, setCellSubject] = useState("none");
  const [cellTeacher, setCellTeacher] = useState("none");

  const sortedClasses = useMemo(() =>
    [...classes].sort((a, b) => {
      const g = Number(a.grade) - Number(b.grade);
      return g !== 0 ? g : a.section.localeCompare(b.section);
    }), [classes]);

  // Load classes + periods once
  useEffect(() => {
    if (!schoolId) return;
    Promise.all([
      getClassesBySchool(schoolId),
      getTimePeriodsBySchool(schoolId),
    ]).then(([cls, per]) => {
      setClasses(cls);
      setPeriods(per);
    });
  }, [schoolId]);

  // Load timetable when class changes
  useEffect(() => {
    if (!selectedClassId) { setWeek({}); return; }
    setLoadingTimetable(true);
    getClassTimetable(selectedClassId)
      .then((tt) => setWeek(tt?.week ?? {}))
      .finally(() => setLoadingTimetable(false));
  }, [selectedClassId]);

  // Load subject+teacher assignments for the selected class
  useEffect(() => {
    if (!selectedClassId || !schoolId) { setClassAssignments([]); return; }
    setLoadingAssignments(true);
    const q = query(
      collection(db, "teacherClassSubjects"),
      where("classId",  "==", selectedClassId),
      where("schoolId", "==", schoolId)
    );
    getDocs(q)
      .then(async (snap) => {
        const resolved = await Promise.all(
          snap.docs.map(async (d) => {
            const { subjectId, teacherId } = d.data();
            const [subSnap, tchSnap] = await Promise.all([
              getDoc(doc(db, "subjects", subjectId)),
              getDoc(doc(db, "teachers", teacherId)),
            ]);
            return {
              subjectId,
              subjectName: subSnap.exists() ? subSnap.data().name    : "Unknown",
              teacherId,
              teacherName: tchSnap.exists() ? tchSnap.data().fullName : "Unknown",
            };
          })
        );
        setClassAssignments(resolved);
      })
      .finally(() => setLoadingAssignments(false));
  }, [selectedClassId, schoolId]);

  // Deduplicated subject list for the dialog
  const classSubjects = useMemo(() => {
    const seen = new Set();
    return classAssignments.filter((a) => {
      if (seen.has(a.subjectId)) return false;
      seen.add(a.subjectId);
      return true;
    });
  }, [classAssignments]);

  // Teachers filtered to the selected subject (or all class teachers if none selected)
  const availableTeachers = useMemo(() => {
    const src = (cellSubject && cellSubject !== "none")
      ? classAssignments.filter((a) => a.subjectId === cellSubject)
      : classAssignments;
    const seen = new Set();
    return src.filter((a) => {
      if (seen.has(a.teacherId)) return false;
      seen.add(a.teacherId);
      return true;
    });
  }, [classAssignments, cellSubject]);

  const openEdit = (day, periodId) => {
    const slot = week?.[day]?.[periodId];
    setCellSubject(slot?.subjectId ?? "none");
    setCellTeacher(slot?.teacherId ?? "none");
    setEditCell({ day, periodId });
  };

  const autoSave = async (newWeek) => {
    if (!selectedClassId) return;
    setSaving(true);
    const className = selectedClass
      ? `${selectedClass.grade}-${selectedClass.section}`
      : selectedClassId;
    try {
      await saveClassTimetable({ classDocId: selectedClassId, schoolId, week: newWeek, className });
    } catch (err) {
      alert("Failed to save timetable: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const applyEdit = () => {
    if (!editCell) return;
    const { day, periodId } = editCell;
    const hasSubject = cellSubject && cellSubject !== "none";
    const hasTeacher = cellTeacher && cellTeacher !== "none";
    const subjectName = hasSubject
      ? classAssignments.find((a) => a.subjectId === cellSubject)?.subjectName ?? null
      : null;
    const teacherName = hasTeacher
      ? classAssignments.find((a) => a.teacherId === cellTeacher)?.teacherName ?? null
      : null;
    const newWeek = {
      ...week,
      [day]: {
        ...(week[day] ?? {}),
        [periodId]: hasSubject || hasTeacher
          ? { subjectId: hasSubject ? cellSubject : null, subjectName,
              teacherId:  hasTeacher ? cellTeacher : null, teacherName }
          : null,
      },
    };
    setWeek(newWeek);
    setEditCell(null);
    autoSave(newWeek);
  };

  const clearCell = (day, periodId) => {
    const newWeek = { ...week, [day]: { ...(week[day] ?? {}), [periodId]: null } };
    setWeek(newWeek);
    autoSave(newWeek);
  };

  const selectedClass = classes.find((c) => c.docId === selectedClassId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Class Timetable</h1>
          <p className="text-gray-500">Set the weekly schedule for each class</p>
        </div>
        {saving && (
          <span className="text-sm text-gray-400 animate-pulse">Saving...</span>
        )}
      </div>

      {/* Class selector */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <label className="text-sm font-medium whitespace-nowrap">Select Class:</label>
          <Select
            value={selectedClassId}
            onValueChange={(v) => { setSelectedClassId(v); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {sortedClasses.map((c) => (
                <SelectItem key={c.docId} value={c.docId}>
                  Class {c.grade}-{c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedClass && (
            <span className="text-sm text-gray-500">
              Editing: Class {selectedClass.grade}-{selectedClass.section}
            </span>
          )}
        </CardContent>
      </Card>

      {/* No periods warning */}
      {selectedClassId && periods.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-gray-500 text-sm">
            No time periods defined. Go to{" "}
            <strong>Settings → Time Periods</strong> to add your school's daily schedule first.
          </CardContent>
        </Card>
      )}

      {/* No assignments warning */}
      {selectedClassId && periods.length > 0 && !loadingAssignments && classAssignments.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-amber-600 text-sm">
            No teacher-subject assignments found for this class. Go to{" "}
            <strong>Settings → Teacher Assignment</strong> to assign teachers first.
          </CardContent>
        </Card>
      )}

      {/* Timetable grid */}
      {selectedClassId && periods.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loadingTimetable ? (
              <div className="p-6"><PageLoader label="Loading timetable…" /></div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-36">
                      Period
                    </th>
                    {DAYS.map((d) => (
                      <th key={d} className="px-4 py-3 text-center font-medium text-gray-600 border-b">
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periods.map((period) => (
                    <tr key={period.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 border-r">
                        <p className="font-medium text-xs">{period.name}</p>
                        <p className="text-xs text-gray-400">{period.from} – {period.to}</p>
                      </td>
                      {DAYS.map((d) => {
                        const slot = week?.[d]?.[period.id];
                        return (
                          <td
                            key={d}
                            className="px-2 py-2 text-center cursor-pointer group"
                            onClick={() => openEdit(d, period.id)}
                          >
                            {slot ? (
                              <div className="relative inline-block">
                                <div className="bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1 text-xs space-y-0.5 min-w-20">
                                  {slot.subjectName && (
                                    <p className="font-medium text-indigo-700">{slot.subjectName}</p>
                                  )}
                                  {slot.teacherName && (
                                    <p className="text-gray-500">{slot.teacherName}</p>
                                  )}
                                </div>
                                <button
                                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none"
                                  onClick={(e) => { e.stopPropagation(); clearCell(d, period.id); }}
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs group-hover:text-indigo-400 transition-colors">
                                + Add
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedClassId && (
        <div className="text-center py-16 text-gray-400">
          Select a class above to view or edit its timetable.
        </div>
      )}

      {/* Cell editor dialog */}
      <Dialog open={!!editCell} onOpenChange={(o) => !o && setEditCell(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editCell
                ? `${DAY_LABELS[editCell.day]} · ${periods.find((p) => p.id === editCell.periodId)?.name ?? ""}`
                : "Edit Slot"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Subject</label>
              <Select
                value={cellSubject}
                onValueChange={(v) => {
                  setCellSubject(v);
                  // Auto-populate teacher from assignment
                  const assignment = classAssignments.find((a) => a.subjectId === v);
                  setCellTeacher(assignment?.teacherId ?? "none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {classSubjects.map((a) => (
                    <SelectItem key={a.subjectId} value={a.subjectId}>
                      {a.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingAssignments && classAssignments.length === 0 && (
                <p className="text-xs text-amber-600">
                  No subjects assigned to this class yet.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Teacher</label>
              <Select value={cellTeacher} onValueChange={setCellTeacher}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {availableTeachers.map((a) => (
                    <SelectItem key={a.teacherId} value={a.teacherId}>
                      {a.teacherName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditCell(null)}>Cancel</Button>
            <Button onClick={applyEdit}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Timetable;
