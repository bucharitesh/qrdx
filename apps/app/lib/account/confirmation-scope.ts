import "server-only";

import type { ActiveScope } from "@/lib/scope";
import { UnauthorizedError } from "@/types/errors";
import type { ConfirmationRequired } from "./confirmation";
import {
  currentSession,
  requireRecentConfirmation,
} from "./confirmation-server";

/**
 * "Confirm it's you" for actions that know the person from the open
 * workspace (API keys, OAuth apps, workspace people): null when this session
 * confirmed in the last 10 minutes, else the CONFIRMATION_REQUIRED result the
 * action returns so the client asks. Throws UnauthorizedError when the
 * session isn't the workspace scope's person.
 *
 * Call it after the action's own permission checks, so someone the action
 * refuses anyway isn't asked first.
 */
export async function confirmationNeededFor(
  scope: Pick<ActiveScope, "userId">,
): Promise<ConfirmationRequired | null> {
  const session = await currentSession();
  if (!session || session.userId !== scope.userId) {
    throw new UnauthorizedError();
  }
  return requireRecentConfirmation(session);
}
