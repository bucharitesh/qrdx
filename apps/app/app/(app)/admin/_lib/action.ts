import "server-only";

import { createAdminActionRunner } from "./action-runner";
import { assertAdmin } from "./guard";

export {
  type AdminActionOutcome,
  type AdminActionResult,
  type AdminAuditRecord,
  adminError,
} from "./action-runner";

/**
 * Every admin server action in this app runs through here: the shared
 * runner (./action-runner.ts) with this app's admin check, which reads the
 * session.
 */
export const runAdminAction = createAdminActionRunner({ assertAdmin });
