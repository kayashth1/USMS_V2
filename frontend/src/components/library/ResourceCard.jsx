import { useState } from "react";
import {
  FileText, Image, Music, Video, Table, Package, MoreVertical,
  Pencil, Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FileType, FILE_TYPE_LABELS, Visibility } from "@/library";

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

const VISIBILITY_BADGE = {
  [Visibility.FREE]:             { label: "Free",    cls: "bg-green-100 text-green-700"  },
  [Visibility.PREMIUM]:          { label: "Premium", cls: "bg-amber-100 text-amber-700"  },
  [Visibility.SELECTED_SCHOOLS]: { label: "Schools", cls: "bg-blue-100  text-blue-700"   },
};

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ResourceCard({ resource, onEdit, onArchive, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const typeInfo  = TYPE_ICON[resource.fileType] ?? TYPE_ICON[FileType.PDF];
  const { Icon, bg, fg } = typeInfo;
  const visBadge  = VISIBILITY_BADGE[resource.visibility] ?? VISIBILITY_BADGE[Visibility.FREE];
  const isArchived = !resource.isActive;

  return (
    <div className={`relative group bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${isArchived ? "opacity-60" : ""}`}>
      {/* Thumbnail */}
      <div className="relative h-36 bg-gray-50 flex items-center justify-center overflow-hidden">
        {resource.coverImageUrl ? (
          <img src={resource.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${bg}`}>
            <Icon size={28} className={fg} />
          </div>
        )}
        {/* File type badge */}
        <span className="absolute top-2 right-2 bg-white border text-xs font-semibold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wide text-gray-600">
          {FILE_TYPE_LABELS[resource.fileType] ?? resource.fileType?.toUpperCase()}
        </span>
        {isArchived && (
          <span className="absolute top-2 left-2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded">
            Archived
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{resource.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{resource.subject} · {resource.board}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${visBadge.cls}`}>
            {visBadge.label}
          </span>
          {resource.classIds?.slice(0, 3).map((g) => (
            <span key={g} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {/^\d+$/.test(g) ? `Cl. ${g}` : g}
            </span>
          ))}
          {(resource.classIds?.length ?? 0) > 3 && (
            <span className="text-[10px] text-gray-400">+{resource.classIds.length - 3}</span>
          )}
        </div>

        {resource.fileSize && (
          <p className="text-[10px] text-gray-400 mt-1.5">{formatBytes(resource.fileSize)}</p>
        )}
      </div>

      {/* Actions menu */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="w-7 h-7 bg-white border rounded-md flex items-center justify-center shadow-sm hover:bg-gray-50"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-8 z-20 bg-white border rounded-lg shadow-lg py-1 w-40">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(resource); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onArchive(resource); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {isArchived ? <><ArchiveRestore size={13} /> Restore</> : <><Archive size={13} /> Archive</>}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(resource); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
