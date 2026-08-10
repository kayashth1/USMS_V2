import { useState } from "react";
import { Pencil, Trash2, Plus, Check, X, GraduationCap, Users, Lock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { Card, CardContent } from "@/components/ui/card";
import { InlineLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  createCustomFieldDef,
  updateCustomFieldDef,
  deleteCustomFieldDef,
} from "@/services/customFieldDef.service";
import { useCustomFieldDefs } from "@/hooks/useCustomFieldDefs";

const TYPE_LABELS = { text: "Text", number: "Number", date: "Date" };
const EMPTY_NEW   = { label: "", type: "text", required: false };

const DEFAULT_FIELDS = {
  student: ["Full Name", "Email", "Password", "Roll Number", "Class", "Parent Name", "Contact"],
  teacher: ["Full Name", "Employee ID", "Email", "Password", "Phone", "Joining Date", "Address"],
};

// Reusable section for one entity's fields
const FieldSection = ({ schoolId, entity, icon: Icon, title, color }) => {
  const { defs, loading, refresh } = useCustomFieldDefs(schoolId, entity);
  const { toast } = useToast();
  const confirm = useConfirm();

  const [newField,   setNewField]   = useState(EMPTY_NEW);
  const [adding,     setAdding]     = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [editForm,   setEditForm]   = useState({ label: "", required: false });

  const handleAdd = async () => {
    if (!newField.label.trim()) { toast.error("Field label is required"); return; }
    try {
      setAdding(true);
      await createCustomFieldDef(schoolId, entity, newField);
      setNewField(EMPTY_NEW);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (field) => {
    setEditingId(field.id);
    setEditForm({ label: field.label, required: field.required });
  };

  const handleEditSave = async (id) => {
    if (!editForm.label.trim()) { toast.error("Field label is required"); return; }
    try {
      await updateCustomFieldDef(id, { label: editForm.label.trim(), required: editForm.required });
      setEditingId(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (field) => {
    const ok = await confirm({
      title: `Delete field "${field.label}"?`,
      description: "Existing data will be preserved but the field won't appear in forms.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCustomFieldDef(field.id);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Section header */}
        <div className={`flex items-center gap-2 pb-2 border-b ${color}`}>
          <Icon size={16} />
          <h3 className="font-semibold text-sm">{title}</h3>
          <Badge variant="outline" className="ml-auto text-xs">
            {DEFAULT_FIELDS[entity].length + defs.length} field{DEFAULT_FIELDS[entity].length + defs.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Existing fields */}
        <div className="space-y-2 min-h-10">
          {/* Built-in (non-editable) fields */}
          {DEFAULT_FIELDS[entity].map((label) => (
            <div key={label} className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
              <Lock size={12} className="text-gray-400 shrink-0" />
              <span className="flex-1 text-sm text-gray-500">{label}</span>
              <Badge variant="outline" className="text-xs text-gray-400">Built-in</Badge>
            </div>
          ))}

          {/* Separator if there are custom fields */}
          {defs.length > 0 && (
            <p className="text-xs text-gray-400 pt-1">Custom fields</p>
          )}

          {loading && <InlineLoader />}
          {!loading && defs.length === 0 && (
            <p className="text-xs text-gray-400">No custom fields added yet.</p>
          )}
          {defs.map((field) =>
            editingId === field.id ? (
              <div key={field.id} className="flex items-center gap-2 p-2 border rounded-lg bg-indigo-50/40">
                <Input
                  className="flex-1 h-8 text-sm"
                  value={editForm.label}
                  onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
                />
                <div className="flex items-center gap-1">
                  <Switch
                    checked={editForm.required}
                    onCheckedChange={(v) => setEditForm((p) => ({ ...p, required: v }))}
                  />
                  <span className="text-xs text-gray-500">Req</span>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditSave(field.id)}>
                  <Check size={14} className="text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X size={14} className="text-gray-500" />
                </Button>
              </div>
            ) : (
              <div key={field.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <span className="flex-1 text-sm font-medium">{field.label}</span>
                <Badge variant="outline" className="text-xs capitalize">{TYPE_LABELS[field.type] || field.type}</Badge>
                {field.required && <Badge className="text-xs bg-red-100 text-red-700 border-0">Required</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(field)}>
                  <Pencil size={13} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(field)}>
                  <Trash2 size={13} className="text-red-500" />
                </Button>
              </div>
            )
          )}
        </div>

        {/* Add new field */}
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">Add new field</p>
          <div className="flex gap-2 flex-wrap">
            <Input
              className="flex-1 min-w-35 h-8 text-sm"
              placeholder="Field label"
              value={newField.label}
              onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Select value={newField.type} onValueChange={(v) => setNewField((p) => ({ ...p, type: v }))}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={newField.required}
                onCheckedChange={(v) => setNewField((p) => ({ ...p, required: v }))}
              />
              <Label className="text-xs">Required</Label>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={adding || !newField.label.trim()} className="h-8 gap-1">
              <Plus size={13} />
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CustomFieldManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Custom Fields</h2>
        <p className="text-sm text-gray-500">Define extra fields for student and teacher records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FieldSection
          schoolId={schoolId}
          entity="student"
          icon={GraduationCap}
          title="Student Fields"
          color="text-blue-700"
        />
        <FieldSection
          schoolId={schoolId}
          entity="teacher"
          icon={Users}
          title="Teacher Fields"
          color="text-green-700"
        />
      </div>
    </div>
  );
};

export default CustomFieldManagement;
