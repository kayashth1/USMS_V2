/**
 * FeeRevisionService — Fee Management V2
 *
 * Manages the feeRevisions collection and the approval workflow for profile changes
 * made after installments have been generated.
 *
 * Revision lifecycle (FeeRevisionDoc schema):
 *   createRevision()  → status: "draft"
 *   submitRevision()  → status: "pending_approval"
 *   approveRevision() → status: "approved"   (or rejectRevision() → "rejected")
 *   applyRevisionPlan() (persistence service) → status: "applied"
 *
 * All status-mutating functions guard against invalid transitions and throw
 * descriptive errors on conflict.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, writeBatch,
  query, where, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { COLLECTIONS } from "../constants/collections.js";
import { RevisionStatus, RevisionChangeType } from "../constants/enums.js";
import { validateFeeRevision, validateFeeRevisionDoc } from "../validation/feeRevision.validate.js";

const col = () => collection(db, COLLECTIONS.FEE_REVISIONS);

// ─── FeeRevisionDoc API (new schema with changes[]) ──────────────────────────

/**
 * Creates a FeeRevisionDoc with status DRAFT.
 * Does NOT touch the profile or installments.
 *
 * @param {Object} params
 * @param {string} params.profileId
 * @param {string} params.studentId
 * @param {string} [params.schoolId]
 * @param {string} params.academicYear        - "YYYY-YY"
 * @param {string} params.requestedBy         - Admin identifier
 * @param {string} params.reason              - Non-empty justification
 * @param {string} params.effectiveInstallment - "YYYY-MM" or "Q{n}-YYYY-YY"
 * @param {import('../types.js').RevisionChangeEntry[]} params.changes
 * @returns {Promise<string>} Created revision document ID
 */
export async function createRevision({
  profileId, studentId, schoolId, academicYear,
  requestedBy, reason, effectiveInstallment, changes,
}) {
  if (!profileId)           throw new Error("profileId is required");
  if (!studentId)           throw new Error("studentId is required");
  if (!academicYear)        throw new Error("academicYear is required");
  if (!requestedBy?.trim()) throw new Error("requestedBy is required");
  if (!reason?.trim())      throw new Error("reason is required");
  if (!effectiveInstallment) throw new Error("effectiveInstallment is required");
  if (!Array.isArray(changes) || changes.length === 0)
    throw new Error("At least one change is required");

  const { valid, errors } = validateFeeRevisionDoc({
    studentId, profileId, academicYear, requestedBy, reason,
    effectiveInstallment, changes, status: RevisionStatus.DRAFT,
  });
  if (!valid) throw new Error(`Validation failed: ${errors.join("; ")}`);

  const ref = await addDoc(col(), {
    studentId,
    profileId,
    schoolId:             schoolId ?? null,
    academicYear,
    status:               RevisionStatus.DRAFT,
    effectiveInstallment,
    reason:               reason.trim(),
    requestedBy,
    requestedAt:          serverTimestamp(),
    approvedBy:           null,
    approvedAt:           null,
    appliedBy:            null,
    appliedAt:            null,
    cancelledBy:          null,
    cancelledAt:          null,
    changes,
  });
  return ref.id;
}

/**
 * Submits a DRAFT revision for approval → status becomes PENDING_APPROVAL.
 *
 * @param {string} revisionId
 * @param {string} submittedBy
 * @returns {Promise<void>}
 */
export async function submitRevision(revisionId, submittedBy) {
  if (!revisionId) throw new Error("revisionId is required");
  const ref  = doc(db, COLLECTIONS.FEE_REVISIONS, revisionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Revision "${revisionId}" not found`);
  const status = snap.data().status;
  if (status !== RevisionStatus.DRAFT) {
    throw new Error(`Only DRAFT revisions can be submitted (current: "${status}")`);
  }
  await updateDoc(ref, {
    status:    RevisionStatus.PENDING_APPROVAL,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Approves a PENDING_APPROVAL revision → status becomes APPROVED.
 *
 * @param {string} revisionId
 * @param {string} reviewedBy
 * @returns {Promise<void>}
 */
export async function approveRevision(revisionId, reviewedBy) {
  if (!revisionId) throw new Error("revisionId is required");
  const ref  = doc(db, COLLECTIONS.FEE_REVISIONS, revisionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Revision "${revisionId}" not found`);
  const status = snap.data().status;
  if (status !== RevisionStatus.PENDING_APPROVAL) {
    throw new Error(`Only PENDING_APPROVAL revisions can be approved (current: "${status}")`);
  }
  await updateDoc(ref, {
    status:     RevisionStatus.APPROVED,
    approvedBy: reviewedBy ?? null,
    approvedAt: serverTimestamp(),
  });
}

/**
 * Rejects a PENDING_APPROVAL revision → status becomes REJECTED.
 *
 * @param {string} revisionId
 * @param {string} reviewedBy
 * @param {string} [rejectionNote]
 * @returns {Promise<void>}
 */
export async function rejectRevision(revisionId, reviewedBy, rejectionNote) {
  if (!revisionId) throw new Error("revisionId is required");
  const ref  = doc(db, COLLECTIONS.FEE_REVISIONS, revisionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Revision "${revisionId}" not found`);
  const status = snap.data().status;
  if (status !== RevisionStatus.PENDING_APPROVAL) {
    throw new Error(`Only PENDING_APPROVAL revisions can be rejected (current: "${status}")`);
  }
  await updateDoc(ref, {
    status:        RevisionStatus.REJECTED,
    rejectedBy:    reviewedBy ?? null,
    rejectedAt:    serverTimestamp(),
    rejectionNote: rejectionNote ?? null,
  });
}

/**
 * Cancels a DRAFT or PENDING_APPROVAL revision → status becomes CANCELLED.
 * The profile and installments remain unchanged.
 *
 * @param {string} revisionId
 * @param {string} cancelledBy
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function cancelRevision(revisionId, cancelledBy, reason) {
  if (!revisionId) throw new Error("revisionId is required");
  const ref  = doc(db, COLLECTIONS.FEE_REVISIONS, revisionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Revision "${revisionId}" not found`);
  const status = snap.data().status;
  const cancellable = new Set([RevisionStatus.DRAFT, RevisionStatus.PENDING_APPROVAL]);
  if (!cancellable.has(status)) {
    throw new Error(`Revisions with status "${status}" cannot be cancelled (only DRAFT and PENDING_APPROVAL can be cancelled)`);
  }
  await updateDoc(ref, {
    status:             RevisionStatus.CANCELLED,
    cancelledBy:        cancelledBy ?? null,
    cancelledAt:        serverTimestamp(),
    cancellationReason: reason ?? null,
  });
}

/**
 * Updates mutable fields on a DRAFT revision.
 *
 * @param {string} revisionId
 * @param {Partial<import('../types.js').FeeRevisionDoc>} updates
 * @returns {Promise<void>}
 */
export async function updateDraftRevision(revisionId, updates) {
  if (!revisionId) throw new Error("revisionId is required");
  const ref  = doc(db, COLLECTIONS.FEE_REVISIONS, revisionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Revision "${revisionId}" not found`);
  if (snap.data().status !== RevisionStatus.DRAFT) {
    throw new Error(`Only DRAFT revisions can be updated (current: "${snap.data().status}")`);
  }
  const MUTABLE = new Set(["reason", "effectiveInstallment", "changes"]);
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => MUTABLE.has(k))
  );
  await updateDoc(ref, { ...filtered, updatedAt: serverTimestamp() });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all revisions for a fee profile, sorted newest first.
 *
 * @param {string} profileId
 * @returns {Promise<import('../types.js').FeeRevisionDoc[]>}
 */
export async function getRevisionsByProfile(profileId) {
  if (!profileId) throw new Error("profileId is required");
  const snap = await getDocs(query(col(), where("profileId", "==", profileId)));
  return snap.docs
    .map((d) => ({ revisionId: d.id, ...d.data() }))
    .sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0));
}

/**
 * Returns a single FeeRevisionDoc by its document ID.
 *
 * @param {string} revisionId
 * @returns {Promise<import('../types.js').FeeRevisionDoc|null>}
 */
export async function getRevision(revisionId) {
  if (!revisionId) throw new Error("revisionId is required");
  const snap = await getDoc(doc(db, COLLECTIONS.FEE_REVISIONS, revisionId));
  if (!snap.exists()) return null;
  return { revisionId: snap.id, ...snap.data() };
}

/**
 * Returns all revisions for a student, sorted newest first.
 * Optionally filtered by academicYear.
 *
 * @param {string} studentId
 * @param {string} [academicYear]
 * @returns {Promise<import('../types.js').FeeRevisionDoc[]>}
 */
export async function getRevisionsByStudent(studentId, academicYear) {
  if (!studentId) throw new Error("studentId is required");
  const constraints = [where("studentId", "==", studentId)];
  if (academicYear) constraints.push(where("academicYear", "==", academicYear));
  const snap = await getDocs(query(col(), ...constraints));
  return snap.docs
    .map((d) => ({ revisionId: d.id, ...d.data() }))
    .sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0));
}

// ─── Legacy stubs (old schema — kept for backwards-compatibility) ─────────────

/**
 * @deprecated Use applyRevisionPlan() from feeRevisionPersistence.service.js instead.
 */
export async function applyRevision(revisionId, appliedBy) {
  throw new Error("applyRevision is deprecated — use applyRevisionPlan() from the persistence service");
}

/**
 * @deprecated Use getRevisionsByProfile() instead.
 */
export async function getRevisionById(revisionId) {
  return getRevision(revisionId);
}

/**
 * Returns all revisions for a school, sorted newest first.
 *
 * @param {string} schoolId
 * @param {string} [academicYear]
 * @returns {Promise<import('../types.js').FeeRevisionDoc[]>}
 */
export async function getRevisionsBySchool(schoolId, academicYear) {
  if (!schoolId) throw new Error("schoolId is required");
  const constraints = [where("schoolId", "==", schoolId)];
  if (academicYear) constraints.push(where("academicYear", "==", academicYear));
  const snap = await getDocs(query(col(), ...constraints));
  return snap.docs
    .map((d) => ({ revisionId: d.id, ...d.data() }))
    .sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0));
}
