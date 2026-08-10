# USMS — Timetable Integration Guide
## For Student App & Teacher App Developers

---

## How the Timetable is Built (Admin Side)

The Principal uses the admin panel to build a **class-wise weekly timetable**.

Setup prerequisites (all done in admin Settings before timetable is built):
- **Time Periods** — school's daily slot schedule (e.g. Period 1: 09:00–09:45, Period 2: 09:45–10:30 …)
- **Teacher Assignments** — which teacher teaches which subject in which class

When the Principal saves a timetable for a class, **two Firestore documents are written atomically** in one batch:
1. `classTimetables/{classDocId}` — the full week grid for that class
2. `teacherTimetables/{teacherId}` — auto-updated for every teacher appearing in that class's grid

So both documents are always in sync. You never need to compute one from the other.

---

## Firestore Collections

### 1. `timePeriods`
Defines the school's daily time slots. Fetch once and cache.

**Query:**
```
collection("timePeriods")
  .where("schoolId", "==", student.schoolId)   // or teacher.schoolId
```

**Document fields:**
```
id        String   (Firestore auto-ID)
schoolId  String
name      String   // e.g. "Period 1", "Lunch Break"
from      String   // "09:00"
to        String   // "09:45"
```

---

### 2. `classTimetables`
One document per class. This is what the **Student App** uses.

**Document ID:** `classDocId` (the Firestore document ID of the class — not the display label like "8A")

**Fetch:**
```
doc("classTimetables", student.classDocId)
```

**Document structure:**
```json
{
  "classDocId": "abc123",
  "schoolId":   "school456",
  "week": {
    "monday": {
      "periodId_1": {
        "subjectId":   "sub_001",
        "subjectName": "Mathematics",
        "teacherId":   "uid_teacher_1",
        "teacherName": "Mr. Ramesh Kumar"
      },
      "periodId_2": {
        "subjectId":   "sub_002",
        "subjectName": "English",
        "teacherId":   "uid_teacher_2",
        "teacherName": "Ms. Priya Singh"
      },
      "periodId_3": null
    },
    "tuesday":    { ... },
    "wednesday":  { ... },
    "thursday":   { ... },
    "friday":     { ... },
    "saturday":   { ... }
  }
}
```

**Notes:**
- `week[day]` is a **map keyed by periodId** (not an array)
- A slot value of `null` means that period is free/empty
- `periodId` matches the `id` field from the `timePeriods` collection
- Days always present: `monday tuesday wednesday thursday friday saturday`

---

### 3. `teacherTimetables`
One document per teacher. This is what the **Teacher App** uses.

**Document ID:** `teacherId` (Firebase Auth UID of the teacher)

**Fetch:**
```
doc("teacherTimetables", teacher.uid)
```

**Document structure:**
```json
{
  "teacherId": "uid_teacher_1",
  "schoolId":  "school456",
  "byClass": {
    "classDocId_8A": {
      "className": "8-A",
      "monday":    [{ "periodId": "periodId_1", "subjectId": "sub_001", "subjectName": "Mathematics" }],
      "tuesday":   [],
      "wednesday": [{ "periodId": "periodId_3", "subjectId": "sub_001", "subjectName": "Mathematics" }],
      "thursday":  [],
      "friday":    [{ "periodId": "periodId_2", "subjectId": "sub_001", "subjectName": "Mathematics" }],
      "saturday":  []
    },
    "classDocId_9B": {
      "className": "9-B",
      "monday":    [],
      "tuesday":   [{ "periodId": "periodId_1", "subjectId": "sub_001", "subjectName": "Mathematics" }],
      ...
    }
  }
}
```

**Notes:**
- `byClass` is a map of classDocId → per-class schedule
- Each day inside `byClass[classId]` is an **array** of slot objects (unlike class timetable which is a map)
- Each slot has `periodId`, `subjectId`, `subjectName` — no teacherId here (it's the teacher's own doc)
- `className` is a display label like `"8-A"` for showing in the teacher's UI

---

## Student App — Implementation

### What to show
A grid or list of the student's **weekly class schedule** with period times, subject name, and teacher name.

### Fetch flow

```dart
// Step 1 — fetch time periods for this school
final periodsSnap = await firestore
    .collection('timePeriods')
    .where('schoolId', isEqualTo: student.schoolId)
    .get();

final periods = periodsSnap.docs.map((d) => {
  'id':   d.id,
  'name': d['name'],
  'from': d['from'],
  'to':   d['to'],
}).toList();

// Sort periods by start time
periods.sort((a, b) => a['from'].compareTo(b['from']));

// Step 2 — fetch this class's timetable
final ttSnap = await firestore
    .doc('classTimetables/${student.classDocId}')
    .get();

if (!ttSnap.exists) {
  // No timetable set yet — show empty state
  return;
}

final week = ttSnap.data()?['week'] as Map<String, dynamic>? ?? {};
```

### Rendering a day's schedule

```dart
// E.g. show today's schedule
final today = 'monday'; // derive from DateTime.now().weekday
final daySlots = week[today] as Map<String, dynamic>? ?? {};

for (final period in periods) {
  final slot = daySlots[period['id']]; // null = free period
  if (slot == null) {
    // Free / no class
  } else {
    final subjectName = slot['subjectName'];
    final teacherName = slot['teacherName'];
    // Show: period.name, period.from–period.to, subjectName, teacherName
  }
}
```

---

## Teacher App — Implementation

### What to show
The teacher's **full weekly schedule across all their classes** — which class, which subject, at which period.

### Fetch flow

```dart
// Single document fetch — no query needed
final ttSnap = await firestore
    .doc('teacherTimetables/${teacher.uid}')
    .get();

if (!ttSnap.exists) {
  // Teacher has no timetable assigned yet
  return;
}

final byClass = ttSnap.data()?['byClass'] as Map<String, dynamic>? ?? {};
```

### Rendering today's schedule

```dart
final today = 'monday'; // from DateTime.now().weekday

// Collect all slots across all classes for today
final List<Map> todaySlots = [];

for (final entry in byClass.entries) {
  final classDocId = entry.key;
  final classData  = entry.value as Map<String, dynamic>;
  final className  = classData['className'] as String? ?? classDocId;
  final daySlots   = classData[today] as List<dynamic>? ?? [];

  for (final slot in daySlots) {
    todaySlots.add({
      'periodId':    slot['periodId'],
      'subjectName': slot['subjectName'],
      'className':   className,
      'classDocId':  classDocId,
    });
  }
}

// Sort by period time — look up from timePeriods using periodId
todaySlots.sort((a, b) {
  final aTime = periods.firstWhere((p) => p['id'] == a['periodId'])['from'];
  final bTime = periods.firstWhere((p) => p['id'] == b['periodId'])['from'];
  return aTime.compareTo(bTime);
});

// Show: period time, subjectName, className
```

---

## Getting Today's Day Name

```dart
String getTodayKey() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days[DateTime.now().weekday - 1]; // weekday: 1=Mon … 7=Sun
}
```

---

## Quick Reference

| Need | Collection | Doc ID |
|---|---|---|
| School's time slots | `timePeriods` | (query by schoolId) |
| Student's class schedule | `classTimetables` | `student.classDocId` |
| Teacher's full schedule | `teacherTimetables` | `teacher.uid` |

**No index required** — all fetches are single-document `getDoc` calls or a simple single-field `where` query on `timePeriods`.
