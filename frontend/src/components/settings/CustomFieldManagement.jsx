import { useState } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  createCustomFieldDef,
  updateCustomFieldDef,
  deleteCustomFieldDef,
} from "@/services/customFieldDef.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";

const ENTITIES = [
  { value: "student", label: "Student Fields" },
  { value: "teacher", label: "Teacher Fields" },
];

const TYPE_LABELS = { text: "Text", number: "Number", date: "Date" };

const EMPTY_NEW = { label: "", type: "text", required: false };

const CustomFieldManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");
  const [entity, setEntity] = useState("student");
  const { defs, loading, refresh } = useCustomFieldDefs(schoolId, entity);

  const [newField, setNewField] = useState(EMPTY_NEW);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ label: "", required: false });

  /* ── ADD ── */
  const handleAdd = async () => {
    if (!newField.label.trim()) return alert("Field label is required");
    try {
      setAdding(true);
      await createCustomFieldDef(schoolId, entity, newField);
      setNewField(EMPTY_NEW);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  /* ── EDIT ── */
  const startEdit = (field) => {
    setEditingId(field.id);
    setEditForm({ label: field.label, required: field.required });
  };

  const handleEditSave = async (id) => {
    if (!editForm.label.trim()) return alert("Field label is required");
    try {
      await updateCustomFieldDef(id, { label: editForm.label.trim(), required: editForm.required });
      setEditingId(null);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  /* ── DELETE ── */
  const handleDelete = async (field) => {
    if (!confirm(`Delete field "${field.label}"? Existing data will be preserved on records but the field won't appear in forms anymore.`)) return;
    try {
      await deleteCustomFieldDef(field.id);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Custom Fields</h2>
            <p className="text-sm text-gray-500">
              Define extra fields for student and teacher records
            </p>
          </div>
        </div>

        {/* Entity toggle */}
        <div className="flex gap-2">
          {ENTITIES.map((e) => (
            <button
              key={e.value}
              onClick={() => { setEntity(e.value); setEditingId(null); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                entity === e.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Existing fields list */}
        <div className="space-y-2">
          {loading && <p className="text-sm text-gray-400">Loading...</p>}
          {!loading && defs.length === 0 && (
            <p className="text-sm text-gray-400">No custom fields defined yet.</p>
          )}

          {defs.map((field) =>
            editingId === field.id ? (
              /* ── Inline edit row ── */
              <div key={field.id} className="flex items-center gap-2 p-3 border rounded-lg bg-indigo-50/40">
                <Input
                  className="flex-1"
                  value={editForm.label}
                  onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
                />
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={editForm.required}
                    onCheckedChange={(v) => setEditForm((p) => ({ ...p, required: v }))}
                  />
                  <span className="text-xs text-gray-500">Req</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => handleEditSave(field.id)}>
                  <Check size={16} className="text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                  <X size={16} className="text-gray-500" />
                </Button>
              </div>
            ) : (
              /* ── Display row ── */
              <div key={field.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <span className="flex-1 text-sm font-medium">{field.label}</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {TYPE_LABELS[field.type] || field.type}
                </Badge>
                {field.required && (
                  <Badge className="text-xs bg-red-100 text-red-700 border-0">Required</Badge>
                )}
                <Button size="icon" variant="ghost" onClick={() => startEdit(field)}>
                  <Pencil size={14} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(field)}>
                  <Trash2 size={14} className="text-red-500" />
                </Button>
              </div>
            )
          )}
        </div>

        {/* Add new field form */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Add New Field</p>
          <div className="flex gap-2 flex-wrap">
            <Input
              className="flex-1 min-w-[160px]"
              placeholder="Field label (e.g. Parent Name)"
              value={newField.label}
              onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))}
            />

            <Select
              value={newField.type}
              onValueChange={(v) => setNewField((p) => ({ ...p, type: v }))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                checked={newField.required}
                onCheckedChange={(v) => setNewField((p) => ({ ...p, required: v }))}
              />
              <Label className="text-sm">Required</Label>
            </div>

            <Button onClick={handleAdd} disabled={adding} className="gap-1.5">
              <Plus size={15} />
              {adding ? "Adding..." : "Add Field"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomFieldManagement;
