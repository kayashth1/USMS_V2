import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import VisibilitySelector from "./VisibilitySelector";
import { SUBJECTS, GRADES, Board, Visibility, createCollection, updateCollection } from "@/library";
import { X } from "lucide-react";

function TagInput({ tags, onChange }) {
  const [val, setVal] = useState("");
  const add = () => {
    const t = val.trim().replace(/,+$/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  };
  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
              {t}
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-500">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="Type a tag and press Enter…"
      />
    </div>
  );
}

function GradePicker({ selected, onChange }) {
  const toggle = (g) =>
    onChange(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {GRADES.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => toggle(g)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            selected.includes(g)
              ? "bg-indigo-600 text-white border-indigo-600"
              : "border-gray-300 text-gray-600 hover:border-indigo-400"
          }`}
        >
          {/^\d+$/.test(g) ? `Cl. ${g}` : g}
        </button>
      ))}
    </div>
  );
}

const INIT = {
  name: "", description: "", subject: "", board: "", classIds: [], tags: [],
  visibility: Visibility.FREE, selectedSchoolIds: [],
};

export default function CollectionFormDialog({ open, onOpenChange, collection, onSaved }) {
  const isEdit = !!collection;
  const [form,  setForm]  = useState(INIT);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    if (!open) return;
    if (collection) {
      setForm({
        name:              collection.name              ?? "",
        description:       collection.description       ?? "",
        subject:           collection.subject           ?? "",
        board:             collection.board             ?? "",
        classIds:          collection.classIds          ?? [],
        tags:              collection.tags              ?? [],
        visibility:        collection.visibility        ?? Visibility.FREE,
        selectedSchoolIds: collection.selectedSchoolIds ?? [],
      });
    } else {
      setForm(INIT);
    }
    setError(null);
  }, [open, collection]);

  const set  = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setV = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateCollection(collection.id, form);
      } else {
        await createCollection({ ...form, createdBy: "superadmin" });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v) => {
    if (!saving) onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Collection" : "New Collection"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-sm font-medium block mb-1">Name <span className="text-red-400">*</span></label>
            <Input value={form.name} onChange={setV("name")} placeholder="e.g. CBSE Class 8 Complete Library" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Description</label>
            <Textarea
              value={form.description}
              onChange={setV("description")}
              placeholder="What does this collection contain?"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Subject</label>
              <Select value={form.subject || "_any"} onValueChange={(v) => set("subject")(v === "_any" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any</SelectItem>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Board</label>
              <Select value={form.board || "_any"} onValueChange={(v) => set("board")(v === "_any" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any</SelectItem>
                  {Object.values(Board).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Applicable Classes</label>
            <GradePicker selected={form.classIds} onChange={set("classIds")} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Tags</label>
            <TagInput tags={form.tags} onChange={set("tags")} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Visibility</label>
            <VisibilitySelector
              visibility={form.visibility}
              selectedSchoolIds={form.selectedSchoolIds}
              onChange={({ visibility, selectedSchoolIds }) =>
                setForm((f) => ({ ...f, visibility, selectedSchoolIds }))
              }
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
