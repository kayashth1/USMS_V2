/**
 * JSDoc type definitions for the Fee Management V2 data model.
 *
 * These @typedefs mirror the approved Firestore document schemas exactly.
 * No runtime code lives here — import this file in JSDoc @type annotations
 * for IDE type hints. The `export {}` at the bottom makes this a module.
 */

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} errors
 */

// ─── Embedded Types ───────────────────────────────────────────────────────────

/**
 * Snapshot of one fee component captured at profile creation or revision time.
 * Stored in: studentFeeProfiles.feeLineItems[], feeInstallments.lineItems[]
 *
 * @typedef {Object} FeeLineItem
 * @property {string}             feeStructureId       - Source feeStructures document ID
 * @property {string}             label                - Snapshot of feeStructures.label
 * @property {number}             amount               - Per-cycle INR at capture time; ≥ 0
 * @property {"fixed"|"variable"} type
 * @property {boolean}            isOneTime            - true = appears only in installment 1
 * @property {boolean}            chargedDuringHolidays
 * @property {number}             allocationPriority   - Snapshot of feeStructures.allocationPriority
 */

/**
 * One discount, waiver, or scholarship applied to a fee profile.
 * Stored in: studentFeeProfiles.feeAdjustments[]
 *
 * @typedef {Object} FeeAdjustment
 * @property {string}                    id                   - Client-generated UUID (crypto.randomUUID())
 * @property {"scholarship"|"concession"|"sibling_discount"|"staff_benefit"|"government_scheme"|"waiver"|"other"} type
 * @property {string}                    label                - e.g. "Merit Scholarship 2026-27"
 * @property {"total_fee"|"specific_components"} scope
 * @property {string[]}                  targetComponentIds   - feeStructureIds; [] when scope is total_fee
 * @property {"percentage"|"fixed_amount"} calculationType
 * @property {number}                    value                - % (0-100) or INR amount; ≥ 0
 * @property {number|null}               maxAmount            - INR cap on percentage adjustments; null = uncapped
 * @property {number}                    computedAmount       - Actual INR reduction stored after calculation; ≥ 0
 * @property {string|null}               effectiveFrom        - "YYYY-MM"; null = from first period (April)
 * @property {string|null}               effectiveTo          - "YYYY-MM"; null = through last period (March)
 * @property {string}                    reason               - Required free text
 * @property {string|null}               approvedBy           - Staff name or UID
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * Denormalised allocation reference for receipt printing — no join needed.
 * Stored in: feePayments.allocationSummary[]
 *
 * @typedef {Object} AllocationRef
 * @property {"installment"|"opening_balance"} target
 * @property {string|null} installmentId   - null when target is opening_balance
 * @property {string|null} period          - "YYYY-MM"; null for opening_balance
 * @property {string}      periodLabel     - "July 2026" or "Prior Year Balance"
 * @property {number}      amount          - INR allocated to this target in this payment; > 0
 */

/**
 * Component-level breakdown of how one installment's allocation is distributed.
 * Stored in: paymentAllocations.componentAllocations[]
 * INVARIANT: sum(allocatedAmount) === parent paymentAllocation.amount
 *
 * @typedef {Object} ComponentAlloc
 * @property {string} feeStructureId  - Snapshot FK — which component received the funds
 * @property {string} label           - Snapshot label (e.g. "Tuition Fee")
 * @property {number} allocatedAmount - INR applied to this component; must be > 0
 */

/**
 * Discriminated union stored in feeRevisions.changeDetail.
 * The actual shape varies by the parent document's changeType.
 *
 * @typedef {AddItemDetail|RemoveItemDetail|AdjustAmountDetail|AddAdjustmentDetail|ModifyAdjustmentDetail|RemoveAdjustmentDetail|CancelInstallmentDetail} ChangeDetail
 */

/** @typedef {{ feeStructureId: string, label: string, amount: number, isOneTime: boolean, type: "fixed"|"variable" }} AddItemDetail */
/** @typedef {{ feeStructureId: string, label: string }} RemoveItemDetail */
/** @typedef {{ feeStructureId: string, label: string, oldAmount: number, newAmount: number }} AdjustAmountDetail */
/** @typedef {{ adjustment: FeeAdjustment }} AddAdjustmentDetail */
/** @typedef {{ adjustmentId: string, field: string, oldValue: string|number|null, newValue: string|number|null }} ModifyAdjustmentDetail */
/** @typedef {{ adjustmentId: string, label: string, type: string }} RemoveAdjustmentDetail */
/** @typedef {{ installmentId: string, period: string, periodLabel: string }} CancelInstallmentDetail */

// ─── Fee Revision Module — changes array entry shapes ────────────────────────

/**
 * Entry shape for ADD_VARIABLE_FEE or REMOVE_VARIABLE_FEE.
 *
 * @typedef {Object} VariableFeeChangeDetail
 * @property {string}          feeStructureId  - FK → feeStructures (variable type)
 * @property {"add"|"remove"}  action
 */

/**
 * Entry shape for ADD_FIXED_FEE or REMOVE_FIXED_FEE.
 *
 * @typedef {Object} FixedFeeChangeDetail
 * @property {string}          feeStructureId  - FK → feeStructures (fixed type)
 * @property {string}          classId         - FK → classes; must match profile's classId
 * @property {"add"|"remove"}  action
 */

/**
 * Entry shape for SCHOLARSHIP revisions.
 * Exactly one of percentage or fixedAmount must be provided.
 *
 * @typedef {Object} ScholarshipChangeDetail
 * @property {number|null}                         percentage           - 0–100; null when using fixedAmount
 * @property {number|null}                         fixedAmount          - INR; null when using percentage
 * @property {"total_fee"|"specific_components"}   scope
 * @property {string[]}                            [targetComponentIds] - Required when scope is specific_components
 */

/**
 * Entry shape for WAIVER revisions.
 * Exactly one of percentage or fixedAmount must be provided.
 *
 * @typedef {Object} WaiverChangeDetail
 * @property {number|null}                         percentage           - 0–100; null when using fixedAmount
 * @property {number|null}                         fixedAmount          - INR; null when using percentage
 * @property {"total_fee"|"specific_components"}   scope
 * @property {string[]}                            [targetComponentIds] - Required when scope is specific_components
 */

/**
 * Entry shape for FINE revisions.
 *
 * @typedef {Object} FineChangeDetail
 * @property {number}  amount  - INR; must be > 0
 * @property {string}  reason  - Non-empty; separate from the parent revision's reason field
 */

/**
 * Entry shape for FEE_CORRECTION revisions.
 *
 * @typedef {Object} CorrectionChangeDetail
 * @property {string}          feeStructureId  - FK → feeStructures; which component is corrected
 * @property {number|string}   previousValue   - The value that was wrong
 * @property {number|string}   newValue        - The correct replacement value
 */

/**
 * One entry in FeeRevisionDoc.changes[].
 * Each entry is a discriminated union on the revisionType field.
 * The revisionType identifies which additional fields are present.
 *
 * @typedef {(
 *   ({ revisionType: "add_variable_fee"|"remove_variable_fee" } & VariableFeeChangeDetail) |
 *   ({ revisionType: "add_fixed_fee"|"remove_fixed_fee" }       & FixedFeeChangeDetail)    |
 *   ({ revisionType: "scholarship" }                            & ScholarshipChangeDetail)  |
 *   ({ revisionType: "waiver" }                                 & WaiverChangeDetail)       |
 *   ({ revisionType: "fine" }                                   & FineChangeDetail)         |
 *   ({ revisionType: "fee_correction" }                         & CorrectionChangeDetail)
 * )} RevisionChangeEntry
 */

/**
 * Fee revision document (Fee Revision module schema).
 *
 * Field naming differs from the earlier FeeRevision typedef (revisedBy / reviewedBy /
 * changeType / changeDetail). Both schemas write to the same feeRevisions collection.
 *
 * A single revision may bundle multiple independent changes in the changes[] array.
 * Example: [remove Transport, add Hostel, apply 20% Scholarship] in one atomic revision.
 *
 * @typedef {Object} FeeRevisionDoc
 * @property {string}  revisionId                 - Firestore document ID
 * @property {string}  studentId                  - FK → students; denormalised
 * @property {string}  profileId                  - FK → studentFeeProfiles
 * @property {string}  academicYear               - "YYYY-YY"
 * @property {"draft"|"pending_approval"|"approved"|"applied"|"rejected"|"cancelled"} status
 * @property {string}  effectiveInstallment       - First installment affected by this revision.
 *   Monthly format:   "YYYY-MM"       e.g. "2026-08"
 *   Quarterly format: "Q{n}-YYYY-YY"  e.g. "Q2-2026-27"
 * @property {string}  reason                     - Non-empty justification; required on create
 * @property {string}  requestedBy                - Admin UID who created the revision
 * @property {import('firebase/firestore').Timestamp} requestedAt
 * @property {string|null}  approvedBy
 * @property {import('firebase/firestore').Timestamp|null} approvedAt
 * @property {string|null}  appliedBy
 * @property {import('firebase/firestore').Timestamp|null} appliedAt
 * @property {string|null}  cancelledBy
 * @property {import('firebase/firestore').Timestamp|null} cancelledAt
 * @property {RevisionChangeEntry[]}  changes     - One or more independent changes bundled in this revision; min length 1
 */

// ─── Collection Document Shapes ───────────────────────────────────────────────

/**
 * @typedef {Object} AcademicYear
 * @property {string} id
 * @property {string} schoolId
 * @property {string} year                   - "YYYY-YY" (e.g. "2026-27"); unique per schoolId
 * @property {import('firebase/firestore').Timestamp} startDate   - April 1 00:00:00 local
 * @property {import('firebase/firestore').Timestamp} endDate     - March 31 23:59:59 local
 * @property {"active"|"inactive"|"closed"} status
 *   - "active"   → current working year; only one per school
 *   - "inactive" → newly created, or was active and deactivated when another year was activated
 *   - "closed"   → formally closed; terminal state
 * @property {import('firebase/firestore').Timestamp|null} activatedAt  - null until first activation
 * @property {string|null} activatedBy                                   - UID who last activated
 * @property {import('firebase/firestore').Timestamp|null} closedAt
 * @property {string|null} closedBy
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 * @property {string} [createdBy]
 */

/**
 * @typedef {Object} StudentFeeProfile
 * @property {string} id
 * @property {string} studentId
 * @property {string} academicYearId              - FK → academicYears
 * @property {string} academicYear                - Denormalised "YYYY-YY"
 * @property {string} schoolId
 * @property {string} classId
 * @property {string} classLabel                  - Snapshot class name
 * @property {string|null} feeStructureId         - FK → feeStructures (fixed template); null if none
 * @property {FeeLineItem[]} feeLineItems         - Live snapshot; updated by revisions for future open installments
 * @property {string[]} variableFeeIds            - feeStructureIds of opted-in variable fees
 * @property {"monthly"|"quarterly"} schedule
 * @property {number} grossAnnualFee              - sum of all installment grossAmounts
 * @property {FeeAdjustment[]} feeAdjustments     - All active discounts/waivers/scholarships
 * @property {number} totalAdjustmentAmount       - sum(feeAdjustments[].computedAmount)
 * @property {number} netAnnualFee                - grossAnnualFee − totalAdjustmentAmount
 * @property {number} openingOutstanding          - Default 0; debt owed from prior year
 * @property {number} openingCredit               - Default 0; credit owed to student
 * @property {number} openingPaid                 - Default 0; collected against openingOutstanding so far
 * @property {boolean} installmentsGenerated      - Default false
 * @property {number} revisionCount               - Default 0; increments on each applied revision
 * @property {import('firebase/firestore').Timestamp|null} lastRevisedAt
 * @property {"draft"|"active"|"closed"} status
 *   - "draft"  → profile created; fee items / adjustments being configured; installments not generated
 *   - "active" → installments generated; profile is live; payments are accepted
 *   - "closed" → student promoted or profile retired; terminal state
 * @property {string|null} promotedFromProfileId  - FK → studentFeeProfiles (prior year)
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 * @property {string} [createdBy]
 */

/**
 * One installment demand document per student per period.
 * INVARIANT: balance === netAmount − totalAllocated
 * INVARIANT: if status === "cancelled" → balance === 0, cancelledAt ≠ null
 * INVARIANT: if isLocked === true → no new paymentAllocations may reference this id
 *
 * @typedef {Object} FeeInstallment
 * @property {string} id
 * @property {string} feeProfileId
 * @property {string} studentId                  - Denormalised
 * @property {string} schoolId                   - Denormalised
 * @property {string} academicYear               - Denormalised "YYYY-YY"
 * @property {number} installmentNumber          - 1–12 (monthly) or 1–4 (quarterly)
 * @property {string} period                     - "YYYY-MM" or "Q{n}-YYYY-YY"
 * @property {string} periodLabel                - Human label e.g. "July 2026"
 * @property {import('firebase/firestore').Timestamp} dueDate
 * @property {boolean} isHolidayMonth            - Default false
 * @property {FeeLineItem[]} lineItems            - Snapshot; updated by revisions for future open installments
 * @property {number} grossAmount                - sum(lineItems[].amount)
 * @property {number} discountAmount             - Combined feeAdjustments contribution for this period
 * @property {number} netAmount                  - grossAmount − discountAmount; fixed once paid/cancelled
 * @property {number} totalAllocated             - Default 0; sum of paymentAllocations.amount for this id
 * @property {number} balance                    - netAmount − totalAllocated; positive = still owed
 * @property {"upcoming"|"due"|"partial"|"overdue"|"paid"|"cancelled"} status
 * @property {boolean} isLocked                  - Default false; set by period close
 * @property {import('firebase/firestore').Timestamp|null} cancelledAt
 * @property {string|null} cancellationReason
 * @property {string|null} lastRevisionId        - FK → feeRevisions
 * @property {import('firebase/firestore').Timestamp|null} lastRevisedAt
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * One payment transaction. Supply-side ledger and receipt in one document.
 * INVARIANT: sum(allocationSummary[].amount) === amount
 *
 * @typedef {Object} FeePayment
 * @property {string} id
 * @property {string} receiptNo                  - "RCP-YYYYMMDD-XXXX"; unique per schoolId
 * @property {string} studentId
 * @property {string} schoolId
 * @property {string} academicYear               - Denormalised "YYYY-YY"
 * @property {number} amount                     - Total transaction amount; > 0
 * @property {import('firebase/firestore').Timestamp} paymentDate  - Date payment was received
 * @property {"cash"|"upi"|"cheque"|"dd"|"online"} paymentMode
 * @property {string} collectedBy                - Staff name or UID
 * @property {string|null} notes                 - Cheque no., UTR, remarks
 * @property {AllocationRef[]} allocationSummary - Denormalised for receipt printing
 * @property {"confirmed"|"cancelled"} status    - Default "confirmed"
 * @property {import('firebase/firestore').Timestamp|null} cancelledAt
 * @property {string|null} cancelledBy
 * @property {string|null} cancellationNote
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {string} createdBy                  - Admin UID
 * @property {boolean} [_isMigrated]             - true for synthetic migration docs
 */

/**
 * Join between a payment and an installment (or opening balance).
 * One document per allocation per payment.
 * INVARIANT: if allocationTarget === "installment" → installmentId ≠ null, period ≠ null
 * INVARIANT: if allocationTarget === "opening_balance" → installmentId === null, period === null
 * INVARIANT: sum(componentAllocations[].allocatedAmount) === amount  (when target === "installment")
 *
 * @typedef {Object} PaymentAllocation
 * @property {string} id
 * @property {string} paymentId
 * @property {"installment"|"opening_balance"} allocationTarget
 * @property {string|null} installmentId         - FK → feeInstallments; null iff opening_balance
 * @property {string} studentId                  - Denormalised
 * @property {string} schoolId                   - Denormalised
 * @property {string} academicYear               - Denormalised "YYYY-YY"
 * @property {number} amount                     - INR allocated to this target; > 0
 * @property {string|null} period                - "YYYY-MM"; null for opening_balance
 * @property {"proportional"|"priority_order"|"explicit"} allocationStrategy
 * @property {ComponentAlloc[]} componentAllocations - [] for opening_balance target
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * Immutable audit log entry for a change applied to a fee profile after
 * installments were generated. Documents are write-once.
 *
 * @typedef {Object} FeeRevision
 * @property {string} id
 * @property {string} profileId                  - FK → studentFeeProfiles
 * @property {string} studentId                  - Denormalised
 * @property {string} schoolId                   - Denormalised
 * @property {string} academicYear               - Denormalised "YYYY-YY"
 * @property {import('firebase/firestore').Timestamp} revisedAt
 * @property {string} revisedBy                  - Admin UID or name
 * @property {string} reason                     - Non-empty free text; required before save
 * @property {"add_item"|"remove_item"|"adjust_amount"|"add_adjustment"|"modify_adjustment"|"remove_adjustment"|"cancel_installment"} changeType
 * @property {ChangeDetail} changeDetail
 * @property {string} affectsPeriodFrom          - "YYYY-MM" — earliest period touched
 * @property {string[]} installmentsUpdated      - FK[] → feeInstallments recomputed
 * @property {string[]} installmentsCancelled    - FK[] → feeInstallments cancelled; default []
 * @property {string|null} snapshotBefore        - Optional JSON of profile state before change
 * @property {"pending"|"approved"|"rejected"|"applied"} revisionStatus
 *   - "pending"  → awaiting review; no installments touched
 *   - "approved" → authorised by reviewer; installments NOT yet modified
 *   - "rejected" → declined; profile and installments unchanged
 *   - "applied"  → changes written to installments and profile; document immutable
 *   Default: "pending"
 * @property {string|null} reviewedBy   - UID of approver/rejecter; null while pending
 * @property {import('firebase/firestore').Timestamp|null} reviewedAt  - null while pending
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * Extended feeStructures document shape. V2 adds allocationPriority.
 * The underlying Firestore collection is shared with the old fee module.
 *
 * @typedef {Object} FeeStructure
 * @property {string}             id
 * @property {string}             schoolId
 * @property {"fixed"|"variable"} type          - fixed = mandatory for class; variable = opt-in
 * @property {string|null}        classId        - FK → classes; null for variable (school-wide)
 * @property {string|null}        classLabel     - Denormalised; null for variable
 * @property {string}             label
 * @property {number}             amount         - Per-cycle INR; ≥ 0
 * @property {boolean}            isOneTime      - Default false
 * @property {boolean}            chargedDuringHolidays  - Default true
 * @property {number}             allocationPriority     - Default 999; lower = paid first
 * @property {boolean}            isActive       - Default true; false = soft-deleted
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

export {};
