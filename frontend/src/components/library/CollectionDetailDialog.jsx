import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getAllResources, addResourceToCollection, removeResourceFromCollection,
  reorderCollectionResources, getCollectionWithResources, FileType, FILE_TYPE_LABELS,
} from "@/library";
import {
  Plus, X, ChevronUp, ChevronDown, Search, FileText, Image, Music, Video, Table, Package,
} from "lucide-react";

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

export default function CollectionDetailDialog({ open, onOpenChange, collection, onChanged }) {
  const [resources,    setResources]    = useState([]); // ordered resources in collection
  const [allResources, setAllResources] = useState([]); // full catalog
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(null); // resourceId being mutated
  const [addSearch,    setAddSearch]    = useState("");
  const [showPicker,   setShowPicker]   = useState(false);

  useEffect(() => {
    if (!open || !collection) return;
    setShowPicker(false);
    setAddSearch("");
    load();
  }, [open, collection]);

  const load = async () => {
    setLoading(true);
    try {
      const [detail, catalog] = await Promise.all([
        getCollectionWithResources(collection.id),
        getAllResources(),
      ]);
      setResources(detail?.resources ?? []);
      setAllResources(catalog);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const inCollection = new Set(resources.map((r) => r.id));

  const handleAdd = async (resource) => {
    setSaving(resource.id);
    try {
      await addResourceToCollection(collection.id, resource.id);
      setResources((prev) => [...prev, resource]);
      setAddSearch("");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
    onChanged?.();
  };

  const handleRemove = async (resource) => {
    setSaving(resource.id);
    try {
      await removeResourceFromCollection(collection.id, resource.id);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
    onChanged?.();
  };

  const move = async (index, dir) => {
    const next = [...resources];
    const to   = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setResources(next);
    try {
      await reorderCollectionResources(collection.id, next.map((r) => r.id));
    } catch (e) {
      console.error(e);
      setResources(resources); // revert
    }
    onChanged?.();
  };

  const catalogMatches = allResources.filter((r) => {
    if (inCollection.has(r.id)) return false;
    if (!addSearch.trim()) return true;
    const q = addSearch.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q) ||
      r.board?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>{collection?.name}</span>
            <span className="text-sm font-normal text-gray-500">{resources.length} resource{resources.length !== 1 ? "s" : ""}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Current resources */}
            {resources.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No resources in this collection yet.</p>
            ) : (
              <div className="space-y-1">
                {resources.map((r, i) => {
                  const { Icon, cls } = TYPE_ICON[r.fileType] ?? { Icon: FileText, cls: "text-gray-500" };
                  const busy = saving === r.id;
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 border rounded-lg bg-white hover:bg-gray-50">
                      {/* Sort order */}
                      <span className="w-5 text-xs font-mono text-gray-400 shrink-0 text-right">{i + 1}</span>

                      {/* Icon / cover */}
                      {r.coverImageUrl ? (
                        <img src={r.coverImageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      ) : (
                        <Icon size={18} className={`shrink-0 ${cls}`} />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                        <p className="text-xs text-gray-400">
                          {r.subject} · {FILE_TYPE_LABELS[r.fileType] ?? r.fileType?.toUpperCase()}
                        </p>
                      </div>

                      {/* Reorder */}
                      <div className="flex flex-col">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0 || !!saving}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"
                        ><ChevronUp size={14} /></button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === resources.length - 1 || !!saving}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"
                        ><ChevronDown size={14} /></button>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemove(r)}
                        disabled={busy}
                        className="ml-1 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                        title="Remove from collection"
                      >
                        {busy ? <Spinner size="sm" /> : <X size={15} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add resources section */}
            <div className="border-t pt-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 w-full justify-center"
                onClick={() => setShowPicker((v) => !v)}
              >
                <Plus size={14} />
                {showPicker ? "Close" : "Add Resources"}
              </Button>

              {showPicker && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="Search resources to add…"
                      className="pl-8"
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-1">
                    {catalogMatches.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">
                        {addSearch ? "No matching resources" : "All resources already in collection"}
                      </p>
                    ) : (
                      catalogMatches.slice(0, 30).map((r) => {
                        const { Icon, cls } = TYPE_ICON[r.fileType] ?? { Icon: FileText, cls: "text-gray-500" };
                        const busy = saving === r.id;
                        return (
                          <div key={r.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                            <Icon size={16} className={`shrink-0 ${cls}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                              <p className="text-xs text-gray-400">{r.subject} · {r.board}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 shrink-0"
                              disabled={busy}
                              onClick={() => handleAdd(r)}
                            >
                              {busy ? <Spinner size="sm" /> : <Plus size={12} />}
                              Add
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
