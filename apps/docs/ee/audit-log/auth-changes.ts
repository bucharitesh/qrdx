import "server-only";

import { registerWorkspaceChangeRecorder } from "@repo/auth/workspace-audit";
import { recordWorkspaceChange } from "@/ee/audit-log/team-events";

// Importing this module hands packages/auth the app's recorder for team and
// workspace changes (packages/auth/workspace-audit.ts). It's imported by
// every module that serves or calls the organization plugin's endpoints:
// the /api/auth route (HTTP calls), actions/organizations.ts,
// lib/workspace-join.ts and lib/account/deletion-server.ts (auth.api calls
// from server actions, which may run where the /api/auth route never
// loaded). Registering twice is harmless: it's one slot on globalThis.
registerWorkspaceChangeRecorder(recordWorkspaceChange);

export { recordWorkspaceChange };
