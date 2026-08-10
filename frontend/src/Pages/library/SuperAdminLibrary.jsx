import { useEffect, useMemo, useState } from "react";
import { Search, Upload, Plus, X, LibraryBig } from "lucide-react";

import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast }    from "@/components/ui/toast";
import { useConfirm }  from "@/components/ui/confirm-dialog";

import ResourceCard            from "@/components/library/ResourceCard";
import CollectionCard          from "@/components/library/CollectionCard";
import ResourceUploadDialog    from "@/components/library/ResourceUploadDialog";
import ResourceEditDialog      from "@/components/library/ResourceEditDialog";
import CollectionFormDialog    from "@/components/library/CollectionFormDialog";
import CollectionDetailDialog  from "@/components/library/CollectionDetailDialog";

import {
  getAllResources, setResourceActive, deleteResource,
  getAllCollections, deleteCollection,
  FileType, FILE_TYPE_LABELS, SUBJECTS, Board, Visibility, VISIBILITY_LABELS,
} from "@/library";

// ── File-type groups for the filter dropdown ──────────────────────────────────
const FILE_GROUPS = {
  pdf:   { label: "PDF",        types: [FileType.PDF]                       },
  word:  { label: "Word",       types: [FileType.DOC,  FileType.DOCX]       },
  ppt:   { label: "PowerPoint", types: [FileType.PPT,  FileType.PPTX]       },
  excel: { label: "Excel",      types: [FileType.XLS,  FileType.XLSX]       },
  image: { label: "Images",     types: [FileType.JPG,  FileType.PNG, FileType.WEBP] },
  audio: { label: "Audio",      types: [FileType.MP3]                       },
  video: { label: "Video",      types: [FileType.MP4]                       },
  zip:   { label: "Archive",    types: [FileType.ZIP]                       },
};

const INIT_FILTERS = {
  search: "", subject: "", board: "", fileGroup: "", visibility: "", status: "active",
};

// ─────────────────────────────────────────────────────────────────────────────

function EmptyResources({ filters, onClear }) {
  const hasFilter = Object.entries(filters).some(([k, v]) => k !== "status" && v);
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <LibraryBig size={40} className="mb-3 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">No resources found</p>
      {hasFilter && (
        <button onClick={onClear} className="mt-2 text-xs text-indigo-500 hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SuperAdminLibrary() {
  const { toast }  = useToast();
  const confirm    = useConfirm();

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("resources");

  // ── Resources ─────────────────────────────────────────────────────────────
  const [resources,  setResources]  = useState([]);
  const [resLoading, setResLoading] = useState(true);
  const [filters,    setFilters]    = useState(INIT_FILTERS);

  // ── Resource dialogs ──────────────────────────────────────────────────────
  const [uploadOpen,    setUploadOpen]    = useState(false);
  const [editResource,  setEditResource]  = useState(null);

  // ── Collections ───────────────────────────────────────────────────────────
  const [collections, setCollections] = useState([]);
  const [colLoading,  setColLoading]  = useState(true);
  const [colSearch,   setColSearch]   = useState("");

  // colDialog: null | { mode: "form"|"detail", collection: object|null }
  const [colDialog, setColDialog] = useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadResources = async () => {
    setResLoading(true);
    try {
      setResources(await getAllResources({ includeInactive: true }));
    } catch (e) {
      toast.error("Failed to load resources.");
    } finally {
      setResLoading(false);
    }
  };

  const loadCollections = async () => {
    setColLoading(true);
    try {
      setCollections(await getAllCollections({ includeInactive: true }));
    } catch (e) {
      toast.error("Failed to load collections.");
    } finally {
      setColLoading(false);
    }
  };

  useEffect(() => { loadResources(); }, []);
  useEffect(() => { loadCollections(); }, []);

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (filters.status === "active"   && !r.isActive) return false;
      if (filters.status === "archived" &&  r.isActive) return false;
      if (filters.subject    && r.subject    !== filters.subject)    return false;
      if (filters.board      && r.board      !== filters.board)      return false;
      if (filters.visibility && r.visibility !== filters.visibility) return false;
      if (filters.fileGroup) {
        const types = FILE_GROUPS[filters.fileGroup]?.types ?? [];
        if (!types.includes(r.fileType)) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hit =
          r.name?.toLowerCase().includes(q) ||
          r.subject?.toLowerCase().includes(q) ||
          r.author?.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [resources, filters]);

  const filteredCollections = useMemo(() => {
    if (!colSearch.trim()) return collections;
    const q = colSearch.toLowerCase();
    return collections.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    );
  }, [collections, colSearch]);

  // ── Resource actions ──────────────────────────────────────────────────────

  const handleArchiveResource = async (resource) => {
    const willArchive = resource.isActive;
    const ok = await confirm({
      title:        willArchive ? "Archive resource?" : "Restore resource?",
      description:  willArchive ? "It will be hidden from all schools." : "It will become visible to schools again.",
      confirmLabel: willArchive ? "Archive" : "Restore",
    });
    if (!ok) return;
    try {
      await setResourceActive(resource.id, !resource.isActive);
      toast.success(willArchive ? "Resource archived." : "Resource restored.");
      loadResources();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDeleteResource = async (resource) => {
    const ok = await confirm({
      title:        "Delete resource permanently?",
      description:  "The file will be removed from Storage and all school/class assignments. This cannot be undone.",
      confirmLabel: "Delete",
      danger:       true,
    });
    if (!ok) return;
    try {
      await deleteResource(resource.id);
      toast.success("Resource deleted.");
      loadResources();
    } catch (e) {
      toast.error(e.message);
    }
  };

  // ── Collection actions ────────────────────────────────────────────────────

  const handleDeleteCollection = async (col) => {
    const ok = await confirm({
      title:        "Delete collection?",
      description:  "Resources inside will not be deleted. Only this collection will be removed.",
      confirmLabel: "Delete",
      danger:       true,
    });
    if (!ok) return;
    try {
      await deleteCollection(col.id);
      toast.success("Collection deleted.");
      loadCollections();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const setFilter = (k) => (v) =>
    setFilters((f) => ({ ...f, [k]: v === "_all" ? "" : v }));

  const activeCount   = resources.filter((r) =>  r.isActive).length;
  const archivedCount = resources.filter((r) => !r.isActive).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Digital Library</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage resources and collections for all schools
          </p>
        </div>
        {tab === "resources" ? (
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload size={15} /> Upload Resource
          </Button>
        ) : (
          <Button onClick={() => setColDialog({ mode: "form", collection: null })} className="gap-2">
            <Plus size={15} /> New Collection
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {[
          { id: "resources",   label: `Resources (${resources.length})`    },
          { id: "collections", label: `Collections (${collections.length})` },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Resources Tab ── */}
      {tab === "resources" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-52">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(e) => setFilter("search")(e.target.value)}
                placeholder="Search name, subject, author, tags…"
                className="pl-8"
              />
            </div>

            <Select value={filters.subject || "_all"} onValueChange={setFilter("subject")}>
              <SelectTrigger className="w-38"><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Subjects</SelectItem>
                {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.board || "_all"} onValueChange={setFilter("board")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Board" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Boards</SelectItem>
                {Object.values(Board).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.fileGroup || "_all"} onValueChange={setFilter("fileGroup")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="File Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Types</SelectItem>
                {Object.entries(FILE_GROUPS).map(([k, { label }]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.visibility || "_all"} onValueChange={setFilter("visibility")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Visibility" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All</SelectItem>
                {Object.entries(VISIBILITY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={setFilter("status")}>
              <SelectTrigger className="w-34"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active ({activeCount})</SelectItem>
                <SelectItem value="archived">Archived ({archivedCount})</SelectItem>
                <SelectItem value="_all">All</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {Object.values(filters).some(Boolean) && (
              <button
                onClick={() => setFilters(INIT_FILTERS)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border rounded-md hover:bg-gray-50 transition-colors"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          {/* Results count + archived hint */}
          {!resLoading && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-400">
                Showing {filteredResources.length} of {resources.length} resource{resources.length !== 1 ? "s" : ""}
              </p>
              {filters.status === "active" && archivedCount > 0 && (
                <button
                  onClick={() => setFilters((f) => ({ ...f, status: "archived" }))}
                  className="text-xs text-amber-600 hover:underline"
                >
                  {archivedCount} archived — click to view
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {resLoading ? (
            <PageLoader label="Loading resources…" />
          ) : filteredResources.length === 0 ? (
            <EmptyResources filters={filters} onClear={() => setFilters(INIT_FILTERS)} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredResources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  onEdit={setEditResource}
                  onArchive={handleArchiveResource}
                  onDelete={handleDeleteResource}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Collections Tab ── */}
      {tab === "collections" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={colSearch}
              onChange={(e) => setColSearch(e.target.value)}
              placeholder="Search collections…"
              className="pl-8"
            />
          </div>

          {colLoading ? (
            <PageLoader label="Loading collections…" />
          ) : filteredCollections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <LibraryBig size={40} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No collections yet</p>
              <button
                onClick={() => setColDialog({ mode: "form", collection: null })}
                className="mt-2 text-xs text-indigo-500 hover:underline"
              >
                Create your first collection
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCollections.map((c) => (
                <CollectionCard
                  key={c.id}
                  collection={c}
                  onClick={(col) => setColDialog({ mode: "detail", collection: col })}
                  onEdit={(col) => setColDialog({ mode: "form", collection: col })}
                  onDelete={handleDeleteCollection}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ── */}
      <ResourceUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={({ name }) => {
          toast.success(`"${name}" uploaded successfully.`);
          loadResources();
        }}
      />

      <ResourceEditDialog
        open={!!editResource}
        onOpenChange={(v) => { if (!v) setEditResource(null); }}
        resource={editResource}
        onUpdated={() => {
          toast.success("Resource updated.");
          setEditResource(null);
          loadResources();
        }}
      />

      <CollectionFormDialog
        open={colDialog?.mode === "form"}
        onOpenChange={(v) => { if (!v) setColDialog(null); }}
        collection={colDialog?.collection ?? null}
        onSaved={() => {
          toast.success(colDialog?.collection ? "Collection updated." : "Collection created.");
          setColDialog(null);
          loadCollections();
        }}
      />

      <CollectionDetailDialog
        open={colDialog?.mode === "detail"}
        onOpenChange={(v) => { if (!v) setColDialog(null); }}
        collection={colDialog?.collection ?? null}
        onChanged={loadCollections}
      />
    </div>
  );
}
