import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import {
  getSchool,
  getPrincipalBySchool,
  getSchoolEntityCounts,
  updateSchoolSubscription,
  deleteSchool,
} from "@/services/superadmin.service";

const PLAN_STYLES = {
  free:    "bg-gray-100 text-gray-700",
  premium: "bg-amber-100 text-amber-700",
};

const SuperAdminSchoolDetail = () => {
  const { schoolId } = useParams();
  const navigate = useNavigate();

  const [school,    setSchool]    = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [counts,    setCounts]    = useState(null);
  const [loading,   setLoading]   = useState(true);

  // Subscription form state
  const [plan,           setPlan]           = useState("free");
  const [planExpiresAt,  setPlanExpiresAt]  = useState("");
  const [isActive,       setIsActive]       = useState(true);
  const [saving,         setSaving]         = useState(false);

  // Delete state
  const [deleteInput,    setDeleteInput]    = useState("");
  const [deleting,       setDeleting]       = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p, c] = await Promise.all([
          getSchool(schoolId),
          getPrincipalBySchool(schoolId),
          getSchoolEntityCounts(schoolId),
        ]);
        setSchool(s);
        setPrincipal(p);
        setCounts(c);

        if (s) {
          setPlan(s.plan || "free");
          setIsActive(s.isActive !== false);
          if (s.planExpiresAt?.toDate) {
            setPlanExpiresAt(s.planExpiresAt.toDate().toISOString().split("T")[0]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schoolId]);

  const handleSaveSubscription = async () => {
    try {
      setSaving(true);
      await updateSchoolSubscription(schoolId, {
        plan,
        planExpiresAt: planExpiresAt || null,
        isActive,
      });
      setSchool((s) => ({ ...s, plan, isActive }));
      alert("Subscription updated.");
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteInput !== school?.name) {
      return alert("School name doesn't match. Deletion cancelled.");
    }
    if (!confirm("This will permanently delete ALL data for this school. Are you absolutely sure?")) return;

    try {
      setDeleting(true);
      await deleteSchool(schoolId);
      navigate("/superadmin/schools");
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      <div className="h-4 w-16 bg-gray-100 rounded" />
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 bg-gray-100 rounded" />
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
        <div className="h-5 w-14 bg-gray-100 rounded-full" />
      </div>
      <Card><CardContent className="p-6 grid grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-5 w-36 bg-gray-100 rounded" />
          </div>
        ))}
      </CardContent></Card>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded" />
          ))}
        </CardContent></Card>
        <Card><CardContent className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded" />
          ))}
        </CardContent></Card>
      </div>
    </div>
  );
  if (!school)  return <p className="text-red-500">School not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <Badge className={school.isActive === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
            {school.isActive === false ? "Inactive" : "Active"}
          </Badge>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLAN_STYLES[school.plan] || PLAN_STYLES.free}`}>
            {school.plan || "free"}
          </span>
        </div>
      </div>

      {/* School Info */}
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Info label="School Code"  value={school.code} />
          <Info label="Email"        value={school.email} />
          <Info label="Phone"        value={school.phone} />
          <Info label="Address"      value={school.address} />
        </CardContent>
      </Card>

      {/* Principal + Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-semibold">Principal</h2>
            <Info label="Name"  value={principal?.fullName} />
            <Info label="Email" value={principal?.email} />
            <Info label="Phone" value={principal?.phone} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-semibold">Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{counts?.students ?? "—"}</p>
                <p className="text-xs text-blue-600 mt-0.5">Students</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{counts?.teachers ?? "—"}</p>
                <p className="text-xs text-amber-600 mt-0.5">Teachers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Management */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h2 className="font-semibold">Subscription</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Plan Expires On</Label>
              <Input
                type="date"
                value={planExpiresAt}
                onChange={(e) => setPlanExpiresAt(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Account Status</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-sm">{isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSubscription} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold text-red-600">Danger Zone</h2>
          <p className="text-sm text-gray-600">
            Permanently deletes this school along with all students, teachers, classes, fees, attendance, timetables, and associated Firebase Auth accounts. <strong>This cannot be undone.</strong>
          </p>
          <div className="space-y-2">
            <Label className="text-sm">
              Type <span className="font-mono font-semibold">{school.name}</span> to confirm
            </Label>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={school.name}
              className="border-red-200 focus-visible:ring-red-400"
            />
          </div>
          <Button
            variant="destructive"
            disabled={deleteInput !== school.name || deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting..." : "Delete School Permanently"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="font-medium">{value || "—"}</p>
  </div>
);

export default SuperAdminSchoolDetail;
