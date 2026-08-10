import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  createFeeStructure,
  deactivateFeeStructure,
  getAllFeeStructuresOrdered,
} from "@/fees-v2";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

const EMPTY = {
  type:                  "fixed",
  classId:               "",
  label:                 "",
  amount:                "",
  isOneTime:             false,
  chargedDuringHolidays: true,
  allocationPriority:    "",
};

export default function FeeStructuresDialog({ open, onOpenChange, schoolId, classes = [] }) {
  const confirm = useConfirm();
  const [structures, setStructures] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [deactId,    setDeactId]    = useState(null);
  const [filterType, setFilterType] = useState("all");

  const sortedClasses = useMemo(() =>
    [...classes].sort((a, b) =>
      Number(a.grade) - Number(b.grade) || a.section.localeCompare(b.section)
    ),
  [classes]);

  const classMap = useMemo(() => {
    const m = {};
    classes.forEach((c) => { m[c.docId] = `Class ${c.grade}-${c.section}`; });
    return m;
  }, [classes]);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      setStructures(await getAllFeeStructuresOrdered(schoolId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, schoolId]);

  const set = (key, val) => { setForm((p) => ({ ...p, [key]: val })); setError(null); };

  const handleCreate = async () => {
    if (!form.label.trim())                       { setError("Fee label is required"); return; }
    const amount = Number(form.amount);
    if (!form.amount || isNaN(amount) || amount < 0) { setError("Enter a valid amount (0 or more)"); return; }
    if (form.type === "fixed" && !form.classId)   { setError("Select a class for fixed fee"); return; }

    setSaving(true);
    setError(null);
    try {
      await createFeeStructure({
        schoolId,
        type:                  form.type,
        classId:               form.type === "fixed" ? form.classId   : null,
        classLabel:            form.type === "fixed" ? (classMap[form.classId] ?? "") : null,
        label:                 form.label.trim(),
        amount,
        isOneTime:             form.isOneTime,
        chargedDuringHolidays: form.chargedDuringHolidays,
        allocationPriority:    form.allocationPriority ? Number(form.allocationPriority) : 999,
      });
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    const ok = await confirm("Deactivate this fee structure? It won't appear in new profiles.");
    if (!ok) return;
    setDeactId(id);
    try {
      await deactivateFeeStructure(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeactId(null);
    }
  };

  const filtered = filterType === "all" ? structures : structures.filter((s) => s.type === filterType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fee Structures</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm max-h-[80vh] overflow-y-auto pr-1">

          {/* ── Create form ── */}
          <div className="border rounded-md p-4 space-y-3 bg-gray-50">
            <p className="font-semibold text-gray-700">Add New Fee Structure</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Type</label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed (per class)</SelectItem>
                    <SelectItem value="variable">Variable (school-wide)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === "fixed" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Class</label>
                  <Select value={form.classId} onValueChange={(v) => set("classId", v)}>
                    <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                    <SelectContent>
                      {sortedClasses.map((c) => (
                        <SelectItem key={c.docId} value={c.docId}>
                          Class {c.grade}-{c.section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Fee Label</label>
                <Input
                  placeholder="e.g. Tuition Fee, Transport…"
                  value={form.label}
                  onChange={(e) => set("label", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Amount per cycle (₹)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 items-center">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isOneTime}
                  onChange={(e) => set("isOneTime", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-xs text-gray-600">One-time (first installment only)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.chargedDuringHolidays}
                  onChange={(e) => set("chargedDuringHolidays", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-xs text-gray-600">Charge during holiday months</span>
              </label>
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1 w-48">
                <label className="text-xs font-medium text-gray-600">
                  Priority <span className="font-normal text-gray-400">(lower = paid first)</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="999"
                  value={form.allocationPriority}
                  onChange={(e) => set("allocationPriority", e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Adding…" : "Add Fee Structure"}
              </Button>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
          </div>

          {/* ── List ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-700">
                Active Structures
                {structures.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length})</span>
                )}
              </p>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="fixed">Fixed Only</SelectItem>
                  <SelectItem value="variable">Variable Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <p className="text-center text-gray-400 py-6 text-xs">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-xs italic">
                {structures.length === 0
                  ? "No fee structures yet. Add one above."
                  : "No structures match this filter."}
              </p>
            ) : (
              <div className="border rounded-md divide-y">
                {filtered.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{s.label}</span>
                        <Badge className={s.type === "fixed"
                          ? "bg-indigo-100 text-indigo-600 text-xs"
                          : "bg-purple-100 text-purple-600 text-xs"}>
                          {s.type}
                        </Badge>
                        {s.isOneTime && <Badge className="bg-amber-100 text-amber-600 text-xs">one-time</Badge>}
                        {!s.chargedDuringHolidays && <Badge className="bg-orange-100 text-orange-500 text-xs">excl. holidays</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.type === "fixed" && s.classLabel ? `${s.classLabel} · ` : ""}
                        Priority: {s.allocationPriority ?? 999}
                      </p>
                    </div>
                    <span className="font-semibold text-gray-700 shrink-0 tabular-nums">
                      {INR(s.amount)}{s.isOneTime ? "" : "/cycle"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-red-400 hover:text-red-600 h-7 px-2 shrink-0"
                      disabled={deactId === s.id}
                      onClick={() => handleDeactivate(s.id)}
                    >
                      {deactId === s.id ? "…" : "Deactivate"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
