import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { School } from "lucide-react";
import SubjectManagement from "@/components/settings/SubjectManagement";
import ClassManagement from "@/components/settings/ClassManagement";
import ClassSubjectManagement from "@/components/settings/ClassSubjectManagement";
import TeacherAssignment from "@/components/settings/TeacherAssignment";
import TimePeriodManagement from "@/components/settings/TimePeriodManagement";
import CustomFieldManagement from "@/components/settings/CustomFieldManagement";

const Settings = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ================= FETCH SCHOOL ================= */
  useEffect(() => {
    const fetchSchool = async () => {
      if (!schoolId) return;

      try {
        const ref = doc(db, "schools", schoolId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setSchool(snap.data());
        }
      } catch (err) {
        console.error("Failed to fetch school:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchool();
  }, [schoolId]);

  /* ================= SAVE ================= */
  const handleSave = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, "schools", schoolId), school);
      alert("School profile updated successfully");
    } catch (err) {
      console.error(err);
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6 text-gray-500">Loading settings...</p>;
  if (!school) return <p className="p-6 text-red-500">School not found</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-gray-500">
          Manage school configuration
        </p>
      </div>

      <Tabs defaultValue="school">
        <TabsList>
          <TabsTrigger value="school">School Profile</TabsTrigger>
          <TabsTrigger value="academic">Academic Year</TabsTrigger>
          <TabsTrigger value="subjects_classes">Subject & Classes</TabsTrigger>
          <TabsTrigger value="Teacher_Assignment">Teacher Assignment</TabsTrigger>
          <TabsTrigger value="time_periods">Time Periods</TabsTrigger>
          <TabsTrigger value="custom_fields">Custom Fields</TabsTrigger>
        </TabsList>

        {/* ================= SCHOOL PROFILE ================= */}
        <TabsContent value="school">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <School size={20} />
                </div>
                <h2 className="text-lg font-semibold">
                  School Information
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField label="School Name" value={school.name}
                  onChange={(v) => setSchool({ ...school, name: v })} />

                <InputField label="School Code" value={school.code}
                  onChange={(v) => setSchool({ ...school, code: v })} />

                <InputField label="Email" value={school.email}
                  onChange={(v) => setSchool({ ...school, email: v })} />

                <InputField label="Phone" value={school.phone}
                  onChange={(v) => setSchool({ ...school, phone: v })} />

                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Address</label>
                  <Textarea
                    value={school.address}
                    onChange={(e) =>
                      setSchool({ ...school, address: e.target.value })
                    }
                  />
                </div>

                <InputField label="Principal Name" value={school.principalName}
                  onChange={(v) => setSchool({ ...school, principalName: v })} />

                <InputField label="Established Year" value={school.establishedYear}
                  onChange={(v) => setSchool({ ...school, establishedYear: v })} />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ACADEMIC YEAR ================= */}
        <TabsContent value="academic">
          <Card>
            <CardContent className="p-6 space-y-4">
              <label className="text-sm font-medium">
                Current Academic Year
              </label>

              <Select
                value={school.currentSession}
                onValueChange={(val) =>
                  setSchool({ ...school, currentSession: val })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2023-2024">2023–2024</SelectItem>
                  <SelectItem value="2024-2025">2024–2025</SelectItem>
                  <SelectItem value="2025-2026">2025–2026</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= Subject & Claases  ================= */}
        <TabsContent value="subjects_classes">
              <SubjectManagement/>
              <ClassManagement/>
              <ClassSubjectManagement/>
        </TabsContent>
        {/* ================= Teacher Assignment  ================= */}
        <TabsContent value="Teacher_Assignment">
          <TeacherAssignment/>
        </TabsContent>

        {/* ================= Time Periods ================= */}
        <TabsContent value="time_periods">
          <TimePeriodManagement />
        </TabsContent>

        {/* ================= Custom Fields ================= */}
        <TabsContent value="custom_fields">
          <CustomFieldManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const InputField = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium">{label}</label>
    <Input value={value || ""} onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default Settings;
