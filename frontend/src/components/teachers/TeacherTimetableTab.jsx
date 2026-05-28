import { useEffect, useState } from "react";
import {
  doc, getDoc, collection, getDocs, query, where,
} from "firebase/firestore";
import { db } from "@/config/firebase";

import { saveTeacherTimetable } from "@/services/timetable.service";
import { getTimePeriodsBySchool } from "@/services/timePeriod.service";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const EMPTY_WEEK = {
  monday: [], tuesday: [], wednesday: [],
  thursday: [], friday: [], saturday: [],
};

const TeacherTimetableTab = ({ teacherId, schoolId }) => {
  const [timetable,   setTimetable]   = useState({ week: EMPTY_WEEK });
  const [assignments, setAssignments] = useState([]);
  const [periods,     setPeriods]     = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [addingDay, setAddingDay] = useState(null);
  const [editing,   setEditing]   = useState(null); // { day, index }
  const [slotForm,  setSlotForm]  = useState({ periodId: "", classId: "", subjectId: "", classLabel: "", subjectName: "" });

  /* ── Load timetable ── */
  useEffect(() => {
    const load = async () => {
      if (!teacherId || !schoolId) return;
      try {
        const snap = await getDoc(doc(db, "teacherTimetables", teacherId));
        setTimetable(snap.exists() ? snap.data() : { week: EMPTY_WEEK });
      } catch (err) {
        console.error("Failed to load timetable", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [teacherId, schoolId]);

  /* ── Load assignments ── */
  useEffect(() => {
    const loadAssignments = async () => {
      if (!teacherId || !schoolId) return;
      const q = query(
        collection(db, "teacherClassSubjects"),
        where("teacherId", "==", teacherId),
        where("schoolId",  "==", schoolId)
      );
      const snap = await getDocs(q);
      const resolved = await Promise.all(
        snap.docs.map(async (d) => {
          const { classId, subjectId } = d.data();
          const [classSnap, subjectSnap] = await Promise.all([
            getDoc(doc(db, "classes",   classId)),
            getDoc(doc(db, "subjects",  subjectId)),
          ]);
          return {
            classId, subjectId,
            classLabel:  classSnap.exists()   ? `${classSnap.data().grade}-${classSnap.data().section}` : "Unknown",
            subjectName: subjectSnap.exists() ? subjectSnap.data().name : "Unknown",
          };
        })
      );
      setAssignments(resolved);
    };
    loadAssignments();
  }, [teacherId, schoolId]);

  /* ── Load time periods ── */
  useEffect(() => {
    if (schoolId) getTimePeriodsBySchool(schoolId).then(setPeriods);
  }, [schoolId]);

  /* ── Persist ── */
  const persist = async (updatedWeek) => {
    await saveTeacherTimetable({ teacherId, schoolId, week: updatedWeek });
    setTimetable({ week: updatedWeek });
  };

  /* ── Resolve period info from selected periodId ── */
  const periodInfo = (periodId) => periods.find((p) => p.id === periodId);

  const buildSlot = (form) => {
    const p = periodInfo(form.periodId);
    return {
      periodId:    form.periodId,
      from:        p?.from        ?? "",
      to:          p?.to          ?? "",
      classId:     form.classId,
      subjectId:   form.subjectId,
      classLabel:  form.classLabel,
      subjectName: form.subjectName,
    };
  };

  const EMPTY_FORM = { periodId: "", classId: "", subjectId: "", classLabel: "", subjectName: "" };

  const handleAddSlot = async (day) => {
    if (!slotForm.periodId || !slotForm.classId) {
      alert("Select a time period and a class/subject");
      return;
    }
    const updated = structuredClone(timetable.week);
    updated[day].push(buildSlot(slotForm));
    await persist(updated);
    setAddingDay(null);
    setSlotForm(EMPTY_FORM);
  };

  const handleUpdateSlot = async (day, index) => {
    const updated = structuredClone(timetable.week);
    updated[day][index] = buildSlot(slotForm);
    await persist(updated);
    setEditing(null);
    setSlotForm(EMPTY_FORM);
  };

  const handleDeleteSlot = async (day, index) => {
    if (!window.confirm("Delete this slot?")) return;
    const updated = structuredClone(timetable.week);
    updated[day].splice(index, 1);
    await persist(updated);
  };

  if (loading) return <p className="text-gray-500">Loading timetable…</p>;

  /* ── Slot form UI (shared for add + edit) ── */
  const SlotForm = ({ day, onSave, onCancel }) => (
    <div className="border rounded-md p-3 space-y-2 bg-gray-50">
      {/* Period selector */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Time Period</label>
        {periods.length === 0 ? (
          <p className="text-xs text-red-500">
            No periods defined. Go to Settings → Time Periods first.
          </p>
        ) : (
          <select
            className="w-full border rounded-md p-2 text-sm bg-white"
            value={slotForm.periodId}
            onChange={(e) => setSlotForm((f) => ({ ...f, periodId: e.target.value }))}
          >
            <option value="">Select period</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}  ({p.from} – {p.to})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Class + Subject selector */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Class & Subject</label>
        <select
          className="w-full border rounded-md p-2 text-sm bg-white"
          value={`${slotForm.classId}_${slotForm.subjectId}`}
          onChange={(e) => {
            const selected = assignments.find(
              (a) => `${a.classId}_${a.subjectId}` === e.target.value
            );
            if (!selected) return;
            setSlotForm((f) => ({ ...f, ...selected }));
          }}
        >
          <option value="_">Select class & subject</option>
          {assignments.map((a) => (
            <option key={`${a.classId}_${a.subjectId}`} value={`${a.classId}_${a.subjectId}`}>
              {a.classLabel} · {a.subjectName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(day)}>Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-lg font-semibold">Weekly Timetable</h2>

        {Object.entries(timetable.week).map(([day, slots]) => (
          <div key={day} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium capitalize">{day}</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAddingDay(day); setEditing(null); setSlotForm(EMPTY_FORM); }}
              >
                + Add Slot
              </Button>
            </div>

            {addingDay === day && (
              <SlotForm
                day={day}
                onSave={handleAddSlot}
                onCancel={() => setAddingDay(null)}
              />
            )}

            {slots.map((s, idx) => (
              <div key={idx}>
                {editing?.day === day && editing?.index === idx ? (
                  <SlotForm
                    day={day}
                    onSave={(d) => handleUpdateSlot(d, idx)}
                    onCancel={() => { setEditing(null); setSlotForm(EMPTY_FORM); }}
                  />
                ) : (
                  <div className="border rounded-md p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">
                        {s.from && s.to ? `${s.from} – ${s.to}` : (periodInfo(s.periodId) ? `${periodInfo(s.periodId).from} – ${periodInfo(s.periodId).to}` : "—")}
                      </p>
                      <p className="text-sm text-gray-500">
                        {s.classLabel} · {s.subjectName}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing({ day, index: idx });
                          setAddingDay(null);
                          setSlotForm({
                            periodId:    s.periodId    ?? "",
                            classId:     s.classId     ?? "",
                            subjectId:   s.subjectId   ?? "",
                            classLabel:  s.classLabel  ?? "",
                            subjectName: s.subjectName ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteSlot(day, idx)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TeacherTimetableTab;
