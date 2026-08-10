import { useEffect, useRef, useState } from "react";
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
import {
  FileType, SUBJECTS, GRADES, Board, Visibility,
  updateResource, replaceResourceFile, uploadCoverImage,
} from "@/library";
import { RefreshCw, Upload, X, Image as ImageIcon } from "lucide-react";

const ACCEPTED     = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip";
const COVER_ACCEPT = ".jpg,.jpeg,.png,.webp";
const EXT_TO_TYPE  = { jpeg: FileType.JPG, jpg: FileType.JPG };

const detectType = (file) => {
  const ext = file.name.split(".").pop().toLowerCase();
  return EXT_TO_TYPE[ext] ?? ext;
};

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

function ProgressBar({ label, pct }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-600">{label}</p>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ResourceEditDialog({ open, onOpenChange, resource, onUpdated }) {
  const [form,          setForm]          = useState(null);
  const [newFile,       setNewFile]       = useState(null);
  const [newCoverFile,  setNewCoverFile]  = useState(null);
  const [coverPreview,  setCoverPreview]  = useState(null);
  const [progress,      setProgress]      = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const fileRef  = useRef();
  const coverRef = useRef();

  useEffect(() => {
    if (!resource) { setForm(null); return; }
    setForm({
      name:              resource.name             ?? "",
      description:       resource.description      ?? "",
      subject:           resource.subject          ?? "",
      board:             resource.board            ?? "",
      language:          resource.language         ?? "English",
      author:            resource.author           ?? "",
      publisher:         resource.publisher        ?? "",
      classIds:          resource.classIds         ?? [],
      tags:              resource.tags             ?? [],
      visibility:        resource.visibility       ?? Visibility.FREE,
      selectedSchoolIds: resource.selectedSchoolIds ?? [],
    });
    setCoverPreview(resource.coverImageUrl ?? null);
    setNewFile(null);
    setNewCoverFile(null);
    setError(null);
  }, [resource]);

  if (!form || !resource) return null;

  const set  = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setV = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickCover = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setNewCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let coverPatch = {};

      if (newCoverFile) {
        setProgress({ label: "Uploading cover…", pct: 0 });
        const { coverImagePath, coverImageUrl } = await uploadCoverImage(
          newCoverFile,
          ({ percentage }) => setProgress({ label: "Uploading cover…", pct: percentage })
        );
        coverPatch = { coverImagePath, coverImageUrl };
      }

      if (newFile) {
        setProgress({ label: "Replacing file…", pct: 0 });
        await replaceResourceFile(
          resource.id,
          newFile,
          detectType(newFile),
          ({ percentage }) => setProgress({ label: `Replacing file… ${percentage}%`, pct: percentage })
        );
      }

      setProgress({ label: "Saving changes…", pct: 100 });
      await updateResource(resource.id, { ...form, ...coverPatch });

      onUpdated?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const handleOpenChange = (v) => {
    if (saving) return;
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Resource</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
          {/* Replace file */}
          <div className="border border-dashed rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current File</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{resource.storagePath?.split("/").pop()}</p>
                <p className="text-xs text-gray-400 mt-0.5 uppercase">{resource.fileType}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => fileRef.current?.click()}
              >
                <RefreshCw size={13} />
                {newFile ? "Change" : "Replace File"}
              </Button>
            </div>
            {newFile && (
              <div className="mt-2 flex items-center gap-2 bg-indigo-50 rounded-lg p-2">
                <Upload size={13} className="text-indigo-500" />
                <p className="text-xs text-indigo-700 flex-1">{newFile.name}</p>
                <button onClick={() => { setNewFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  <X size={12} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setNewFile(f); }} />
          </div>

          {/* Cover image */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              Cover Image <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {coverPreview ? (
              <div className="flex items-center gap-3">
                <img src={coverPreview} alt="" className="h-20 w-28 object-cover rounded-lg border" />
                <div className="space-y-1.5">
                  <Button size="sm" variant="outline" onClick={() => coverRef.current?.click()} className="gap-1.5">
                    <ImageIcon size={13} /> Change
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                    onClick={() => { setNewCoverFile(null); setCoverPreview(null); }}
                  >
                    <X size={13} /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="flex items-center gap-2 border border-dashed rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <ImageIcon size={15} /> Upload cover image
              </button>
            )}
            <input ref={coverRef} type="file" accept={COVER_ACCEPT} className="hidden" onChange={pickCover} />
          </div>

          {/* Name + Description */}
          <div className="grid gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Name</label>
              <Input value={form.name} onChange={setV("name")} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Description</label>
              <Textarea value={form.description} onChange={setV("description")} rows={2} className="resize-none" />
            </div>
          </div>

          {/* Subject / Board / Language */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Subject</label>
              <Select value={form.subject} onValueChange={set("subject")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Board</label>
              <Select value={form.board} onValueChange={set("board")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(Board).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Language</label>
              <Input value={form.language} onChange={setV("language")} />
            </div>
          </div>

          {/* Author / Publisher */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Author</label>
              <Input value={form.author} onChange={setV("author")} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Publisher</label>
              <Input value={form.publisher} onChange={setV("publisher")} />
            </div>
          </div>

          {/* Classes */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Applicable Classes</label>
            <GradePicker selected={form.classIds} onChange={set("classIds")} />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Tags</label>
            <TagInput tags={form.tags} onChange={set("tags")} />
          </div>

          {/* Visibility */}
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
          {progress && <ProgressBar label={progress.label} pct={progress.pct} />}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
