import { useState } from "react";
import { BookOpen, MoreVertical, Pencil, Trash2, Layers } from "lucide-react";
import { Visibility } from "@/library";

const VISIBILITY_BADGE = {
  [Visibility.FREE]:             { label: "Free",    cls: "bg-green-100 text-green-700" },
  [Visibility.PREMIUM]:          { label: "Premium", cls: "bg-amber-100 text-amber-700" },
  [Visibility.SELECTED_SCHOOLS]: { label: "Schools", cls: "bg-blue-100  text-blue-700"  },
};

export default function CollectionCard({ collection, onClick, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const visBadge = VISIBILITY_BADGE[collection.visibility] ?? VISIBILITY_BADGE[Visibility.FREE];
  const count    = collection.resourceIds?.length ?? 0;
  const isArchived = !collection.isActive;

  return (
    <div
      onClick={() => { if (!menuOpen) onClick(collection); }}
      className={`relative group bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md cursor-pointer ${isArchived ? "opacity-60" : ""}`}
    >
      {/* Cover / icon */}
      <div className="h-32 bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center relative overflow-hidden">
        {collection.coverImageUrl ? (
          <img src={collection.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <BookOpen size={36} className="text-indigo-400" />
        )}
        {isArchived && (
          <span className="absolute top-2 left-2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded">
            Archived
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{collection.name}</p>
        {collection.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{collection.description}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Layers size={11} />
            <span>{count} resource{count !== 1 ? "s" : ""}</span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${visBadge.cls}`}>
            {visBadge.label}
          </span>
        </div>
        {(collection.subject || collection.board) && (
          <p className="text-[10px] text-gray-400 mt-1">
            {[collection.subject, collection.board].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="w-7 h-7 bg-white border rounded-md flex items-center justify-center shadow-sm hover:bg-gray-50"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-8 z-20 bg-white border rounded-lg shadow-lg py-1 w-36">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(collection); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(collection); }}
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
