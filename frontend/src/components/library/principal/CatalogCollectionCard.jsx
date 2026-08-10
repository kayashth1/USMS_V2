import { BookOpen, Layers, Eye, BookmarkPlus } from "lucide-react";
import { Visibility } from "@/library";

const VISIBILITY_BADGE = {
  [Visibility.FREE]:             { label: "Free",    cls: "bg-green-100 text-green-700" },
  [Visibility.PREMIUM]:          { label: "Premium", cls: "bg-amber-100 text-amber-700" },
  [Visibility.SELECTED_SCHOOLS]: { label: "Schools", cls: "bg-blue-100  text-blue-700"  },
};

export default function CatalogCollectionCard({ collection, onView, onAssign }) {
  const visBadge = VISIBILITY_BADGE[collection.visibility] ?? VISIBILITY_BADGE[Visibility.FREE];
  const count    = collection.resourceIds?.length ?? 0;

  return (
    <div className="bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md flex flex-col">
      {/* Cover */}
      <div className="h-28 bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center relative overflow-hidden">
        {collection.coverImageUrl ? (
          <img src={collection.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <BookOpen size={30} className="text-indigo-400" />
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{collection.name}</p>
        {collection.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{collection.description}</p>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Layers size={11} />
            <span>{count} resource{count !== 1 ? "s" : ""}</span>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${visBadge.cls}`}>
            {visBadge.label}
          </span>
        </div>

        {(collection.subject || collection.board) && (
          <p className="text-[10px] text-gray-400 mt-1">
            {[collection.subject, collection.board].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto pt-3 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onView(collection)}
            className="flex items-center justify-center gap-1 text-xs text-gray-600 border rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Eye size={11} /> View
          </button>
          <button
            onClick={() => onAssign(collection)}
            className="flex items-center justify-center gap-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition-colors font-medium"
          >
            <BookmarkPlus size={11} /> Assign All
          </button>
        </div>
      </div>
    </div>
  );
}
