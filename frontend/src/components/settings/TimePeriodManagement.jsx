import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { InlineLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import {
  getTimePeriodsBySchool,
  addTimePeriod,
  updateTimePeriod,
  deleteTimePeriod,
} from "@/services/timePeriod.service";

const EMPTY_FORM = { name: "", from: "", to: "", order: "" };

const TimePeriodManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const { toast } = useToast();
  const confirm = useConfirm();

  const [periods, setPeriods]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try { setPeriods(await getTimePeriodsBySchool(schoolId)); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (schoolId) load(); }, [schoolId]);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, order: String(periods.length + 1) });
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setForm({ name: p.name, from: p.from, to: p.to, order: String(p.order) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.from || !form.to) {
      toast.error("Name, From and To are required");
      return;
    }
    if (form.to <= form.from) {
      toast.error(
        "End time must be after start time. If this is an afternoon period, " +
        "double-check you picked PM and not AM in the time picker."
      );
      return;
    }
    setSaving(true);
    try {
      if (editTarget) await updateTimePeriod(editTarget.id, form);
      else            await addTimePeriod({ ...form, schoolId });
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const ok = await confirm("Delete this time period?");
    if (!ok) return;
    await deleteTimePeriod(id);
    load();
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Time Periods</h2>
            <p className="text-xs text-gray-500">
              Define your school's daily periods. These are used in Class &
              Teacher timetables.
            </p>
          </div>
          <Button size="sm" onClick={openAdd}>+ Add Period</Button>
        </div>

        {loading ? (
          <InlineLoader />
        ) : periods.length === 0 ? (
          <p className="text-sm text-gray-400">
            No periods defined yet. Add your first period above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">From</th>
                <th className="px-3 py-2 text-left">To</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {periods.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-gray-400">{p.order}</td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{p.from}</td>
                  <td className="px-3 py-2">{p.to}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>✏️</Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(p.id)}>🗑️</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Period" : "Add Time Period"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Period Name</label>
              <Input
                placeholder="e.g. Period 1, Lunch Break"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">From</label>
                <Input
                  type="time"
                  value={form.from}
                  onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">To</label>
                <Input
                  type="time"
                  value={form.to}
                  onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Order</label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TimePeriodManagement;
