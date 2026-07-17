# API Reference

All service functions are client-side Firestore SDK calls unless noted as Cloud Function (CF).

---

## Cloud Functions (HTTP POST)

All Cloud Functions are deployed to region `us-central1`, project `usms-v2`.

| Function | URL | Request body fields |
|---|---|---|
| `createStudent` | `https://createstudent-z4likafkwq-uc.a.run.app/` | student fields + schoolId |
| `deleteStudent` | `https://deletestudent-z4likafkwq-uc.a.run.app` | `{ studentId }` |
| `createTeacher` | `https://createteacher-z4likafkwq-uc.a.run.app` | teacher fields + schoolId |
| `deleteTeacher` | `https://deleteteacher-z4likafkwq-uc.a.run.app` | `{ teacherId }` |
| `changeTeacherPassword` | `https://changeteacherpassword-z4likafkwq-uc.a.run.app` | `{ teacherId, newPassword }` |
| `createNotice` | `https://createnotice-z4likafkwq-uc.a.run.app` | notice fields + schoolId |
| `deleteNotice` | `https://deletenotice-z4likafkwq-uc.a.run.app` | `{ noticeId }` |
| `createSchool` | `https://us-central1-usms-v2.cloudfunctions.net/createSchool` | school fields |
| `deleteSchool` | `https://us-central1-usms-v2.cloudfunctions.net/deleteSchool` | `{ schoolId }` |

All CFs return JSON. Error responses have an `error` string field. Non-2xx status codes throw in the service layer.

---

## student.service.js

```
getStudentsBySchool(schoolId)
  → Promise<Student[]>
  Queries students where schoolId matches. Client-filters isActive !== false && status !== "alumni".

createStudent(studentData)
  → Promise<void>
  CF: https://createstudent-z4likafkwq-uc.a.run.app/

updateStudent(studentId, updates)
  → Promise<void>
  Direct Firestore updateDoc.

promoteStudents(studentIds, classId, classLabel, academicYear)
  → Promise<void>
  Batch updateDoc: sets classId, classLabel; appends to promotionHistory[].

graduateStudents(studentIds, finalClassId, finalClassLabel, academicYear)
  → Promise<void>
  Batch updateDoc: sets isActive=false, isGraduated=true, finalClassId, finalClassLabel, academicYear.

deleteStudent(studentId)
  → Promise<void>
  CF: https://deletestudent-z4likafkwq-uc.a.run.app
```

---

## teacher.service.js

```
getTeachersBySchool(schoolId)
  → Promise<Teacher[]>

createTeacher(teacherData)
  → Promise<void>
  CF: https://createteacher-z4likafkwq-uc.a.run.app

getTeacherById(teacherId)
  → Promise<Teacher|null>

updateTeacher(teacherId, updates)
  → Promise<void>
  Direct Firestore updateDoc.

changeTeacherPassword(teacherId, newPassword)
  → Promise<void>
  CF: https://changeteacherpassword-z4likafkwq-uc.a.run.app

deleteTeacher(teacherId)
  → Promise<void>
  CF: https://deleteteacher-z4likafkwq-uc.a.run.app
```

---

## class.service.js

```
createClass({ schoolId, grade, section, isActive })
  → Promise<void>
  Computed id = "${grade}${section}". Writes to addDoc (Firestore auto-assigns doc ID).

getClassesBySchool(schoolId)
  → Promise<Class[]>
  Returns docs with docId field = Firestore document ID.

toggleClassStatus(classId, isActive)
  → Promise<void>

deleteClass(classId, schoolId)
  → Promise<void>
  Pre-checks classSubjects; throws if any subjects assigned.
```

---

## subject.service.js

```
addSubject({ name, schoolId })
  → Promise<void>
  Pre-checks for duplicate name (case-sensitive). Throws if duplicate exists.

getSubjectsBySchool(schoolId)
  → Promise<Subject[]>

toggleSubjectStatus(subjectId, isActive)
  → Promise<void>

deleteSubject({ subjectId, schoolId })
  → Promise<void>
  Pre-checks classSubjects; throws if subject is assigned to any class.
```

---

## classSubject.service.js

```
getClassSubjects(classId, schoolId)
  → Promise<ClassSubject[]>

addSubjectToClass({ classId, subjectId, schoolId })
  → Promise<void>
  No-ops silently if the mapping already exists.

removeSubjectFromClass({ classSubjectId, classId, subjectId, schoolId })
  → Promise<void>
  Cascades: calls removeTeacherAssignmentsForClassSubject() first, then deletes mapping.
```

---

## teacherClassSubject.service.js

```
getTeacherAssignments(schoolId)
  → Promise<TeacherClassSubject[]>

getAssignmentsForTeacher({ teacherId, schoolId })
  → Promise<TeacherClassSubject[]>

assignTeacher({ teacherId, classId, subjectId, schoolId })
  → Promise<void>

removeTeacherAssignment(docId)
  → Promise<void>

removeTeacherAssignmentsForClassSubject({ classId, subjectId, schoolId })
  → Promise<void>
  Sequential deleteDoc for each matched document.
```

---

## notice.service.js

```
createNotice(noticeData)
  → Promise<void>
  CF: https://createnotice-z4likafkwq-uc.a.run.app

deleteNotice(noticeId)
  → Promise<void>
  CF: https://deletenotice-z4likafkwq-uc.a.run.app

uploadNoticeAttachment(file, schoolId)
  → Promise<{ name: string, url: string, type: string, size: number }>
  Firebase Storage upload.

getRecentNoticesBySchool(schoolId, limitN?)
  → Promise<Notice[]>
  Ordered by createdAt desc. Default limit: 10 (verify in source).
```

---

## alumni.service.js

```
getAlumni(schoolId)
  → Promise<Alumni[]>
  Queries both isGraduated==true and status=="alumni". Merges and normalises.

getAlumniByYear(schoolId, year)
  → Promise<Alumni[]>

getAlumniByClass(schoolId, classId)
  → Promise<Alumni[]>

searchAlumni(alumni[], query)
  → Alumni[]
  Pure client-side filter on name, admissionId, phone.

getAlumniProfile(studentId)
  → Promise<Alumni|null>
```

---

## fees.service.js (Legacy)

```
currentAcademicYear()
  → string  e.g. "2025-26"
  April-start calculation from current date.

generatePeriods(schedule, academicYear)
  → string[]   e.g. ["Apr-2025", ..., "Mar-2026"]  (monthly) or ["Q1-2025-26", ...] (quarterly)

createStudentFeeYear(studentId, schoolId, academicYear, schedule, feeStructure, openingBalance?)
  → Promise<void>
  Creates studentFeeYears doc + monthly/quarterly feePayments records. Handles opening balance record.

closeStudentFeeYear(studentId, academicYear)
  → Promise<void>
  Locks all payment records, computes closing balance.

addVariableFeeToStudent(studentId, academicYear, feeName, amount)
  → Promise<void>
  Adds to remaining unlocked periods.

removeVariableFeeFromStudent(studentId, academicYear, feeName)
  → Promise<void>

recordPayment(paymentDocId, amountPaid, paymentDate, paymentMode, notes?)
  → Promise<void>
  Updates one feePayments doc; triggers recalculateStudentLedger().

closePeriod(schoolId, period, academicYear)
  → Promise<void>
  Locks all records for period; recalculates all affected student ledgers.

getFeePaymentsByStudent(studentId)
  → Promise<FeePayment[]>

getFeePaymentsBySchool(schoolId, period, academicYear)
  → Promise<FeePayment[]>

getStudentNetBalance(studentId, academicYear)
  → Promise<number>

getStudentBalancesMap(schoolId, academicYear)
  → Promise<Map<string, number>>

createFeeProfileAfterPromotion(studentId, schoolId, oldYear, newYear, schedule, feeStructure)
  → Promise<void>
  Closes old year; creates new year with carry-forward balance.

recalculateStudentLedger(studentId, academicYear)
  → Promise<void>
  Recomputes carryForward, outstanding, status for all periods. Writes in batches of 200.
```

---

## superadmin.service.js

```
getAllSchools()
  → Promise<School[]>

getSchool(schoolId)
  → Promise<School|null>

getPrincipalBySchool(schoolId)
  → Promise<Principal|null>

getPlatformStats()
  → Promise<{ totalSchools, activeSchools, totalStudents, totalTeachers }>

getSchoolEntityCounts(schoolId)
  → Promise<{ students, teachers }>

getRecentSchools()
  → Promise<School[]>   (last 5 by createdAt desc)

updateSchoolSubscription(schoolId, { plan, planExpiresAt, isActive })
  → Promise<void>

createSchool(data)
  → Promise<any>
  CF: https://us-central1-usms-v2.cloudfunctions.net/createSchool

deleteSchool(schoolId)
  → Promise<any>
  CF: https://us-central1-usms-v2.cloudfunctions.net/deleteSchool
```

---

## timePeriod.service.js

```
getTimePeriodsBySchool(schoolId)
  → Promise<TimePeriod[]>   sorted by order asc

addTimePeriod({ schoolId, name, from, to, order })
  → Promise<void>

updateTimePeriod(id, { name, from, to, order })
  → Promise<void>

deleteTimePeriod(id)
  → Promise<void>
```

---

## fees-v2 / academicYear.service.js

```
createAcademicYear({ schoolId, year, startDate, endDate, feeSchedule, holidayMonths? })
  → Promise<string>   doc ID
  Validates year format. Checks uniqueness. Status: INACTIVE on creation.

getAcademicYearsBySchool(schoolId)
  → Promise<AcademicYear[]>   sorted by year desc client-side

getActiveAcademicYear(schoolId)
  → Promise<AcademicYear|null>   limit(1) query for status=="active"

getAcademicYearById(yearId)
  → Promise<AcademicYear|null>

activateAcademicYear(yearId, schoolId)
  → Promise<void>
  Transaction: deactivates current ACTIVE year, activates target.

closeAcademicYear(yearId, schoolId)
  → Promise<void>
  Pre-checks: no DRAFT profiles, no PENDING revisions for this year.

deleteAcademicYear(yearId)
  → Promise<void>
  Only INACTIVE years with no profiles.

updateAcademicYear(yearId, updates)
  → throws "Not implemented"
```

---

## fees-v2 / feeStructure.service.js

```
createFeeStructure({ schoolId, name, amount, type, classId?, chargedDuringHolidays, allocationPriority, isActive })
  → Promise<string>

updateFeeStructure(id, updates)
  → Promise<void>

deactivateFeeStructure(id)
  → Promise<void>

updateAllocationPriority(id, allocationPriority)
  → Promise<void>

getFixedFeeStructuresForClass(schoolId, classId)
  → Promise<FeeStructure[]>   type=="fixed", isActive==true for classId

getVariableFeeStructuresOrdered(schoolId)
  → Promise<FeeStructure[]>   type=="variable", isActive==true, sorted by allocationPriority

getAllFeeStructuresOrdered(schoolId)
  → Promise<FeeStructure[]>   all active, sorted by allocationPriority

getFeeStructureById(id)
  → Promise<FeeStructure|null>
```

---

## fees-v2 / feeProfile.service.js

```
createDraftProfile({ studentId, schoolId, academicYearId, classId, schedule, variableFeeIds?, feeAdjustments?, openingOutstanding?, openingCredit? })
  → Promise<string>   doc ID = "${studentId}_${academicYearId}"
  Transaction: loads fixed fee structures, snapshots as feeLineItems, duplicate guard.

updateDraftProfile(profileId, { variableFeeIds?, feeAdjustments?, schedule? })
  → Promise<void>
  Resolves variable fees, recomputes grossAnnualFee, derives adjustment amounts.

activateProfile(profileId)
  → throws "Not implemented" (activation happens via createInstallments)

closeProfile(profileId)
  → Promise<void>
  Requires academic year to be CLOSED.

getProfile(profileId)
  → Promise<StudentFeeProfile|null>

getProfileByStudentAndYear(studentId, academicYearId)
  → Promise<StudentFeeProfile|null>   deterministic ID lookup

getProfilesBySchoolAndYear(schoolId, academicYearId)
  → Promise<StudentFeeProfile[]>

deleteDraftProfile(profileId)
  → Promise<void>   only DRAFT profiles
```

---

## fees-v2 / feeInstallment.service.js

```
createInstallments(profileId, schoolSettings)
  → Promise<void>
  Loads profile → generates schedule (pure) → validates → applies opening credit/outstanding →
  writes all installment docs + activates profile in one transaction.

getInstallments(profileId)
  → Promise<FeeInstallment[]>

getInstallmentsByStudentAndYear(studentId, academicYearId)
  → Promise<FeeInstallment[]>

getOutstandingInstallments(profileId)
  → Promise<FeeInstallment[]>   balance > 0, not cancelled

waiverInstallmentsForBatch(pendingPromotions, waivedBy, waiverReason)
  → Promise<void>
  Chunked writeBatch (400 ops). Waives non-paid/non-cancelled installments.

updateInstallment()   → throws "Not implemented"
cancelInstallment()   → throws "Not implemented"
lockPeriodInstallments()   → throws "Not implemented"
```

---

## fees-v2 / feePayment.service.js

```
createPayment({ schoolId, studentId, profileId, academicYearId, amount, paymentMode, paymentDate, collectedBy, notes? })
  → Promise<{ paymentId, receiptNo }>
  Full atomic transaction: reads counter+profile+installments, runs allocation engine,
  writes payment+allocations+installment updates.

getPayment(paymentId)
  → Promise<FeePayment|null>

getPaymentByReceiptNo(schoolId, receiptNo)
  → Promise<FeePayment|null>

getPaymentsByStudent(studentId, academicYearId?)
  → Promise<FeePayment[]>

getPaymentsBySchool(schoolId, academicYearId?)
  → Promise<FeePayment[]>

cancelPayment()   → throws "Not implemented" (see paymentCancellation.service.js)
```

---

## fees-v2 / paymentCancellation.service.js

```
cancelPayment(paymentId, cancellationReason, cancelledBy)
  → Promise<void>
  Atomic transaction: marks payment CANCELLED, stamps allocations isReversed=true,
  decrements profile.openingPaid, restores installment balances and re-derives status.

loadPayment(paymentId)
  → Promise<{ payment, paymentRef, allocations, allocRefs }>
  (exported for unit testability)

markPaymentCancelled(tx, paymentRef, cancelledBy, cancellationReason, now)
  → void (sync, inside transaction)

markAllocationsReversed(tx, allocRefs, now)
  → void (sync, inside transaction)

reverseOpeningBalance(tx, profileRef, profileSnap, reversalAmount, now)
  → void (sync, inside transaction)

reverseInstallments(tx, instRefs, instSnaps, reversalAmountByInstallmentId, now)
  → void (sync, inside transaction)
```

---

## fees-v2 / feeRevision.service.js

```
createRevision({ profileId, schoolId, studentId, academicYearId, reason, effectiveInstallment, changes })
  → Promise<string>   revision doc ID. Status: DRAFT.

updateDraftRevision(revisionId, { reason?, effectiveInstallment?, changes? })
  → Promise<void>   only DRAFT revisions.

submitRevision(revisionId, submittedBy)
  → Promise<void>   DRAFT → PENDING_APPROVAL.

approveRevision(revisionId, approvedBy)
  → Promise<void>   PENDING_APPROVAL → APPROVED.

rejectRevision(revisionId, rejectedBy, rejectionReason)
  → Promise<void>   PENDING_APPROVAL → REJECTED.

cancelRevision(revisionId, cancelledBy)
  → Promise<void>   DRAFT or PENDING_APPROVAL → CANCELLED.

applyRevision(revisionId, appliedBy)
  → deprecated. Use applyRevisionPlan() from feeRevisionPersistence.service.js.

getRevision(revisionId)
  → Promise<FeeRevision|null>

getRevisionsByProfile(profileId)
  → Promise<FeeRevision[]>

getRevisionsByStudent(studentId, academicYearId?)
  → Promise<FeeRevision[]>

getRevisionsBySchool(schoolId, academicYearId?)
  → Promise<FeeRevision[]>
```

---

## fees-v2 / feeRevisionPersistence.service.js

```
loadRevision(revisionId)
  → Promise<FeeRevisionDoc>

loadProfile(profileId)
  → Promise<StudentFeeProfile>

applyRevisionPlan(revision, plan, profileUpdate, appliedBy)
  → Promise<{ installmentsUpdated: number }>
  Atomic transaction: updates N installments + profile snapshot + transitions revision to APPLIED.
  Pre-condition: revision.status must be APPROVED.
```

---

## fees-v2 / Pure Engines (no Firestore, no async)

```
// feeScheduleGenerator.js
generateSchedule(profile, schoolSettings, academicYear)
  → ScheduleEntry[]

// paymentAllocationEngine.js
buildAllocationPlan(paymentAmount, profile, installments)
  → AllocationPlan

// feeRevisionEngine.js
computeRevisionPlan(profile, installments, revision, structuresMap)
  → RevisionPlan

// receiptGenerator.js
buildReceipt(payment, profile, student, school)
  → ReceiptModel
```

---

## promotion / promotionBatch.service.js

```
createBatch({ schoolId, promotionType, fromClassId, toClassId?, fromAcademicYear, toAcademicYear, promotionPlanSnapshot, createdBy, totalStudents })
  → Promise<string>   batch doc ID. Status: DRAFT, all counters 0.

getBatch(batchId)
  → Promise<PromotionBatch|null>

getBatches(schoolId, filters?)
  → Promise<PromotionBatch[]>

updateBatch(batchId, updates)
  → Promise<void>

cancelBatch(batchId, cancelledBy)
  → Promise<void>   sets status: CANCELLED.
```

---

## promotion / studentPromotion.service.js

```
createPromotion({ batchId, schoolId, studentId, fromAcademicYear, toAcademicYear, fromClassId, toClassId?, promotionType, openingOutstanding?, openingCredit?, carriedVariableFeeIds?, oldFeeProfileId?, requestedBy })
  → Promise<string>   StudentPromotion doc ID. Status: DRAFT.

completePromotion(promotionId, { completedBy, newFeeProfileId? })
  → Promise<void>   Increments batch.completedStudents.

failPromotion(promotionId, errorMessage, failedBy)
  → Promise<void>   Increments batch.failedStudents.

skipPromotion(promotionId, skippedBy, reason?)
  → Promise<void>   Increments batch.skippedStudents.

getPromotion(promotionId)
  → Promise<StudentPromotion|null>

getPromotionsByBatch(batchId)
  → Promise<StudentPromotion[]>   sorted by studentId.
```

---

## promotion / promotionPersistence.service.js

```
persistPromotionPlan(batch, studentPromotion, plan, persistedBy)
  → Promise<{ newFeeProfileId: string|null, batchStatus: string }>
  Atomic transaction: creates draft fee profile (CLASS_PROMOTION) + updates StudentPromotion + updates batch counters.

deriveBatchStatus(completedStudents, failedStudents, skippedStudents, totalStudents)
  → string   BatchStatus enum value. (Pure, exported for testing.)
```

---

## promotion / promotionExecution.service.js

```
executeBatch(batchId, executedBy, { onProgress? })
  → Promise<{ completed, failed, skipped, total }>
  Pre-loads students/profiles/fee structures/academic year. Executes DRAFT/PENDING promotions sequentially.

executePromotion(batch, studentPromotion, context, executedBy)
  → Promise<{ newFeeProfileId: string|null, batchStatus: string }>
  Runs engine for one student; calls persistPromotionPlan.

retryFailed(batchId, promotionIds?, executedBy, { onProgress? })
  → Promise<{ completed, failed, skipped, total }>
  Resets FAILED → DRAFT, then executeBatch.

resetForRetry(promotionId, batchId)
  → Promise<void>
  Transaction: StudentPromotion FAILED → DRAFT, decrements batch.failedStudents.
```

---

## promotion / Pure Engines

```
// promotionEngine.js
buildPromotionPlan(batch, studentPromotion, student, oldFeeProfile, destFeeStructures, academicYear, destClassLabel)
  → PromotionPlan

buildGraduationPlan(batch, studentPromotion)
  → PromotionPlan
```

---

## rollover / rolloverEngine.js (Pure)

```
buildRolloverPlan(currentAcademicYear, nextAcademicYear, batch, studentPromotions)
  → RolloverPlan
  Routes each StudentPromotion: COMPLETED+PROMOTED → CLASS_PROMOTION, COMPLETED+GRADUATED → GRADUATION, others → skipped.
```

---

## rollover / rolloverExecution.service.js

```
updateAcademicYears(currentYearId, nextYearId)
  → Promise<void>
  Transaction: nextYear.status=ACTIVE, currentYear.status=CLOSED.

executeStudentUpdate(studentPromotion, nextAcademicYear)
  → Promise<void>
  Transaction: updates student classId/classLabel/currentClassId/currentAcademicYear; closes old profile.

executeGraduationUpdate(studentPromotion, currentAcademicYear)
  → Promise<void>
  Transaction: sets student.status="alumni", isActive=false, graduation fields; closes old profile.

executeRollover(rolloverPlan)
  → Promise<RolloverSummary>
  Full execution: year transition → per-student updates → write rolloverSummary to closed year doc.
```

---

## hooks

```
// useSchoolSettings.js
useSchoolSettings(schoolId)
  → { feeAcademicYear, feeSchedule, holidayMonths, loading }
  Module-level cache. Reads schools/{schoolId}.

// useSchoolPlan.js
useSchoolPlan(schoolId)
  → { plan, isPremium, isFree, loading }
  Module-level cache. Reads schools/{schoolId}.plan.
```
