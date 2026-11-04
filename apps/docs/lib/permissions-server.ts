import "server-only";

import { HttpError } from "@/lib/error-response";
import {
  can,
  forbiddenMessage,
  type WorkspaceAction,
  type WorkspaceRole,
} from "@/lib/permissions";
import { type ActiveScope, getActiveScope } from "@/lib/scope";

// The server side of lib/permissions.ts: every action and API route that
// writes calls assertCan (or requireScope) before it touches anything.

/** 403 FORBIDDEN; server actions surface `code` and `message` as they are. */
export class ForbiddenError extends HttpError {
  readonly action: WorkspaceAction;

  constructor(role: WorkspaceRole | null | undefined, action: WorkspaceAction) {
    super(403, "FORBIDDEN", forbiddenMessage(role, action));
    this.name = "ForbiddenError";
    this.action = action;
  }
}

/** Throws ForbiddenError unless the scope's role may do `action`. */
export function assertCan(
  scope: Pick<ActiveScope, "role">,
  action: WorkspaceAction,
): void {
  if (!can(scope.role, action)) throw new ForbiddenError(scope.role, action);
}

/** The signed-in workspace scope, once its role may do `action`. */
export async function requireScope(
  action: WorkspaceAction,
  requestHeaders?: Headers,
): Promise<ActiveScope> {
  const scope = await getActiveScope(requestHeaders);
  assertCan(scope, action);
  return scope;
}
