import { useEffect, useState } from "react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getClassAssignedResources, unassignResourceFromClass, FileType, FILE_TYPE_LABELS } from "@/library";
import { Trash2, FileText, Image, Music, Video, Table, Package, BookmarkX, GraduationCap } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast }   from "@/components/ui/toast";

const TYPE_ICON = {
  [FileType.PDF]:  { Icon: FileText, bg: "bg-red-100",    fg: "text-red-600"    },
  [FileType.DOC]:  { Icon: FileText, bg: "bg-blue-100",   fg: "text-blue-600"   },
  [FileType.DOCX]: { Icon: FileText, bg: "bg-blue-100",   fg: "text-blue-600"   },
  [FileType.PPT]:  { Icon: FileText, bg: "bg-orange-100", fg: "text-orange-600" },
  [FileType.PPTX]: { Icon: FileText, bg: "bg-orange-100", fg: "text-orange-600" },
  [FileType.XLS]:  { Icon: Table,    bg: "bg-green-100",  fg: "text-green-600"  },
  [FileType.XLSX]: { Icon: Table,    bg: "bg-green-100",  fg: "text-green-600"  },
  [FileType.JPG]:  { Icon: Image,    bg: "bg-purple-100", fg: "text-purple-600" },
  [FileType.PNG]:  { Icon: Image,    bg: "bg-purple-100", fg: "text-purple-600" },
  [FileType.WEBP]: { Icon: Image,    bg: "bg-purple-100", fg: "text-purple-600" },
  [FileType.MP3]:  { Icon: Music,    bg: "bg-pink-100",   fg: "text-pink-600"   },
  [FileType.MP4]:  { Icon: Video,    bg: "bg-teal-100",   fg: "text-teal-600"   },
  [FileType.ZIP]:  { Icon: Package,  bg: "bg-gray-100",   fg: "text-gray-600"   },
};

export default function ClassAssignmentsView({ classes, schoolId, onAssignmentChanged }) {
  const confirm     = useConfirm();
  const { toast }   = useToast();
  const [classDocId,  setClassDocId]  = useState("");
  const [resources,   setResources]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [removing,    setRemoving]    = useState(null);

  const sortedClasses = [...(classes ?? [])].sort(
    (a, b) => (a.grade ?? 0) - (b.grade ?? 0) || a.section?.localeCompare(b.section)
  );

  useEffect(() => {
    if (!classDocId) { setResources([]); return; }
    load(classDocId);
  }, [classDocId]);

  const load = async (docId) => {
    setLoading(true);
    try {
      const list = await getClassAssignedResources(schoolId, docId);
      setResources(list);
    } catch (e) {
      toast.error("Failed to load assignments.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (resource) => {
    const ok = await confirm({
      title:        "Remove assignment?",
      description:  `"${resource.name}" will be unassigned from this class. The file is not deleted.`,
      confirmLabel: "Remove",
      danger:       true,
    });
    if (!ok) return;
    setRemoving(resource.id);
    try {
      await unassignResourceFromClass(schoolId, classDocId, resource.id);
      toast.success(`"${resource.name}" removed from class.`);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
      onAssignmentChanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRemoving(null);
    }
  };

  const selectedClass = sortedClasses.find((c) => c.docId === classDocId);
  const classLabel    = selectedClass
    ? `Class ${selectedClass.grade}${selectedClass.section ? ` – ${selectedClass.section}` : ""}`
    : null;

  return (
    <div className="space-y-5">
      {/* Class picker */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-indigo-500" />
          <span className="text-sm font-medium text-gray-700">View assignments for</span>
        </div>
        <Select value={classDocId} onValueChange={setClassDocId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a class…" />
          </SelectTrigger>
          <SelectContent>
            {sortedClasses.map((c) => (
              <SelectItem key={c.docId} value={c.docId}>
                Class {c.grade}{c.section ? ` – ${c.section}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {!classDocId ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BookmarkX size={36} className="mb-3 text-gray-300" />
          <p className="text-sm">Select a class to view its assignments</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BookmarkX size={36} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">
            No resources assigned to {classLabel}
          </p>
          <p className="text-xs mt-1">Browse the catalog to assign resources to this class.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{resources.length}</span> resource{resources.length !== 1 ? "s" : ""} assigned to {classLabel}
            </p>
          </div>

          <div className="space-y-2">
            {resources.map((r) => {
              const typeInfo = TYPE_ICON[r.fileType] ?? TYPE_ICON[FileType.PDF];
              const { Icon, bg, fg } = typeInfo;
              const busy = removing === r.id;

              return (
                <div key={r.id} className="flex items-center gap-3 p-3 border rounded-xl bg-white hover:shadow-sm transition-shadow">
                  {/* Thumbnail */}
                  {r.coverImageUrl ? (
                    <img src={r.coverImageUrl} alt="" className="w-10 h-10 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon size={18} className={fg} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{r.subject}</span>
                      {r.board && <span className="text-xs text-gray-400">· {r.board}</span>}
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {FILE_TYPE_LABELS[r.fileType] ?? r.fileType?.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(r)}
                    disabled={busy}
                    className="shrink-0 flex items-center gap-1.5 text-xs text-red-500 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Remove from class"
                  >
                    {busy ? <Spinner size="sm" /> : <Trash2 size={12} />}
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
