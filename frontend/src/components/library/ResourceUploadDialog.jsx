import { useRef, useState } from "react";
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
  uploadResourceFile, uploadCoverImage, createResource,
} from "@/library";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { auth } from "@/config/firebase";

const ACCEPTED = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip";
const COVER_ACCEPTED = ".jpg,.jpeg,.png,.webp";
const EXT_TO_TYPE = { jpeg: FileType.JPG, jpg: FileType.JPG };

function detectType(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  return EXT_TO_TYPE[ext] ?? ext;
}

function formatBytes(b) {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Tag input ─────────────────────────────────────────────────────────────────
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

// ── Grade picker ──────────────────────────────────────────────────────────────
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

// ── Upload progress bar ───────────────────────────────────────────────────────
function ProgressBar({ label, pct }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-600">{label}</p>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const INIT_FORM = {
  name: "", description: "", subject: "", board: "", language: "English",
  author: "", publisher: "", classIds: [], tags: [],
  visibility: Visibility.FREE, selectedSchoolIds: [],
};

export default function ResourceUploadDialog({ open, onOpenChange, onCreated }) {
  const [file,       setFile]       = useState(null);
  const [coverFile,  setCoverFile]  = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [form,       setForm]       = useState(INIT_FORM);
  const [progress,   setProgress]   = useState(null); // { label, pct }
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const fileRef  = useRef();
  const coverRef = useRef();

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setV = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickCover = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    if (coverRef.current) coverRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const fileType = detectType(file);
      let coverImagePath = null, coverImageUrl = null;

      if (coverFile) {
        setProgress({ label: "Uploading cover image…", pct: 0 });
        const res = await uploadCoverImage(coverFile, ({ percentage }) =>
          setProgress({ label: "Uploading cover image…", pct: percentage })
        );
        coverImagePath = res.coverImagePath;
        coverImageUrl  = res.coverImageUrl;
      }

      setProgress({ label: "Uploading file…", pct: 0 });
      const { storagePath, downloadUrl, fileSize } = await uploadResourceFile(
        file,
        fileType,
        ({ percentage }) => setProgress({ label: `Uploading file… ${percentage}%`, pct: percentage })
      );

      setProgress({ label: "Saving…", pct: 100 });
      const id = await createResource({
        ...form,
        fileType,
        fileSize,
        storagePath,
        downloadUrl,
        coverImagePath,
        coverImageUrl,
        createdBy: auth.currentUser?.uid ?? "superadmin",
      });

      reset();
      onCreated?.({ id, name: form.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const reset = () => {
    setFile(null); setCoverFile(null); setCoverPreview(null);
    setForm(INIT_FORM); setError(null);
    if (fileRef.current)  fileRef.current.value = "";
    if (coverRef.current) coverRef.current.value = "";
  };

  const handleOpenChange = (v) => {
    if (saving) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const canSubmit = !!file && form.name.trim() && form.subject && form.board;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Resource</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
          {/* File drop zone */}
          <div
            onClick={() => !saving && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              file ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            <Upload size={24} className={`mx-auto mb-2 ${file ? "text-indigo-500" : "text-gray-400"}`} />
            {file ? (
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-indigo-700">{file.name}</p>
                <p className="text-xs text-indigo-500">{formatBytes(file.size)}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-xs text-red-500 hover:underline mt-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-700">Click to select a file</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, PPT, Excel, Image, Audio, Video, ZIP</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
          </div>

          {/* Cover image */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              Cover Image <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {coverPreview ? (
              <div className="relative inline-block">
                <img src={coverPreview} alt="" className="h-24 w-36 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={removeCover}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <ImageIcon size={15} /> Upload cover image
              </button>
            )}
            <input ref={coverRef} type="file" accept={COVER_ACCEPTED} className="hidden" onChange={pickCover} />
          </div>

          {/* Name + Description */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Name <span className="text-red-400">*</span></label>
              <Input value={form.name} onChange={setV("name")} placeholder="e.g. CBSE Class 8 Science Notes" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Description</label>
              <Textarea
                value={form.description}
                onChange={setV("description")}
                placeholder="Brief description…"
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Subject / Board / Language */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Subject <span className="text-red-400">*</span></label>
              <Select value={form.subject} onValueChange={set("subject")}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Board <span className="text-red-400">*</span></label>
              <Select value={form.board} onValueChange={set("board")}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
              <Input value={form.author} onChange={setV("author")} placeholder="Author name" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Publisher</label>
              <Input value={form.publisher} onChange={setV("publisher")} placeholder="Publisher name" />
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
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? "Uploading…" : "Upload Resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
