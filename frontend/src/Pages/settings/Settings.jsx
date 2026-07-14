import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { generatePeriods, formatPeriod, currentAcademicYear } from "@/services/fees.service";
import { invalidateSchoolSettingsCache } from "@/hooks/useSchoolSettings";
import { Input } from "@/components/ui/input";

import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { School } from "lucide-react";

import { getSubjectsBySchool } from "@/services/subject.service";
import { getClassesBySchool }  from "@/services/class.service";

import SubjectManagement      from "@/components/settings/SubjectManagement";
import ClassManagement        from "@/components/settings/ClassManagement";
import ClassSubjectManagement from "@/components/settings/ClassSubjectManagement";
import TeacherAssignment      from "@/components/settings/TeacherAssignment";
import TimePeriodManagement   from "@/components/settings/TimePeriodManagement";
import CustomFieldManagement  from "@/components/settings/CustomFieldManagement";

const Settings = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [school,           setSchool]           = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [feeAcademicYear,  setFeeAcademicYear]  = useState(currentAcademicYear());
  const [holidayMonths,    setHolidayMonths]    = useState([]);
  const [savingHoliday,    setSavingHoliday]    = useState(false);

  // Shared state lifted up so all sub-components see updates instantly
  const [subjects, setSubjects] = useState([]);
  const [classes,  setClasses]  = useState([]);

  const reloadSubjects = () => getSubjectsBySchool(schoolId).then(setSubjects);
  const reloadClasses  = () => getClassesBySchool(schoolId).then(setClasses);

  useEffect(() => {
    if (!schoolId) return;

    const fetchSchool = async () => {
      try {
        const snap = await getDoc(doc(db, "schools", schoolId));
        if (snap.exists()) {
          const d = snap.data();
          setSchool(d);
          setHolidayMonths(d.holidayMonths || []);
          if (d.feeAcademicYear) setFeeAcademicYear(d.feeAcademicYear);
        }
      } catch (err) {
        console.error("Failed to fetch school:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchool();
    reloadSubjects();
    reloadClasses();
  }, [schoolId]);

  const handleSaveHolidays = async () => {
    try {
      setSavingHoliday(true);
      await updateDoc(doc(db, "schools", schoolId), { holidayMonths });
      alert("Holiday months saved");
    } catch (err) {
      alert("Failed to save");
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleSaveAcademicYear = async () => {
    const trimmed = feeAcademicYear.trim();
    if (!/^\d{4}-\d{2}$/.test(trimmed)) {
      alert('Format must be YYYY-YY, e.g. "2025-26"');
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, "schools", schoolId), { feeAcademicYear: trimmed });
      invalidateSchoolSettingsCache();
      alert(`Academic year updated to ${trimmed}. This now applies across fees, promotions, and student creation.`);
    } catch (err) {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading settings…" />;
  if (!school)  return <p className="p-6 text-red-500">School not found</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-gray-500">Manage school configuration</p>
      </div>

      <Tabs defaultValue="school">
        <TabsList>
          <TabsTrigger value="school">School Profile</TabsTrigger>
          <TabsTrigger value="academic">Academic Year</TabsTrigger>
          <TabsTrigger value="subjects_classes">Subjects & Classes</TabsTrigger>
          <TabsTrigger value="Teacher_Assignment">Teacher Assignment</TabsTrigger>
          <TabsTrigger value="time_periods">Time Periods</TabsTrigger>
          <TabsTrigger value="custom_fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="holidays">Holiday Months</TabsTrigger>
          {import.meta.env.DEV && <TabsTrigger value="dev_seed">Dev: Seed Data</TabsTrigger>}
        </TabsList>

        {/* ── School Profile (read-only — managed by superadmin) ── */}
        <TabsContent value="school">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <School size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">School Information</h2>
                  <p className="text-xs text-gray-400">To edit these details, contact your super admin.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Info label="School Name"      value={school.name} />
                <Info label="School Code"      value={school.code} />
                <Info label="Email"            value={school.email} />
                <Info label="Phone"            value={school.phone} />
                <Info label="Principal Name"   value={school.principalName} />
                <Info label="Established Year" value={school.establishedYear} />
                <div className="md:col-span-2">
                  <Info label="Address" value={school.address} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Academic Year ── */}
        <TabsContent value="academic">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Current Academic Year</h2>
                <p className="text-sm text-gray-500 mt-1">
                  This single value controls fee creation, class promotion, student onboarding, and holiday months across the entire system. Change it once at the start of each new session.
                </p>
              </div>

              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Academic Year</label>
                  <Input
                    className="w-32"
                    placeholder="2025-26"
                    value={feeAcademicYear}
                    onChange={(e) => setFeeAcademicYear(e.target.value)}
                  />
                  <p className="text-xs text-gray-400">Format: 2025-26</p>
                </div>
                <Button onClick={handleSaveAcademicYear} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 space-y-1">
                <p className="font-medium">When should you change this?</p>
                <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-700">
                  <li>At the start of a new academic session (typically April)</li>
                  <li>After promoting all students to their new classes</li>
                  <li>New students added after this change will get fees for the new year</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Subjects & Classes ── */}
        <TabsContent value="subjects_classes" className="space-y-4">
          <SubjectManagement
            subjects={subjects}
            onReload={reloadSubjects}
          />
          <ClassManagement
            classes={classes}
            onReload={reloadClasses}
          />
          <ClassSubjectManagement
            subjects={subjects}
            classes={classes}
          />
        </TabsContent>

        {/* ── Teacher Assignment ── */}
        <TabsContent value="Teacher_Assignment">
          <TeacherAssignment
            subjects={subjects}
            classes={classes}
          />
        </TabsContent>

        {/* ── Time Periods ── */}
        <TabsContent value="time_periods">
          <TimePeriodManagement />
        </TabsContent>

        {/* ── Custom Fields ── */}
        <TabsContent value="custom_fields">
          <CustomFieldManagement />
        </TabsContent>

        {/* ── Holiday Months ── */}
        <TabsContent value="holidays">
          <HolidayMonthsTab
            schoolId={schoolId}
            holidayMonths={holidayMonths}
            setHolidayMonths={setHolidayMonths}
            onSave={handleSaveHolidays}
            saving={savingHoliday}
          />
        </TabsContent>

        {import.meta.env.DEV && (
          <TabsContent value="dev_seed">
            <SeedTab schoolId={schoolId} classes={classes} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

/* ── Holiday Months sub-component ── */
const HolidayMonthsTab = ({ holidayMonths, setHolidayMonths, onSave, saving }) => {
  const academicYear = currentAcademicYear();
  const periods = generatePeriods("monthly", academicYear);

  const toggle = (period) => setHolidayMonths((prev) =>
    prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
  );

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Holiday Months</h2>
          <p className="text-sm text-gray-500 mt-1">
            Mark months where school is on holiday. Fees flagged "Charge during holiday months" will still apply; others will be reduced or waived for that month.
          </p>
        </div>
        <p className="text-xs text-gray-400">Academic Year: {academicYear}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {periods.map((period) => {
            const isHoliday = holidayMonths.includes(period);
            return (
              <button
                key={period}
                type="button"
                onClick={() => toggle(period)}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm transition-colors text-left ${
                  isHoliday
                    ? "border-amber-400 bg-amber-50 text-amber-800 font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isHoliday ? "bg-amber-400" : "bg-gray-200"}`} />
                {formatPeriod(period)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Holiday Months"}
          </Button>
          {holidayMonths.length > 0 && (
            <span className="text-sm text-gray-500">{holidayMonths.length} month{holidayMonths.length !== 1 ? "s" : ""} marked</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/* ── Dev Seed Tab (only in development) ── */
const CREATE_STUDENT_URL = "https://createstudent-z4likafkwq-uc.a.run.app/";
const CREATE_TEACHER_URL = "https://createteacher-z4likafkwq-uc.a.run.app";

const SeedTab = ({ schoolId, classes }) => {
  const [teacherCount,   setTeacherCount]   = useState(8);
  const [studentsEach,   setStudentsEach]   = useState(10);
  const [selectedClass,  setSelectedClass]  = useState("all");
  const [running,        setRunning]        = useState(false);
  const [log,            setLog]            = useState([]);

  const addLog = (msg, type = "info") =>
    setLog((prev) => [...prev, { msg, type, id: Date.now() + Math.random() }]);

  const post = async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || JSON.stringify(json));
    return json;
  };

  const handleSeed = async () => {
    setRunning(true);
    setLog([]);
    const ts = Date.now();
    const password = "Test@1234";

    try {
      // Teachers
      for (let i = 1; i <= teacherCount; i++) {
        const name = `Test Teacher ${i}`;
        const email = `teacher${i}.${ts}@seed.test`;
        try {
          await post(CREATE_TEACHER_URL, { fullName: name, email, password, employeeId: `EMP${i}`, schoolId });
          addLog(`✓ Teacher: ${name} (${email})`, "ok");
        } catch (e) {
          addLog(`✗ Teacher ${i}: ${e.message}`, "err");
        }
      }

      // Students
      const targetClasses = selectedClass === "all"
        ? classes
        : classes.filter((c) => c.docId === selectedClass);

      let roll = 1;
      for (const cls of targetClasses) {
        const label = `${cls.grade}-${cls.section}`;
        for (let s = 1; s <= studentsEach; s++) {
          const name  = `Test Student ${label}-${s}`;
          const email = `student${roll}.${ts}@seed.test`;
          try {
            await post(CREATE_STUDENT_URL, {
              fullName: name, email, password,
              roll: String(roll), classId: cls.docId, classLabel: label, schoolId,
              parentName: `Parent of ${name}`, contact: `9876500${String(roll).padStart(3, "0")}`,
            });
            addLog(`✓ Student [${label}]: ${name}`, "ok");
            roll++;
          } catch (e) {
            addLog(`✗ Student ${name}: ${e.message}`, "err");
            roll++;
          }
        }
      }

      addLog(`Done! All passwords: ${password}`, "done");
    } finally {
      setRunning(false);
    }
  };

  const activeClasses = classes.filter((c) => c.isActive);

  return (
    <Card className="border-dashed border-orange-300">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧪</span>
          <div>
            <h2 className="font-semibold">Seed Test Data</h2>
            <p className="text-xs text-orange-600">Dev only — not visible in production</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Teachers to create</label>
            <Input type="number" min={0} max={20} value={teacherCount}
              onChange={(e) => setTeacherCount(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Students per class</label>
            <Input type="number" min={0} max={30} value={studentsEach}
              onChange={(e) => setStudentsEach(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All classes ({activeClasses.length})</option>
              {activeClasses.map((c) => (
                <option key={c.docId} value={c.docId}>{c.grade}-{c.section}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500">All accounts will use password: <strong>Test@1234</strong></p>

        <Button onClick={handleSeed} disabled={running} className="bg-orange-500 hover:bg-orange-600">
          {running ? "Seeding..." : "Seed Test Data"}
        </Button>

        {log.length > 0 && (
          <div className="bg-gray-950 rounded-md p-3 max-h-60 overflow-y-auto text-xs font-mono space-y-0.5">
            {log.map((l) => (
              <div key={l.id} className={
                l.type === "ok"   ? "text-green-400" :
                l.type === "err"  ? "text-red-400" :
                l.type === "done" ? "text-yellow-300 font-bold" :
                "text-gray-400"
              }>{l.msg}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Info = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
    <p className="font-medium text-gray-800">{value || "—"}</p>
  </div>
);

export default Settings;
