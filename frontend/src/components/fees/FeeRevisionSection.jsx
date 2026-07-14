import { useState, useEffect } from "react";
import { Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineLoader } from "@/components/ui/spinner";
import {
  getRevisionsByProfile,
  submitRevision,
  approveRevision,
  cancelRevision,
  RevisionStatus,
  ProfileStatus,
} from "@/fees-v2";
import NewRevisionDialog    from "./NewRevisionDialog";
import RevisionPreviewDialog from "./RevisionPreviewDialog";

const REVISION_STATUS_COLORS = {
  [RevisionStatus.DRAFT]:            "bg-gray-100 text-gray-600",
  [RevisionStatus.PENDING_APPROVAL]: "bg-amber-100 text-amber-700",
  [RevisionStatus.APPROVED]:         "bg-green-100 text-green-700",
  [RevisionStatus.APPLIED]:          "bg-indigo-100 text-indigo-700",
  [RevisionStatus.REJECTED]:         "bg-red-100 text-red-600",
  [RevisionStatus.CANCELLED]:        "bg-gray-100 text-gray-400",
};

const REVISION_STATUS_LABELS = {
  [RevisionStatus.DRAFT]:            "Draft",
  [RevisionStatus.PENDING_APPROVAL]: "Pending Approval",
  [RevisionStatus.APPROVED]:         "Approved",
  [RevisionStatus.APPLIED]:          "Applied",
  [RevisionStatus.REJECTED]:         "Rejected",
  [RevisionStatus.CANCELLED]:        "Cancelled",
};

export const REVISION_TYPE_LABELS = {
  add_variable_fee:    "Add Variable Fee",
  remove_variable_fee: "Remove Variable Fee",
  add_fixed_fee:       "Add Fixed Fee",
  remove_fixed_fee:    "Remove Fixed Fee",
  scholarship:         "Scholarship",
  waiver:              "Waiver",
  fine:                "Fine",
  fee_correction:      "Fee Correction",
};

/**
 * Fee Revision section embedded inside FeeProfileDetail.
 * Shows the Last Revision card, revision history table, and action buttons.
 * Manages the New Revision and Preview/Apply dialogs.
 *
 * @param {{ profile, installments, feeStructures, onRevisionApplied }} props
 */
export default function FeeRevisionSection({ profile, installments, feeStructures, onRevisionApplied }) {
  const [revisions,        setRevisions]        = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [newRevisionOpen,  setNewRevisionOpen]  = useState(false);
  const [previewRevision,  setPreviewRevision]  = useState(null);

  const adminId = localStorage.getItem("principalSchoolId") ?? "admin";

  const loadRevisions = async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      setRevisions(await getRevisionsByProfile(profile.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRevisions(); }, [profile?.id]);

  const runAction = async (revisionId, action) => {
    setActionInProgress(revisionId);
    setError(null);
    try {
      await action();
      await loadRevisions();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSubmit = (rev) =>
    runAction(rev.revisionId, () => submitRevision(rev.revisionId, adminId));

  const handleApprove = (rev) =>
    runAction(rev.revisionId, () => approveRevision(rev.revisionId, adminId));

  const handleCancel = (rev) => {
    if (!confirm("Cancel this revision? This cannot be undone.")) return;
    runAction(rev.revisionId, () => cancelRevision(rev.revisionId, adminId, "Cancelled by admin"));
  };

  const handleRevisionApplied = async () => {
    setPreviewRevision(null);
    await loadRevisions();
    await onRevisionApplied?.();
  };

  // Last revision display — from profile snapshot fields
  const lastTypes = Array.isArray(profile.lastRevisionType)
    ? profile.lastRevisionType
    : profile.lastRevisionType ? [profile.lastRevisionType] : [];
  const lastAt = profile.lastRevisionAt?.toDate?.()
    ?? (profile.lastRevisionAt instanceof Date ? profile.lastRevisionAt : null);

  return (
    <div className="space-y-3">
      {/* ── Last Applied Revision card ── */}
      {profile.lastRevisionId && (
        <div className="border border-indigo-100 bg-indigo-50/40 rounded-md px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              Last Applied Revision
            </p>
            <p className="text-sm text-gray-700">
              {lastTypes.map((t) => REVISION_TYPE_LABELS[t] ?? t).join(" · ") || "—"}
            </p>
          </div>
          {lastAt && (
            <p className="text-xs text-gray-400">{lastAt.toLocaleDateString("en-IN")}</p>
          )}
        </div>
      )}

      {/* ── Section header ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Revision History
        </p>
        {profile.status === ProfileStatus.ACTIVE && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setNewRevisionOpen(true)}
          >
            <Plus className="h-3 w-3" />
            New Revision
          </Button>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── History table ── */}
      {loading ? (
        <InlineLoader label="Loading revisions…" />
      ) : revisions.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No revisions on record.</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Type(s)</th>
                  <th className="text-left px-3 py-2 font-medium">Effective</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Requested By</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {revisions.map((rev) => {
                  const reqAt = rev.requestedAt?.toDate?.()?.toLocaleDateString("en-IN") ?? "—";
                  const types = [...new Set(
                    (rev.changes ?? []).map((c) => REVISION_TYPE_LABELS[c.revisionType] ?? c.revisionType)
                  )].join(", ");
                  const isBusy = actionInProgress === rev.revisionId;

                  return (
                    <tr key={rev.revisionId} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{reqAt}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate" title={types}>
                        {types || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">
                        {rev.effectiveInstallment}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`text-xs ${REVISION_STATUS_COLORS[rev.status] ?? ""}`}>
                          {REVISION_STATUS_LABELS[rev.status] ?? rev.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 max-w-[90px] truncate" title={rev.requestedBy}>
                        {rev.requestedBy ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {rev.status === RevisionStatus.DRAFT && (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                              disabled={isBusy}
                              onClick={() => handleSubmit(rev)}>
                              {isBusy ? "…" : "Submit"}
                            </Button>
                          )}
                          {rev.status === RevisionStatus.PENDING_APPROVAL && (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                              disabled={isBusy}
                              onClick={() => handleApprove(rev)}>
                              {isBusy ? "…" : "Approve"}
                            </Button>
                          )}
                          {rev.status === RevisionStatus.APPROVED && (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700"
                              onClick={() => setPreviewRevision(rev)}>
                              Preview & Apply
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            className="h-7 px-2 text-gray-400 hover:text-gray-600"
                            onClick={() => setPreviewRevision(rev)}
                            title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {(rev.status === RevisionStatus.DRAFT ||
                            rev.status === RevisionStatus.PENDING_APPROVAL) && (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-red-400 hover:text-red-600"
                              disabled={isBusy}
                              onClick={() => handleCancel(rev)}>
                              {isBusy ? "…" : "Cancel"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewRevisionDialog
        open={newRevisionOpen}
        onOpenChange={setNewRevisionOpen}
        profile={profile}
        installments={installments}
        feeStructures={feeStructures}
        adminId={adminId}
        onCreated={async () => {
          setNewRevisionOpen(false);
          await loadRevisions();
        }}
      />

      <RevisionPreviewDialog
        open={!!previewRevision}
        onOpenChange={(v) => { if (!v) setPreviewRevision(null); }}
        revision={previewRevision}
        profile={profile}
        installments={installments}
        feeStructures={feeStructures}
        adminId={adminId}
        onApplied={handleRevisionApplied}
      />
    </div>
  );
}
