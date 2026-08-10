/**
 * CollectionViewDialog (Principal read-only view)
 * Shows an ordered list of resources in a collection.
 * Each resource has an individual "Assign" button.
 * A header "Assign All" assigns the full collection.
 */

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }  from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  getCollectionWithResources, FileType, FILE_TYPE_LABELS, Visibility,
} from "@/library";
import { FileText, Image, Music, Video, Table, Package, BookmarkPlus, Layers } from "lucide-react";

const TYPE_ICON = {
  [FileType.PDF]:  { Icon: FileText, cls: "text-red-500"    },
  [FileType.DOC]:  { Icon: FileText, cls: "text-blue-500"   },
  [FileType.DOCX]: { Icon: FileText, cls: "text-blue-500"   },
  [FileType.PPT]:  { Icon: FileText, cls: "text-orange-500" },
  [FileType.PPTX]: { Icon: FileText, cls: "text-orange-500" },
  [FileType.XLS]:  { Icon: Table,    cls: "text-green-500"  },
  [FileType.XLSX]: { Icon: Table,    cls: "text-green-500"  },
  [FileType.JPG]:  { Icon: Image,    cls: "text-purple-500" },
  [FileType.PNG]:  { Icon: Image,    cls: "text-purple-500" },
  [FileType.WEBP]: { Icon: Image,    cls: "text-purple-500" },
  [FileType.MP3]:  { Icon: Music,    cls: "text-pink-500"   },
  [FileType.MP4]:  { Icon: Video,    cls: "text-teal-500"   },
  [FileType.ZIP]:  { Icon: Package,  cls: "text-gray-500"   },
};

const VISIBILITY_BADGE = {
  [Visibility.FREE]:             "bg-green-100 text-green-700",
  [Visibility.PREMIUM]:          "bg-amber-100 text-amber-700",
  [Visibility.SELECTED_SCHOOLS]: "bg-blue-100  text-blue-700",
};

export default function CollectionViewDialog({
  open,
  onOpenChange,
  collection,
  assignmentMap,
  classes,
  onAssignResource,
  onAssignCollection,
}) {
  const [resources, setResources] = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!open || !collection) return;
    setLoading(true);
    getCollectionWithResources(collection.id)
      .then((detail) => setResources(detail?.resources ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, collection]);

  if (!collection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers size={16} className="text-indigo-500" />
            {collection.name}
          </DialogTitle>
        </DialogHeader>

        {/* Collection meta */}
        <div className="flex items-center gap-2 -mt-1">
          {collection.description && (
            <p className="text-xs text-gray-500 flex-1 line-clamp-1">{collection.description}</p>
          )}
          {collection.visibility && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${VISIBILITY_BADGE[collection.visibility] ?? VISIBILITY_BADGE[Visibility.FREE]}`}>
              {collection.visibility === Visibility.FREE ? "Free" : collection.visibility === Visibility.PREMIUM ? "Premium" : "Selected Schools"}
            </span>
          )}
        </div>

        {/* Assign All */}
        <Button
          variant="outline"
          className="w-full gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          onClick={() => onAssignCollection(collection, resources.map((r) => r.id))}
        >
          <BookmarkPlus size={14} />
          Assign Entire Collection to Class
        </Button>

        {/* Resource list */}
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : resources.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No resources in this collection.</p>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {resources.map((r, i) => {
              const { Icon, cls } = TYPE_ICON[r.fileType] ?? { Icon: FileText, cls: "text-gray-500" };
              const assignedClassIds = assignmentMap?.[r.id] ?? [];
              const isAssigned = assignedClassIds.length > 0;

              const classMap = Object.fromEntries((classes ?? []).map((c) => [c.docId, c]));
              const assignedLabel = assignedClassIds.slice(0, 2).map((id) => {
                const c = classMap[id];
                return c ? `Cl.${c.grade}${c.section || ""}` : id;
              }).join(", ");
              const extra = assignedClassIds.length > 2 ? ` +${assignedClassIds.length - 2}` : "";

              return (
                <div key={r.id} className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}</span>

                  {r.coverImageUrl ? (
                    <img src={r.coverImageUrl} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                  ) : (
                    <Icon size={18} className={`shrink-0 ${cls}`} />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400">
                      {r.subject} · {FILE_TYPE_LABELS[r.fileType] ?? r.fileType?.toUpperCase()}
                    </p>
                  </div>

                  {isAssigned && (
                    <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">
                      {assignedLabel}{extra}
                    </span>
                  )}

                  <button
                    onClick={() => onAssignResource(r)}
                    className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      isAssigned
                        ? "border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                        : "border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    <BookmarkPlus size={11} />
                    {isAssigned ? "Edit" : "Assign"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
