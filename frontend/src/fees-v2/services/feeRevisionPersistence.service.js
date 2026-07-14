/**
 * FeeRevisionPersistenceService — Fee Management V2
 *
 * Persists an already-computed RevisionPlan to Firestore.
 * This module is the ONLY place that writes fee revision results to the database.
 *
 * All writes execute inside a single atomic Firestore transaction so that
 * partial application is impossible — either all installments, the profile
 * snapshot, and the revision status transition commit together, or nothing does.
 *
 * What this module does:
 *   - Loads documents (loadRevision, loadProfile)
 *   - Persists a computed RevisionPlan atomically (applyRevisionPlan)
 *   - Commits transactions
 *
 * What this module never does:
 *   - Validation (schema or business-rule)
 *   - Fee calculations
 *   - Schedule generation
 *   - RevisionPlan computation
 *
 * Transaction write order (Firestore Web SDK: all reads must precede all writes):
 *   Reads:  revision doc → profile doc → N installment docs (all via tx.get)
 *   Writes: N installment docs → profile doc → revision doc
 *
 * Firestore index requirements: none — all reads are direct-ID document lookups.
 */

import {
  doc, getDoc, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebase.js";
import { COLLECTIONS } from "../constants/collections.js";
import { RevisionStatus, InstallmentStatus } from "../constants/enums.js";

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * Pre-computed profile-level snapshot that replaces the current profile's
 * fields after a revision is applied.
 *
 * The caller (orchestration layer) is responsible for deriving these values
 * from the engine's post-revision EngineState and the profile's original
 * feeAdjustments list before calling applyRevisionPlan().
 *
 * feeAdjustments must be the full merged list:
 *   [...profile.feeAdjustments, ...state.revisionAdjustments]
 *
 * variableFeeIds must be the updated list after ADD/REMOVE_VARIABLE_FEE changes.
 *
 * @typedef {Object} ProfileUpdate
 * @property {import('../types.js').FeeLineItem[]}   feeLineItems          - Recurring components after revision; excludes one-time pinned items
 * @property {import('../types.js').FeeAdjustment[]} feeAdjustments        - Existing + revision-introduced adjustments merged
 * @property {string[]}                              variableFeeIds        - Updated after ADD/REMOVE_VARIABLE_FEE
 * @property {number}                                grossAnnualFee        - Annual gross from revised feeLineItems
 * @property {number}                                totalAdjustmentAmount - Annual total of all feeAdjustments
 * @property {number}                                netAnnualFee          - grossAnnualFee − totalAdjustmentAmount
 */

// ─── Private helpers ──────────────────────────────────────────────────────────

function _assertId(id, label = "id") {
  if (!id || typeof id !== "string") throw new Error(`${label} is required`);
}

/**
 * Derives the financial status for an installment from its revised balance.
 * Called after every installment update to prevent stale status values.
 *
 * Rules (no date logic — the persistence layer does not know the current date):
 *   balance === 0           → paid    (fully settled; can happen when a revision zeros the balance)
 *   0 < balance < netAmount → partial (some payment was made before the revision; totalAllocated > 0)
 *   balance === netAmount   → due     (no payment yet against this installment)
 *
 * @param {number} balance
 * @param {number} netAmount
 * @returns {string}  InstallmentStatus value
 */
function _deriveStatus(balance, netAmount) {
  if (balance === 0)       return InstallmentStatus.PAID;
  if (balance < netAmount) return InstallmentStatus.PARTIAL;
  return InstallmentStatus.DUE;
}

// ─── Private write helpers ────────────────────────────────────────────────────
// These helpers perform ONLY tx.update() calls. They never call tx.get().
// All reads that guard their writes are done in applyRevisionPlan before these
// helpers are invoked, satisfying the Firestore Web SDK read-before-write rule.

/**
 * Enqueues tx.update() for every affected installment.
 *
 * Modifies the 6 financial fields plus `status`, which is recomputed from
 * the revised balance and netAmount to prevent stale status after a revision.
 *   lineItems, grossAmount, discountAmount, netAmount, balance, status, updatedAt
 *
 * Never modifies: totalAllocated, payment history, allocation history.
 *
 * The `diff.newValues.lineItems` written here already contains both recurring
 * and period-pinned items for each specific installment period — computed by
 * the engine during recalculateInstallment.
 *
 * @param {import('firebase/firestore').Transaction}                          tx
 * @param {import('firebase/firestore').DocumentReference[]}                  refs   - One ref per diff, same order
 * @param {import('../feeRevisionEngine.js').InstallmentDiff[]}               diffs
 * @param {import('firebase/firestore').FieldValue}                           now    - Single serverTimestamp sentinel
 */
function _updateInstallments(tx, refs, diffs, now) {
  diffs.forEach((diff, i) => {
    tx.update(refs[i], {
      lineItems:      diff.newValues.lineItems,
      grossAmount:    diff.newValues.grossAmount,
      discountAmount: diff.newValues.discountAmount,
      netAmount:      diff.newValues.netAmount,
      balance:        diff.newValues.balance,
      status:         _deriveStatus(diff.newValues.balance, diff.newValues.netAmount),
      updatedAt:      now,
    });
  });
}

/**
 * Enqueues tx.update() for the Student Fee Profile snapshot.
 *
 * Writes the 6 profile snapshot fields, revision tracking fields
 * (lastRevisionId, lastRevisionType, lastRevisionAt), revisionCount
 * (atomically incremented from the freshly-read value), and audit timestamps.
 *
 * lastRevisionType is derived from the unique revisionType values across
 * all entries in revision.changes[]. Stored as a string[] to preserve
 * information for multi-change revisions. No FeeRevision collection query needed.
 *
 * @param {import('firebase/firestore').Transaction}           tx
 * @param {import('firebase/firestore').DocumentReference}     profileRef
 * @param {ProfileUpdate}                                      profileUpdate
 * @param {import('../types.js').FeeRevisionDoc}               revision             - Source for lastRevision* fields
 * @param {number}                                             currentRevisionCount - From fresh tx.get() read
 * @param {import('firebase/firestore').FieldValue}            now
 */
function _updateProfile(tx, profileRef, profileUpdate, revision, currentRevisionCount, now) {
  const lastRevisionType = [...new Set(revision.changes.map((c) => c.revisionType))];

  tx.update(profileRef, {
    feeLineItems:          profileUpdate.feeLineItems,
    feeAdjustments:        profileUpdate.feeAdjustments,
    variableFeeIds:        profileUpdate.variableFeeIds,
    grossAnnualFee:        profileUpdate.grossAnnualFee,
    totalAdjustmentAmount: profileUpdate.totalAdjustmentAmount,
    netAnnualFee:          profileUpdate.netAnnualFee,
    lastRevisionId:        revision.revisionId,
    lastRevisionType,
    lastRevisionAt:        now,
    revisionCount:         currentRevisionCount + 1,
    lastRevisedAt:         now,
    updatedAt:             now,
  });
}

/**
 * Enqueues tx.update() to transition the revision document to APPLIED.
 *
 * @param {import('firebase/firestore').Transaction}       tx
 * @param {import('firebase/firestore').DocumentReference} revisionRef
 * @param {string}                                         appliedBy   - Admin UID
 * @param {import('firebase/firestore').FieldValue}        now
 */
function _markRevisionApplied(tx, revisionRef, appliedBy, now) {
  tx.update(revisionRef, {
    status:    RevisionStatus.APPLIED,
    appliedBy,
    appliedAt: now,
  });
}

// ─── Public read helpers ──────────────────────────────────────────────────────

/**
 * Loads a FeeRevisionDoc by its Firestore document ID.
 * Convenience wrapper around a direct document lookup.
 *
 * Call this before computeRevisionPlan() to obtain the revision document,
 * then pass the same object to applyRevisionPlan() without re-fetching.
 *
 * @param {string} revisionId
 * @returns {Promise<import('../types.js').FeeRevisionDoc>}
 * @throws {Error} if the document does not exist
 */
export async function loadRevision(revisionId) {
  _assertId(revisionId, "revisionId");
  const snap = await getDoc(doc(db, COLLECTIONS.FEE_REVISIONS, revisionId));
  if (!snap.exists()) {
    throw new Error(`Revision "${revisionId}" not found`);
  }
  return { revisionId: snap.id, ...snap.data() };
}

/**
 * Loads a StudentFeeProfile by its Firestore document ID.
 * Convenience wrapper — the profile is needed both to run computeRevisionPlan()
 * (engine input) and to derive the ProfileUpdate snapshot (for applyRevisionPlan).
 *
 * @param {string} profileId
 * @returns {Promise<import('../types.js').StudentFeeProfile>}
 * @throws {Error} if the document does not exist
 */
export async function loadProfile(profileId) {
  _assertId(profileId, "profileId");
  const snap = await getDoc(doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, profileId));
  if (!snap.exists()) {
    throw new Error(`Fee profile "${profileId}" not found`);
  }
  return { id: snap.id, ...snap.data() };
}

// ─── Main entry point ──────────────────────────────────────────────────────────

/**
 * Persists a computed RevisionPlan to Firestore in a single atomic transaction.
 *
 * Typical caller flow (orchestration layer, not this module):
 *   1. revision  = await loadRevision(revisionId)
 *   2. profile   = await loadProfile(revision.profileId)
 *   3. installs  = await getInstallments(revision.profileId)
 *   4. plan      = computeRevisionPlan(profile, installs, revision, structuresMap)
 *   5. update    = { feeLineItems: state.feeLineItems, feeAdjustments: [...profile.feeAdjustments, ...state.revisionAdjustments], ... }
 *   6. await applyRevisionPlan(revision, plan, update, appliedBy)
 *
 * Pre-conditions (checked before the transaction opens):
 *   - revision.status must be APPROVED  — any other status throws immediately
 *   - plan.affectedInstallments must be non-empty
 *
 * Concurrency guards (checked inside the transaction, after re-reads):
 *   - Revision status must still be APPROVED — another admin may have applied or cancelled it
 *   - Each affected installment must still exist and have a mutable status
 *     (not "paid" or "cancelled") — a payment may have landed between plan computation and apply
 *   - Profile must still exist
 *
 * Transaction phases:
 *   Phase 1 — reads (all tx.get() calls):
 *     a. Re-read revision                 → concurrent-apply guard
 *     b. Re-read profile                  → get fresh revisionCount
 *     c. Re-read all affected installments → paid/cancelled guard
 *   Phase 2 — writes (all tx.update() calls, no further reads):
 *     d. Update N installments            → lineItems, amounts, balance, status (recomputed), updatedAt
 *     e. Update profile snapshot          → 6 fields + lastRevisionId/Type/At + revisionCount + timestamps
 *     f. Transition revision to APPLIED   → status, appliedBy, appliedAt
 *
 * On any failure during the transaction, Firestore rolls back all writes
 * atomically. No partial state is ever persisted.
 *
 * @param {import('../types.js').FeeRevisionDoc}                      revision
 *   The approved revision document. revision.status must equal "approved".
 *   Must include revisionId and profileId.
 *
 * @param {import('../feeRevisionEngine.js').RevisionPlan}            plan
 *   Output of computeRevisionPlan(). Not re-validated here.
 *   affectedInstallments[i].installmentId is used to build document refs.
 *   affectedInstallments[i].newValues is written directly to Firestore.
 *
 * @param {ProfileUpdate}                                             profileUpdate
 *   Pre-computed profile snapshot. The caller derives this from the engine's
 *   final EngineState. This module writes it as-is without recomputing.
 *
 * @param {string}                                                    appliedBy
 *   Admin UID performing the apply operation.
 *
 * @returns {Promise<{ installmentsUpdated: number }>}
 *
 * @throws {Error} if revision is not APPROVED
 * @throws {Error} if plan has no affected installments
 * @throws {Error} if a concurrency guard fires inside the transaction
 *   (status changed, installment became immutable, or document disappeared)
 */
export async function applyRevisionPlan(revision, plan, profileUpdate, appliedBy) {

  // ── Pre-flight checks (outside transaction) ───────────────────────────────
  // Reject obviously invalid inputs before opening any Firestore connection.

  if (!revision || typeof revision !== "object") {
    throw new Error("revision is required");
  }
  _assertId(revision.revisionId, "revision.revisionId");
  _assertId(revision.profileId,  "revision.profileId");

  if (revision.status !== RevisionStatus.APPROVED) {
    throw new Error(
      `Cannot apply revision "${revision.revisionId}": ` +
      `status is "${revision.status}", expected "approved". ` +
      `Only APPROVED revisions can be applied.`
    );
  }

  if (!plan || !Array.isArray(plan.affectedInstallments)) {
    throw new Error("plan is required and must contain an affectedInstallments array");
  }
  if (plan.affectedInstallments.length === 0) {
    throw new Error(
      `RevisionPlan for revision "${revision.revisionId}" has no affected installments. ` +
      `Nothing to persist.`
    );
  }

  if (!profileUpdate || typeof profileUpdate !== "object" || Array.isArray(profileUpdate)) {
    throw new Error("profileUpdate is required");
  }

  _assertId(appliedBy, "appliedBy");

  // ── Build document refs (outside transaction — no I/O) ───────────────────
  // Refs are constructed deterministically from IDs present on the inputs.
  // All installment document IDs come from InstallmentDiff.installmentId,
  // which the engine derives from FeeInstallment.id.

  const revisionRef  = doc(db, COLLECTIONS.FEE_REVISIONS,        revision.revisionId);
  const profileRef   = doc(db, COLLECTIONS.STUDENT_FEE_PROFILES, revision.profileId);

  const installmentRefs = plan.affectedInstallments.map((diff) =>
    doc(db, COLLECTIONS.FEE_INSTALLMENTS, diff.installmentId)
  );

  const IMMUTABLE_STATUSES = new Set(["paid", "cancelled"]);

  // ── Atomic transaction ────────────────────────────────────────────────────
  // Firestore Web SDK rule: every tx.get() must complete before any tx.update()
  // or tx.set() is called. This is enforced here by explicitly reading all
  // documents in Phase 1 and writing all documents in Phase 2.

  await runTransaction(db, async (tx) => {

    // ── Phase 1: Reads ────────────────────────────────────────────────────
    // All reads are issued with Promise.all where possible to minimize latency.

    // (a) Re-read revision — guard against a concurrent apply or cancellation
    const revisionSnapP = tx.get(revisionRef);

    // (b) Re-read profile — need fresh revisionCount for atomic increment
    const profileSnapP = tx.get(profileRef);

    // (c) Re-read all affected installments — guard against concurrent payments
    const installmentSnapsP = Promise.all(installmentRefs.map((ref) => tx.get(ref)));

    const [revisionSnap, profileSnap, installmentSnaps] = await Promise.all([
      revisionSnapP,
      profileSnapP,
      installmentSnapsP,
    ]);

    // Revision concurrency guard
    if (!revisionSnap.exists()) {
      throw new Error(
        `Revision "${revision.revisionId}" no longer exists. Aborting.`
      );
    }
    const freshRevisionStatus = revisionSnap.data().status;
    if (freshRevisionStatus !== RevisionStatus.APPROVED) {
      throw new Error(
        `Revision "${revision.revisionId}" status changed to "${freshRevisionStatus}" ` +
        `concurrently. Only APPROVED revisions can be applied. Aborting.`
      );
    }

    // Profile existence guard
    if (!profileSnap.exists()) {
      throw new Error(
        `Fee profile "${revision.profileId}" no longer exists. Aborting.`
      );
    }
    const currentRevisionCount = profileSnap.data().revisionCount ?? 0;

    // Installment concurrency guards — check every affected installment
    installmentSnaps.forEach((snap, i) => {
      if (!snap.exists()) {
        throw new Error(
          `Installment "${installmentRefs[i].id}" no longer exists. ` +
          `Recompute the RevisionPlan and retry.`
        );
      }
      const currentStatus = snap.data().status;
      if (IMMUTABLE_STATUSES.has(currentStatus)) {
        throw new Error(
          `Installment "${installmentRefs[i].id}" has status "${currentStatus}" ` +
          `and cannot be modified. A payment may have landed after the plan was computed. ` +
          `Recompute the RevisionPlan and retry.`
        );
      }
    });

    // ── Phase 2: Writes ───────────────────────────────────────────────────
    // All reads are complete. No further tx.get() calls after this point.
    // A single serverTimestamp sentinel ensures consistent timestamps across
    // all documents written in this transaction.

    const now = serverTimestamp();

    _updateInstallments(tx, installmentRefs, plan.affectedInstallments, now);
    _updateProfile(tx, profileRef, profileUpdate, revision, currentRevisionCount, now);
    _markRevisionApplied(tx, revisionRef, appliedBy, now);
  });

  return { installmentsUpdated: plan.affectedInstallments.length };
}
