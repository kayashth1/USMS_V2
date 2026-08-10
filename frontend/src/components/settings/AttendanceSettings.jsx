import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Clock, Lock, FileEdit } from "lucide-react";
import { getAttendanceSettings, saveAttendanceSettings } from "@/services/attendance.service";

const AttendanceSettings = ({ schoolId }) => {
  const [settings, setSettings] = useState({
    openBeforeMinutes: 10,
    closeAfterMinutes: 15,
    lockImmediately: false,
    allowCorrections: false,
  });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [message,  setMessage]  = useState(null); // { type: "success"|"error", text }

  useEffect(() => {
    if (!schoolId) return;
    getAttendanceSettings(schoolId)
      .then(setSettings)
      .catch(() => setMessage({ type: "error", text: "Failed to load settings." }))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const set = (key) => (val) => setSettings((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    // Basic validation
    const open  = parseInt(settings.openBeforeMinutes, 10);
    const close = parseInt(settings.closeAfterMinutes, 10);
    if (isNaN(open) || open < 0 || open > 120) {
      setMessage({ type: "error", text: "Open window must be between 0 and 120 minutes." });
      return;
    }
    if (isNaN(close) || close < 0 || close > 120) {
      setMessage({ type: "error", text: "Close window must be between 0 and 120 minutes." });
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      await saveAttendanceSettings(schoolId, { ...settings, openBeforeMinutes: open, closeAfterMinutes: close });
      setMessage({ type: "success", text: "Attendance settings saved. The Teacher App will use these values." });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-md bg-gray-100 animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Attendance Window */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Clock size={16} className="text-indigo-500" />
              Attendance Window
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Controls when teachers can open the attendance screen relative to the period's scheduled time.
              These values are read by the Teacher App to enable or disable the attendance button.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Open before class (minutes)</label>
              <Input
                type="number"
                min={0}
                max={120}
                value={settings.openBeforeMinutes}
                onChange={(e) => set("openBeforeMinutes")(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-gray-400">
                Attendance button becomes available this many minutes before the period starts.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Close after class (minutes)</label>
              <Input
                type="number"
                min={0}
                max={120}
                value={settings.closeAfterMinutes}
                onChange={(e) => set("closeAfterMinutes")(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-gray-400">
                Attendance button is disabled this many minutes after the period starts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lock Policy */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Lock size={16} className="text-indigo-500" />
            Lock Policy
          </h2>

          <Toggle
            checked={settings.lockImmediately}
            onChange={set("lockImmediately")}
            label="Lock attendance immediately after save"
            description="When enabled, teachers cannot edit attendance after submitting. When disabled, they can update within the attendance window."
          />
        </CardContent>
      </Card>

      {/* Correction Requests — placeholder */}
      <Card className="opacity-60">
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <FileEdit size={16} className="text-gray-400" />
            Correction Requests
            <span className="ml-2 text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-normal">Coming soon</span>
          </h2>

          <Toggle
            checked={settings.allowCorrections}
            onChange={set("allowCorrections")}
            label="Allow teachers to submit correction requests"
            description="Teachers will be able to flag attendance records for principal review. Approval workflow is not yet implemented."
            disabled
          />
        </CardContent>
      </Card>

      {/* Message */}
      {message && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Attendance Settings"}
        </Button>
      </div>
    </div>
  );
};

const Toggle = ({ checked, onChange, label, description, disabled = false }) => (
  <label className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
    <div className="relative mt-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className={`w-9 h-5 rounded-full transition-colors peer-checked:bg-indigo-600 ${disabled ? "bg-gray-200" : "bg-gray-300"}`} />
      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
    </div>
    <div>
      <p className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-700"}`}>{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
    </div>
  </label>
);

export default AttendanceSettings;
