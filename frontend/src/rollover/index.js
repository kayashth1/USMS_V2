/**
 * Academic Year Rollover module — Public API
 *
 * Barrel export for the Rollover module.
 * Import everything from here; never import directly from sub-paths.
 *
 * Example:
 *   import { buildRolloverPlan } from "@/rollover";
 */

// ─── Rollover engine (pure — no Firestore) ────────────────────────────────────
export {
  buildRolloverPlan,
  buildStudentUpdate,
  buildProfileActivation,
  buildProfileClosure,
  buildGraduationUpdate,
} from "./rolloverEngine.js";

// ─── Rollover execution (Firestore persistence) ───────────────────────────────
export {
  executeRollover,
  updateAcademicYears,
  executeStudentUpdate,
  executeGraduationUpdate,
} from "./rolloverExecution.service.js";
