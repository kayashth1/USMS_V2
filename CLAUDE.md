# USMS Admin V2 — School ERP System

## Project Overview
This is a **School ERP Admin Panel** built as a React single-page application with Firebase as the backend. It is the admin-facing interface for managing a school's day-to-day operations.

## Tech Stack
- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4 + Radix UI primitives (shadcn/ui style components)
- **Backend/DB**: Firebase v12 (Firestore + Auth)
- **Routing**: React Router DOM v7
- **Icons**: lucide-react
- **PDF Export**: jspdf

## Project Structure
```
frontend/
  src/
    Pages/          # Full page views (Dashboard, Students, Teachers, etc.)
    components/     # Reusable components
      ui/           # Base UI components (button, card, input, dialog, etc.)
      Layout/       # AdminLayout, Header, Sidebar
      students/     # Student-specific dialogs and components
      teachers/     # Teacher-specific dialogs and components
      attendance/   # Attendance filters, calendar, table
      academics/    # Upgrade/promote dialogs
      settings/     # Class, Subject, TimePeriod, TeacherAssignment management
    services/       # Firebase service layer (one file per entity)
    data/           # Static/seed data files
    Routes/         # AppRoute, ProtectedRoute
    config/
      firebase.js   # Firebase initialization
```

## Pages
- Dashboard, Students, Teachers, Attendance, Academics, Books, Fees, Timetable, Notices, Alumni, Settings, Login

## Key Conventions
- Services live in `frontend/src/services/` — one file per entity (e.g., `student.service.js`, `teacher.service.js`)
- UI primitives are in `frontend/src/components/ui/` — prefer using existing ones before creating new
- Dialogs for CRUD operations are colocated with their entity's component folder
- Dev server: run `npm run dev` inside `frontend/`

## Firebase Storage rules, added 2026-07-20

`storage.rules` (referenced from `firebase.json`'s new `storage.rules` key) is now version-controlled here — it didn't exist as a file anywhere before this date; Storage rules had been managed ad hoc (console or a one-off CLI push) with no source of truth in any of the three repos in this ecosystem (Admin panel, Student app, Teacher app).

**Why this was added**: while debugging why the Teacher app's Material upload feature always failed with a Storage 403, the live rules (fetched via the Firebase Rules API) turned out to only grant access under `/library/**` — nothing else. Any other path, including `/materials/**` (used by the Teacher app's study-materials upload), was denied by Firebase Storage's deny-by-default model. Added a matching `/materials/**` block (same permission shape as `/library/**`: public read, write requires auth) and deployed via `firebase deploy --only storage -P usms-v2` from this repo.

**If a future feature writes to a new Storage path prefix, it needs its own `match` block here** — there's no catch-all rule. Check `storage.rules` before assuming a Storage write will work; deploy with `firebase deploy --only storage -P usms-v2` from this repo's root after editing.

## Attendance module, added 2026-07-30

The Admin Panel reads attendance but **never writes it**. Attendance is exclusively owned by the Teacher App.

**Firestore path (written by Teacher App, read by Admin Panel):**
```
attendance/{schoolId}/academicYears/{academicYearId}/classes/{classId}/months/{month}
```
- `month` doc ID: 2-char zero-padded calendar month string, e.g. `"07"`
- `academicYearId`: Firestore document ID of the `academicYears` doc where `status == "active"`
- Day key inside `days` map: `"yyyy-MM-dd"` string
- Day value: `{ records: { [studentId]: boolean }, teacherId, subjectId, periodId, markedAt }`

**All Firestore attendance reads go through `frontend/src/services/attendance.service.js`.** UI components call service functions; they never query the attendance collection directly.

**Attendance settings** are stored at `schools/{schoolId}.attendanceSettings`:
```js
{ openBeforeMinutes: number, closeAfterMinutes: number, lockImmediately: boolean, allowCorrections: boolean }
```
The Teacher App currently hardcodes `openBeforeMinutes = 10`. Writing this to Firestore prepares it for the Teacher App to consume once it is updated to read from Firestore instead.

**Routes:** `/attendance` → dashboard (`Attendance.jsx`), `/attendance/:classId` → detail (`ClassAttendance.jsx`)

**StudentAttendanceSummary component** (`components/attendance/StudentAttendanceSummary.jsx`) can be dropped into StudentProfile — import it and render `<StudentAttendanceSummary schoolId={schoolId} classId={student.classId} studentId={student.id} />`.

## Time Period validation, added 2026-07-30

`TimePeriodManagement.jsx`'s save handler now rejects `to <= from` before writing to `timePeriods`. Added after finding three real documents at one school where an afternoon period's `to` (and in two cases `from` too) had been entered as `"01:00"`/`"02:00"`/`"03:00"` instead of `"13:00"`/`"14:00"`/`"15:00"` — the native `<input type="time">` picker already stores unambiguous 24-hour values, so this was a human picking AM instead of PM, not a parsing issue. Every consumer of `timePeriods` (Teacher app's Live Now/Upcoming logic, at minimum) assumes `to` is chronologically after `from` on the same day; when that's violated the affected period silently never registers as "live," with no error anywhere — it just looks like the feature doesn't work. This validation is the actual fix; the bad documents were hand-corrected once, but nothing previously stopped it from happening again for any school.

## Promotion: real pipeline vs. dead legacy code — investigated 2026-08-08

User reported promoted students not showing up under their new class in the Teacher app, Admin, and Student app. Traced the actual promotion pipeline (`rollover/` module: `promotionEngine.js` → `promotionPersistence.service.js` → `rolloverExecution.service.js`, run from `Pages/rollover/AcademicYearRollover.jsx`) and verified it against live Firestore: queried every `promotionBatches` doc across all schools in `usms-v2` — every `class_promotion`/`graduation` batch shows `completedStudents == totalStudents`, `failedStudents: 0`, `skippedStudents: 0`. Spot-checked real student documents (school `0ukrTt2FaSN7DUwRDH1q`, batch 11A→12A): `classId`/`classLabel`/`currentClassId`/`currentAcademicYear` are all correctly updated post-promotion. **The Rollover pipeline itself is not the bug** — wherever it was actually used, the data came out correct.

**Found instead: `services/student.service.js` still exports `promoteStudents()` and `graduateStudents()`** — a completely separate, older, non-transactional promotion path that writes directly to `students/{id}` via a bare `updateDoc`, with **different field names than the real pipeline**: `graduateStudents()` sets `isGraduated: true` + `finalClassId`/`finalClassLabel` (the real pipeline sets `status: "alumni"` + `graduatedClassId`/`graduatedAcademicYear` — see `rolloverExecution.service.js`'s `executeGraduationUpdate()`); `promoteStudents()` updates `classId`/`classLabel` but never touches `currentClassId`/`currentAcademicYear`, so it would desync the two promoted-state field pairs the real pipeline keeps in sync. **Confirmed dead** — grepped the whole `frontend/src` and neither function has any caller; no UI wires up to them today. Left in place (removing is a separate cleanup decision), but flagged here because if anyone ever adds a button that calls either function, it will silently produce students whose `status`/`classId` don't match what the rest of the app (including both mobile apps' alumni/promotion filtering, which checks `status === "alumni"`) expects.

**Actual root cause of the reported symptom, found in the Student app**: see `Student_App/EakPustak-Student/CLAUDE.md` ("Stale cached `classId` after promotion, fixed 2026-08-08") — the Student app cached `classId` at login and never refreshed it, so a promoted student's Timetable/Attendance/Library/Instructions kept showing their old class indefinitely. Fixed there. The Teacher app side (promoted students not visible while taking attendance) turned out to be a *different* bug, root-caused the same day via live on-device debugging — see `Teacher_App/EakPustak-Teacher/CLAUDE.md` ("Stale on-device Firestore cache served a student's pre-promotion class").

## Full-ecosystem correctness audit, 2026-08-08

User asked for "one more detailed survey of all three platforms" with standing authorization to fix whatever was found, without re-asking each time. Ran a parallel deep-audit agent per repo, then personally verified and fixed every confirmed finding against real code and, where relevant, real Firestore data — not taking any agent's claim at face value. Teacher app and Student app findings are documented in their own CLAUDE.md files (search each for "Full-ecosystem correctness audit"). Findings specific to this repo:

### 1. Live shadow fee-profile pipeline — new students silently bypassed the real Fees V2 system (highest severity, was actively broken)

`AddStudentDialog.jsx` (the standard "Add Student" flow) imported `createStudentFeeProfile`/`getFixedFeeStructures`/`getVariableFeeStructures` from the **old** `services/fees.service.js`, not `fees-v2`. That old path wrote to a `studentFeeYears` collection (plus old-shape `feePayments` docs) that the *actual* Fees V2 system (`fees-v2/services/feeProfile.service.js`, `Pages/fees/FeesV2.jsx`) never reads — every student added through the normal Admin UI with fee items selected got fee data silently orphaned in a collection nothing else looks at. `StudentProfile.jsx`'s "Fee Breakdown" card read via the same old path (`getActiveStudentFeeYear`), so it would show nothing for any student whose profile *was* correctly created via real Fees V2 — the two code paths could never see each other's data.

**Fixed** — rewired both files to the real pipeline (`@/fees-v2`: `createDraftProfile` → `updateDraftProfile` (variable fees) → `activateProfile`, and `getProfileByStudentAndYear` for display):
- `AddStudentDialog.jsx`: now resolves the real `activeYear` via `getActiveAcademicYear(schoolId)` (not the old `schools/{id}.feeAcademicYear` string field `useSchoolSettings` reads) and creates a proper draft→active profile after the student account is created. **UX change, not a bug**: `createDraftProfile()` always loads *every* active fixed fee structure for the student's class (that's how the real pipeline works — fixed fees aren't individually selectable, only variable add-ons are), so the fixed-fee checkboxes were replaced with a read-only "charged automatically" list. If no active academic year is configured, the student is still created but fee-profile creation is skipped with a clear error telling the admin to finish it manually in Fees V2.
- `StudentProfile.jsx`: `FeeBreakdown` now reads `feeLineItems` (the real profile's field) instead of the old shape's `items`/`totalPerCycle`, computing the per-cycle total client-side from the recurring line items.
- New composite indexes needed for the fees-v2 read paths this dialog now uses: `feeStructures: schoolId+classId+type+isActive` and `feeStructures: schoolId+type+isActive` (the existing `feeStructures` indexes only covered 2–3 fields, not the `isActive` filter `createDraftProfile()`'s own docstring already said was required).

**Not fixed / flagged only**: any student added via the *old* buggy path before this fix has fee data sitting in `studentFeeYears`/old-shape `feePayments`, invisible to Fees V2. Nobody has confirmed whether any real (non-test) student was actually enrolled that way — worth checking before assuming this is purely a caught-before-it-mattered bug.

### 2. Missing Storage rule for `/notices/**` — notice attachment uploads were failing 403

Same class of bug as the already-documented `/materials/**` gap. `notice.service.js`'s `uploadNoticeAttachment()` (called from `NoticeManagement.jsx`, a real, reachable admin screen) uploads to `notices/{schoolId}/{year}/{month}/...`, which `storage.rules` had no `match` block for. Added one (same shape as `/materials/**`/`/library/**`: public read, auth-required write) and deployed.

### 3. Reports module: composite indexes documented in code comments were never actually added

Both `reports/services/academicReports.service.js` and `financialReports.service.js` carry accurate docstrings listing the indexes their queries need, but `firestore.indexes.json` was missing nearly all of them — a much larger-scale version of the single missing-index bugs already found elsewhere this session. Added and deployed:
- `studentPromotions: schoolId+fromAcademicYear` (Graduation/Class Strength reports)
- `promotionBatches: schoolId+fromAcademicYear`, `schoolId+status`, `schoolId+promotionType` (Promotion report's optional filters)
- `feePayments: schoolId+academicYear+status+paymentDate desc` (Monthly Collection report)
- `feeInstallments: schoolId+academicYear` (Outstanding report)
- `feeRevisions: schoolId+academicYear+status` (Scholarship report)

Without these, every one of Academic Reports and most of Financial Reports would throw `FAILED_PRECONDITION` the first time an admin actually used them (they do surface the error via `ErrorState`/retry rather than silently failing, so this was "broken with a visible retry button," not silently broken).

## Firestore security rules — were wide open, now real, 2026-08-08

**Discovered while investigating the report indexes above**: the live Firestore security rules (checked via the Firebase Rules API, since no `firestore.rules` file existed in any of the three repos — rules had only ever been managed via console/API, same situation `storage.rules` was in before 2026-07-20) were a single blanket rule:
```
match /{document=**} { allow read, write: if request.auth != null; }
```
**Any authenticated account — student, teacher, or principal, at *any* school — could read or write *any* document belonging to *any other* school.** No role check, no school isolation, at all. This had been live since 2026-05-22 (the rules were never touched even as `study_materials`, `attendance`, `teachers_instructions`, `promotionBatches`, `studentPromotions`, and the whole fees-v2 schema were built afterward).

Wrote and deployed real rules (`firestore.rules`, now version-controlled and wired into `firebase.json`), using the `role`/`schoolId` custom claims every account carries (`principal`/`teacher`/`student` — confirmed via `identitytoolkit.googleapis.com/v1/.../accounts:query` that these are the only three roles that exist in this project; no separate super-admin role). **Every rule was verified against this live project with real signed-in tokens** (reset test accounts' passwords temporarily to sign in via `accounts:signInWithPassword`, decoded the JWTs, ran real `runQuery` requests) — not just reasoned about, because several assumptions that seemed obviously correct turned out to be wrong the first time they were tested. The two load-bearing discoveries, both learned by watching real requests fail:

1. **A `list` (query) rule checking `resource.data.FIELD == x` only works if the client's query *also* filters on that exact FIELD with equality.** If the query filters on a different field (e.g. the Teacher app's `students where classId==X` roster query, which never filters by schoolId), the rule fails outright for the *entire* query — not "filtered to zero results," a hard permission-denied — even though every document that would be returned genuinely satisfies the check. `get()` into a *different* collection sidesteps this (e.g. resolving a class's schoolId via `classes/{classId}`), but only when the field fed into the `get()` call is itself the field the query pins — `get()`'ing via a field that varies across the query's own result set (e.g. trying to indirect via `classId` on a query that only filters by `teacherId`) fails the exact same way. A `get()` back into the *same* collection currently being listed also fails, even by the candidate document's own ID.
2. **A single `list` rule cannot serve two real query shapes that filter on different fields** — neither a combined `A || B` expression nor separate `allow read` statements for the same match block work; Firestore appears to consider every `allow` rule for a match block together when determining whether a query is "provable," so an unprovable field reference anywhere poisons the whole evaluation, even for the half of the condition that would have been fine alone. `students` (Teacher app filters `classId==`, this repo's `getStudentsBySchool()` filters `schoolId==`), `studentPromotions` (schoolId+year vs. batchId-in-\[...]), `teachers_instructions` (senderId== vs. targetClass==), and `feeInstallments`/`feeRevisions` (schoolId+year vs. profileId==) all hit this. Where it did, the rule was **relaxed to role-only for that specific read path** (still requires a real `teacher`/`principal`/`student` claim — down from "any authenticated account" — just not school- or self-scoped for that one path) rather than either breaking the feature or leaving it fully open. Each instance is commented in `firestore.rules` explaining exactly which two shapes conflict and why. A real fix would mean changing the conflicting queries to consistently filter by schoolId (or restructuring the data), which is separate, follow-up work — not done as part of this pass.

**Also discovered**: principal accounts carry **no `schoolId` custom claim at all** (only `role: "principal"`) — only teacher/student accounts have both `role` and `schoolId`. Every rule using `mySchool()` silently denied every principal request until this was caught by live-testing a real principal token (not just a teacher/student one). Fixed via an `ownsSchool(schoolId)` helper that resolves a principal's school the only way it's actually knowable — checking `schools/{schoolId}.principalId == request.auth.uid` — folded into `sameSchool()`/`sameSchoolWrite()` so every existing rule picked it up automatically.

**What's precisely scoped** (same-school/self-only, verified live): `students` (get), `teachers`, `classes`, `subjects`, `teacherClassSubjects`, `teacherTimetables`, `classTimetables`, `timePeriods`, `academicYears`, `attendance` (path-based), `study_materials`, `notices`, `classResourceAssignments`, `schoolResourceAssignments`, `schoolCollectionAssignments`, `promotionBatches`, `feeStructures`, `studentFeeProfiles`, `schools`.

**What's role-only, not school/self-scoped, for the reason above** — flagged as a known, deliberate gap, not an oversight: `students` (list only — get is still precise), `studentPromotions`, `teachers_instructions` (read only — writes stay sender-scoped), `feeInstallments`, `feeRevisions`, `feePayments`, `paymentAllocations`, `exams` (also has no real data/filtering client-side yet — genuinely a placeholder feature).

**Deliberately unscoped by design, not a gap**: `libraryResources`/`libraryCollections` — no `schoolId` field exists on these at all; they're a shared catalog assigned to schools via `schoolResourceAssignments`/`classResourceAssignments` (which *are* school-scoped), matching how the Digital Library feature was documented as working from the start.

Everything not explicitly matched falls through to `allow read, write: if false` — deliberately deny-by-default rather than reverting to the old blanket-open rule for anything missed.

**Not done**: didn't attempt to fully resolve the role-only-relaxed collections above to precise school-scoping — that needs either query changes across two apps or schema changes, and was out of scope for a same-session fix given everything else in this pass. Also didn't audit `firestore.indexes.json` for whether every index still needed given the new rules' `get()`-heavy indirect checks (each `get()` inside a rule is a normal indexed document read, not a query, so shouldn't need new indexes — but wasn't separately verified).
