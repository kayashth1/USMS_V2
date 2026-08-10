/**
 * AssignToClassDialog
 *
 * Used for both single-resource and whole-collection assignment.
 * For a resource: pre-checks classes already assigned; saves diff (assign new, unassign removed).
 * For a collection: assigns all resources in the collection to newly selected classes.
 */

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner }  from "@/components/ui/spinner";
import {
  assignResourceToClasses,
  unassignResourceFromClass,
  assignCollectionToClasses,
  unassignCollectionFromClasses,
} from "@/library";
import { useToast } from "@/components/ui/toast";
import { BookOpen, FileText, AlertTriangle } from "lucide-react";

export default function AssignToClassDialog({
  open,
  onOpenChange,
  // Single-resource mode
  resource,
  assignmentMap,     // { [resourceId]: classId[] }
  // Collection mode
  collection,
  collectionResourceIds,
  // Shared
  classes,           // [{ docId, id, grade, section }]
  schoolId,
  assignedBy,
  onAssigned,
}) {
  const isCollection = !!collection;
  const { toast }  = useToast();
  const [selected, setSelected] = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const hasNoResources = isCollection && (collectionResourceIds?.length ?? 0) === 0;

  // Pre-populate checked classes
  useEffect(() => {
    if (!open) return;
    if (!isCollection && resource) {
      // Resource: pre-check classes that already have it assigned
      setSelected(assignmentMap?.[resource.id] ?? []);
    } else if (isCollection && (collectionResourceIds?.length ?? 0) > 0) {
      // Collection: pre-check classes that have ALL collection resources assigned
      const fullyAssigned = (assignmentMap?.[collectionResourceIds[0]] ?? []).filter((classId) =>
        collectionResourceIds.every((rid) => (assignmentMap?.[rid] ?? []).includes(classId))
      );
      setSelected(fullyAssigned);
    } else {
      setSelected([]);
    }
    setError(null);
  }, [open, resource, collection, assignmentMap, collectionResourceIds]);

  const toggle = (docId) =>
    setSelected((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isCollection) {
        // Determine previously assigned classes (all resources assigned)
        const rids = collectionResourceIds ?? [];
        const prevAssigned = rids.length > 0
          ? (assignmentMap?.[rids[0]] ?? []).filter((cid) =>
              rids.every((rid) => (assignmentMap?.[rid] ?? []).includes(cid))
            )
          : [];
        const prevSet   = new Set(prevAssigned);
        const toAssign   = selected.filter((id) => !prevSet.has(id));
        const toUnassign = prevAssigned.filter((id) => !selected.includes(id));

        if (toAssign.length === 0 && toUnassign.length === 0) {
          setError("No changes to save.");
          return;
        }

        await Promise.all([
          toAssign.length > 0
            ? assignCollectionToClasses(schoolId, toAssign, collection.id, rids, assignedBy)
            : Promise.resolve(),
          toUnassign.length > 0
            ? unassignCollectionFromClasses(schoolId, toUnassign, collection.id, rids, assignedBy)
            : Promise.resolve(),
        ]);

        const msg = [
          toAssign.length   > 0 && `assigned to ${toAssign.length} class${toAssign.length !== 1 ? "es" : ""}`,
          toUnassign.length > 0 && `removed from ${toUnassign.length} class${toUnassign.length !== 1 ? "es" : ""}`,
        ].filter(Boolean).join(", ");
        toast.success(`"${collection.name}" ${msg}.`);
      } else {
        const prev       = new Set(assignmentMap?.[resource.id] ?? []);
        const toAssign   = selected.filter((id) => !prev.has(id));
        const toUnassign = [...prev].filter((id) => !selected.includes(id));

        if (toAssign.length === 0 && toUnassign.length === 0) {
          setError("No changes to save.");
          return;
        }

        await Promise.all([
          ...toAssign.map((classId) =>
            assignResourceToClasses(schoolId, [classId], resource.id, assignedBy)
          ),
          ...toUnassign.map((classId) =>
            unassignResourceFromClass(schoolId, classId, resource.id)
          ),
        ]);

        const msg = [
          toAssign.length   > 0 && `assigned to ${toAssign.length} class${toAssign.length !== 1 ? "es" : ""}`,
          toUnassign.length > 0 && `removed from ${toUnassign.length} class${toUnassign.length !== 1 ? "es" : ""}`,
        ].filter(Boolean).join(", ");
        toast.success(`"${resource.name}" ${msg}.`);
      }

      onAssigned?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Assignment failed:", e);
      setError(e.message ?? "Assignment failed. Check browser console for details.");
    } finally {
      setSaving(false);
    }
  };

  const title = isCollection ? collection?.name : resource?.name;
  const sortedClasses = [...(classes ?? [])].sort(
    (a, b) => (a.grade ?? 0) - (b.grade ?? 0) || a.section?.localeCompare(b.section)
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign to Classes</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* What's being assigned */}
          <div className="flex items-start gap-2.5 bg-indigo-50 rounded-lg p-3">
            {isCollection
              ? <BookOpen size={16} className="text-indigo-500 mt-0.5 shrink-0" />
              : <FileText size={16} className="text-indigo-500 mt-0.5 shrink-0" />
            }
            <div className="min-w-0">
              <p className="text-sm font-medium text-indigo-900 truncate">{title}</p>
              {isCollection && (
                <p className="text-xs text-indigo-600 mt-0.5">
                  {collectionResourceIds?.length ?? 0} resource{(collectionResourceIds?.length ?? 0) !== 1 ? "s" : ""} will be assigned
                </p>
              )}
              {!isCollection && resource && (
                <p className="text-xs text-indigo-600 mt-0.5">
                  {resource.subject} · {resource.board}
                </p>
              )}
            </div>
          </div>

          {/* Empty collection warning */}
          {hasNoResources && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                This collection has no resources yet. Add resources to it first (via Super Admin → Library → Collections), then assign it to classes.
              </p>
            </div>
          )}

          {/* Class list */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Select Classes
            </p>
            {sortedClasses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No classes found.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {sortedClasses.map((cls) => {
                  const label = `Class ${cls.grade}${cls.section ? ` – ${cls.section}` : ""}`;
                  const id    = cls.docId;
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.includes(id)}
                        onCheckedChange={() => toggle(id)}
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                      {/* Show "currently assigned" hint for resource mode */}
                      {!isCollection && (assignmentMap?.[resource?.id] ?? []).includes(id) && (
                        <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          Assigned
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <p className="text-xs text-indigo-600 font-medium">
              {selected.length} class{selected.length > 1 ? "es" : ""} selected
            </p>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || hasNoResources}>
            {saving ? <><Spinner size="sm" className="mr-1.5" />Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
