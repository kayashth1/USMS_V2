import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchool } from "@/services/superadmin.service";

const EMPTY = {
  schoolName: "", schoolCode: "", schoolEmail: "", schoolPhone: "", schoolAddress: "",
  principalName: "", principalEmail: "", principalPassword: "",
};

const SuperAdminCreateSchool = () => {
  const navigate = useNavigate();
  const [form,    setForm]    = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async () => {
    const { schoolName, principalName, principalEmail, principalPassword } = form;
    if (!schoolName || !principalName || !principalEmail || !principalPassword) {
      return alert("School name, principal name, email and password are required.");
    }

    try {
      setLoading(true);
      await createSchool(form);
      navigate("/superadmin/schools");
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">
          ← Back
        </button>
        <h1 className="text-2xl font-semibold">Add New School</h1>
        <p className="text-gray-500">Creates the school and a principal account in one step.</p>
      </div>

      {/* School Details */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold text-base">School Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="School Name *" name="schoolName"  value={form.schoolName}  onChange={handleChange} />
            <Field label="School Code"   name="schoolCode"  value={form.schoolCode}  onChange={handleChange} />
            <Field label="Email"         name="schoolEmail" value={form.schoolEmail} onChange={handleChange} type="email" />
            <Field label="Phone"         name="schoolPhone" value={form.schoolPhone} onChange={handleChange} />
            <div className="md:col-span-2">
              <Field label="Address" name="schoolAddress" value={form.schoolAddress} onChange={handleChange} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Principal Details */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold text-base">Principal Account</h2>
          <p className="text-sm text-gray-500">A Firebase Auth account will be created with these credentials.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Principal Name *"     name="principalName"     value={form.principalName}     onChange={handleChange} />
            <Field label="Principal Email *"    name="principalEmail"    value={form.principalEmail}    onChange={handleChange} type="email" />
            <Field label="Principal Password *" name="principalPassword" value={form.principalPassword} onChange={handleChange} type="password" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate(-1)} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Creating..." : "Create School"}
        </Button>
      </div>
    </div>
  );
};

const Field = ({ label, name, value, onChange, type = "text" }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Input type={type} name={name} value={value} onChange={onChange} />
  </div>
);

export default SuperAdminCreateSchool;
