import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, LibraryBig, BookOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input }             from "@/components/ui/input";
import { PageLoader }        from "@/components/ui/spinner";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import CatalogResourceCard    from "@/components/library/principal/CatalogResourceCard";
import CatalogCollectionCard  from "@/components/library/principal/CatalogCollectionCard";
import CollectionViewDialog   from "@/components/library/principal/CollectionViewDialog";
import AssignToClassDialog    from "@/components/library/principal/AssignToClassDialog";
import ClassAssignmentsView   from "@/components/library/principal/ClassAssignmentsView";

import {
  getSchoolCatalog, getSchoolCollectionsCatalog,
  getSchoolAssignmentMap, SUBJECTS, Board,
} from "@/library";
import { getClassesBySchool } from "@/services/class.service";
import { useSchoolPlan }      from "@/hooks/useSchoolPlan";
import { auth }               from "@/config/firebase";

// ── Helpers ───────────────────────────────────────────────────────────────────

const schoolId  = () => localStorage.getItem("principalSchoolId") ?? "";
const principalUid = () => auth.currentUser?.uid ?? "principal";

// ── Principal Library ─────────────────────────────────────────────────────────

function PrincipalLibrary() {
  const { plan: schoolPlan, loading: planLoading } = useSchoolPlan();
  const sid = schoolId();

  // ── Data ───────────────────────────────────────────────────────────────────
  const [resources,     setResources]     = useState([]);
  const [collections,   setCollections]   = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [assignmentMap, setAssignmentMap] = useState({});
  const [loading,       setLoading]       = useState(true);

  // ── View state ─────────────────────────────────────────────────────────────
  const [view,          setView]          = useState("browse");   // "browse" | "assigned"
  const [search,        setSearch]        = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterBoard,   setFilterBoard]   = useState("");

  // ── Dialogs ────────────────────────────────────────────────────────────────
  // assignTarget: { type: "resource"|"collection", resource?, collection?, collectionResourceIds? }
  const [assignTarget,      setAssignTarget]      = useState(null);
  const [collectionView,    setCollectionView]    = useState(null); // collection object

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!sid || planLoading) return;
    setLoading(true);
    try {
      const [res, cols, cls, amap] = await Promise.all([
        getSchoolCatalog(sid, schoolPlan),
        getSchoolCollectionsCatalog(sid, schoolPlan),
        getClassesBySchool(sid),
        getSchoolAssignmentMap(sid),
      ]);
      setResources(res);
      setCollections(cols);
      setClasses(cls);
      setAssignmentMap(amap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sid, schoolPlan, planLoading]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshMap = useCallback(async () => {
    if (!sid) return;
    const amap = await getSchoolAssignmentMap(sid);
    setAssignmentMap(amap);
  }, [sid]);

  // ── Filtered catalog ───────────────────────────────────────────────────────

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (filterSubject && r.subject !== filterSubject) return false;
      if (filterBoard   && r.board   !== filterBoard)   return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.name?.toLowerCase().includes(q) ||
          r.subject?.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [resources, search, filterSubject, filterBoard]);

  const filteredCollections = useMemo(() => {
    if (!search) return collections;
    const q = search.toLowerCase();
    return collections.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    );
  }, [collections, search]);

  // ── Assign handlers ────────────────────────────────────────────────────────

  const openAssignResource = (resource) =>
    setAssignTarget({ type: "resource", resource });

  const openAssignCollection = (collection, resourceIds) =>
    setAssignTarget({ type: "collection", collection, collectionResourceIds: resourceIds });

  const onAssigned = async () => {
    await refreshMap();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || planLoading) return <PageLoader label="Loading library…" />;

  const hasContent = filteredCollections.length > 0 || filteredResources.length > 0;

  return (
    <div className="space-y-5">
      {/* Section toggle */}
      <div className="flex items-center gap-3">
        <div className="flex border rounded-lg overflow-hidden text-sm">
          {[
            { id: "browse",   label: "Browse Catalog" },
            { id: "assigned", label: "Class Assignments" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-4 py-2 transition-colors ${
                view === id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Catalog counts */}
        {view === "browse" && (
          <p className="text-xs text-gray-400">
            {resources.length} resource{resources.length !== 1 ? "s" : ""} · {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Browse Catalog ── */}
      {view === "browse" && (
        <div className="space-y-6">
          {/* Search + filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-52">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, subject, tags…"
                className="pl-8"
              />
            </div>

            <Select value={filterSubject || "_all"} onValueChange={(v) => setFilterSubject(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Subjects</SelectItem>
                {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterBoard || "_all"} onValueChange={(v) => setFilterBoard(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Board" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Boards</SelectItem>
                {Object.values(Board).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!hasContent ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <LibraryBig size={40} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No resources available</p>
              <p className="text-xs mt-1">
                {schoolPlan === "premium"
                  ? "No resources have been added to the library yet."
                  : "Free resources will appear here. Upgrade to access premium content."}
              </p>
            </div>
          ) : (
            <>
              {/* Collections section */}
              {filteredCollections.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={16} className="text-indigo-500" />
                    <h2 className="text-base font-semibold text-gray-800">Collections</h2>
                    <span className="text-xs text-gray-400">{filteredCollections.length}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredCollections.map((c) => (
                      <CatalogCollectionCard
                        key={c.id}
                        collection={c}
                        onView={(col) => setCollectionView(col)}
                        onAssign={(col) => openAssignCollection(col, col.resourceIds ?? [])}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Resources section */}
              {filteredResources.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <LibraryBig size={16} className="text-indigo-500" />
                    <h2 className="text-base font-semibold text-gray-800">Individual Resources</h2>
                    <span className="text-xs text-gray-400">{filteredResources.length}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredResources.map((r) => (
                      <CatalogResourceCard
                        key={r.id}
                        resource={r}
                        assignedToClasses={assignmentMap[r.id] ?? []}
                        classes={classes}
                        onAssign={openAssignResource}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Class Assignments ── */}
      {view === "assigned" && (
        <ClassAssignmentsView
          classes={classes}
          schoolId={sid}
          onAssignmentChanged={refreshMap}
        />
      )}

      {/* ── Dialogs ── */}
      <CollectionViewDialog
        open={!!collectionView}
        onOpenChange={(v) => { if (!v) setCollectionView(null); }}
        collection={collectionView}
        assignmentMap={assignmentMap}
        classes={classes}
        onAssignResource={(resource) => {
          setCollectionView(null);
          openAssignResource(resource);
        }}
        onAssignCollection={(col, resourceIds) => {
          setCollectionView(null);
          openAssignCollection(col, resourceIds);
        }}
      />

      <AssignToClassDialog
        open={!!assignTarget}
        onOpenChange={(v) => { if (!v) setAssignTarget(null); }}
        resource={assignTarget?.type === "resource" ? assignTarget.resource : null}
        collection={assignTarget?.type === "collection" ? assignTarget.collection : null}
        collectionResourceIds={assignTarget?.collectionResourceIds}
        assignmentMap={assignmentMap}
        classes={classes}
        schoolId={sid}
        assignedBy={principalUid()}
        onAssigned={() => {
          setAssignTarget(null);
          onAssigned();
        }}
      />
    </div>
  );
}

// ── Books page shell ──────────────────────────────────────────────────────────

export default function Books() {
  const [tab, setTab] = useState("library");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Books & Content</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage books and digital learning resources</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {[
          { id: "books",   label: "Books Management"  },
          { id: "library", label: "Digital Library"   },
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

      {tab === "books" && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-medium">Books Management</h2>
            <p className="text-gray-500 text-sm mt-1">
              Book inventory and issuance management will be available here.
            </p>
          </CardContent>
        </Card>
      )}

      {tab === "library" && <PrincipalLibrary />}
    </div>
  );
}
