/**
 * USMS Test Data Seeder
 * ---------------------
 * Creates test teachers + students in your Firebase project.
 * Requires Node 18+ (uses built-in fetch).
 *
 * STEP 1 — Get your School ID:
 *   Open the app → DevTools (F12) → Application → Local Storage
 *   Copy the value of: principalSchoolId
 *
 * STEP 2 — Get Class IDs (for students):
 *   Open the app → DevTools (F12) → Console → paste:
 *     const snap = await fetch("https://firestore.googleapis.com/v1/projects/usms-v2/databases/(default)/documents/classes?key=AIzaSyCx1agej4pF5A2YOBfIBCDpBsXef45FkSk&pageSize=50");
 *     const d = await snap.json();
 *     console.log(d.documents?.map(x => ({ id: x.name.split("/").pop(), label: x.fields.grade?.stringValue + "-" + x.fields.section?.stringValue })));
 *   Copy the IDs you want to seed students into.
 *
 * STEP 3 — Fill in the CONFIG below, then run:
 *   node scripts/seed.js
 */

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SCHOOL_ID = ""; // ← paste principalSchoolId here

// List of class IDs to create students in (get from Step 2 above)
// Leave empty [] to skip student creation and only create teachers.
const CLASS_IDS = [
  // "abc123classId1",
  // "def456classId2",
];

// Optional: human-readable labels matching above IDs (used for classLabel field)
// Must be same order as CLASS_IDS. Leave empty to use "Class-X" placeholders.
const CLASS_LABELS = [
  // "8-A",
  // "8-B",
];

const TEACHERS_TO_CREATE    = 5;   // number of test teachers
const STUDENTS_PER_CLASS    = 8;   // students per class entry in CLASS_IDS
const DEFAULT_PASSWORD      = "Test@1234"; // all test accounts get this
// ────────────────────────────────────────────────────────────────────────────

const CREATE_STUDENT_URL = "https://createstudent-z4likafkwq-uc.a.run.app/";
const CREATE_TEACHER_URL = "https://createteacher-z4likafkwq-uc.a.run.app";

const ts = Date.now(); // unique suffix so re-runs don't collide on email

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || JSON.stringify(json));
  return json;
}

async function seedTeachers() {
  console.log(`\nCreating ${TEACHERS_TO_CREATE} teachers...`);
  for (let i = 1; i <= TEACHERS_TO_CREATE; i++) {
    const fullName   = `Test Teacher ${i}`;
    const email      = `teacher${i}.${ts}@test.usms`;
    const employeeId = `EMP${String(i).padStart(3, "0")}`;
    try {
      await post(CREATE_TEACHER_URL, {
        fullName, email, password: DEFAULT_PASSWORD,
        employeeId, schoolId: SCHOOL_ID,
      });
      console.log(`  ✓ ${fullName} (${email})`);
    } catch (err) {
      console.error(`  ✗ ${fullName}: ${err.message}`);
    }
  }
}

async function seedStudents() {
  if (CLASS_IDS.length === 0) {
    console.log("\nNo CLASS_IDS provided — skipping student creation.");
    console.log("  See Step 2 in the script header to get class IDs.");
    return;
  }

  const totalStudents = CLASS_IDS.length * STUDENTS_PER_CLASS;
  console.log(`\nCreating ${totalStudents} students across ${CLASS_IDS.length} class(es)...`);

  let roll = 1;
  for (let ci = 0; ci < CLASS_IDS.length; ci++) {
    const classId    = CLASS_IDS[ci];
    const classLabel = CLASS_LABELS[ci] || `Class-${ci + 1}`;

    for (let si = 1; si <= STUDENTS_PER_CLASS; si++) {
      const fullName = `Test Student ${classLabel} ${si}`;
      const email    = `student${roll}.${ts}@test.usms`;

      try {
        await post(CREATE_STUDENT_URL, {
          fullName, email, password: DEFAULT_PASSWORD,
          roll: String(roll), classId, classLabel, schoolId: SCHOOL_ID,
          parentName: `Parent of ${fullName}`,
          contact: `98765${String(roll).padStart(5, "0")}`,
        });
        console.log(`  ✓ [${classLabel}] Roll ${roll} — ${fullName}`);
        roll++;
      } catch (err) {
        console.error(`  ✗ Roll ${roll} ${fullName}: ${err.message}`);
        roll++;
      }
    }
  }
}

async function main() {
  if (!SCHOOL_ID) {
    console.error("ERROR: SCHOOL_ID is empty. Edit the CONFIG section at the top of seed.js");
    process.exit(1);
  }

  console.log("=== USMS Seed Script ===");
  console.log(`School: ${SCHOOL_ID}`);
  console.log(`Password for all accounts: ${DEFAULT_PASSWORD}`);

  await seedTeachers();
  await seedStudents();

  console.log("\nDone! Refresh the app to see the new records.");
  console.log(`All accounts use password: ${DEFAULT_PASSWORD}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
