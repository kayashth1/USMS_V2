import {
  FileText, Image, Music, Video, Table, Package, BookmarkPlus, BookmarkCheck,
} from "lucide-react";
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

export default function CatalogResourceCard({ resource, assignedToClasses = [], classes = [], onAssign }) {
  const typeInfo = TYPE_ICON[resource.fileType] ?? TYPE_ICON[FileType.PDF];
  const { Icon, bg, fg } = typeInfo;
  const visBadge = VISIBILITY_BADGE[resource.visibility] ?? VISIBILITY_BADGE[Visibility.FREE];
  const isAssigned = assignedToClasses.length > 0;

  // Build class labels for assigned classes
  const classMap = Object.fromEntries(classes.map((c) => [c.docId, c]));
  const assignedLabels = assignedToClasses.slice(0, 2).map((id) => {
    const c = classMap[id];
    return c ? `Cl.${c.grade}${c.section || ""}` : id;
  });
  const extraCount = assignedToClasses.length - assignedLabels.length;

  return (
    <div className="bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md flex flex-col">
      {/* Thumbnail */}
      <div className="relative h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
        {resource.coverImageUrl ? (
          <img src={resource.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg}`}>
            <Icon size={24} className={fg} />
          </div>
        )}
        <span className="absolute top-2 right-2 bg-white border text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm uppercase text-gray-600">
          {FILE_TYPE_LABELS[resource.fileType] ?? resource.fileType?.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">
          {resource.name}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{resource.subject} · {resource.board}</p>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${visBadge.cls}`}>
            {visBadge.label}
          </span>
          {resource.classIds?.slice(0, 2).map((g) => (
            <span key={g} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {/^\d+$/.test(g) ? `Cl.${g}` : g}
            </span>
          ))}
        </div>

        {/* Assignment status */}
        <div className="mt-auto pt-3">
          {isAssigned ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-green-700">
                <BookmarkCheck size={12} />
                <span className="font-medium">Assigned:</span>
                <span>{assignedLabels.join(", ")}{extraCount > 0 ? ` +${extraCount}` : ""}</span>
              </div>
              <button
                onClick={() => onAssign(resource)}
                className="w-full text-xs text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors font-medium"
              >
                Edit Assignment
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAssign(resource)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors font-medium"
            >
              <BookmarkPlus size={12} />
              Assign to Class
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
