import "server-only";

import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { cache } from "react";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";
import {
  defaultWorkspace,
  findWorkspaceBySlug,
  type Workspace,
  WorkspaceNotFoundError,
  type WorkspaceRole,
  type WorkspaceUser,
} from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

export { WorkspaceNotFoundError } from "@/lib/workspaces";

export type ScopeRole = WorkspaceRole;

export interface ActiveScope {
  userId: string;
  /** The workspace (a Better Auth organization); every row belongs to one */
  organizationId: string;
  /** The user's role in it */
  role: ScopeRole;
}

export interface ActiveWorkspace {
  scope: ActiveScope;
  workspace: Workspace;
  /** The signed-in person */
  user: WorkspaceUser;
  /** The session's active workspace (null when none is set yet) */
  sessionWorkspaceId: string | null;
}

const resolve = cache(
  async (requestHeaders: Headers | undefined): Promise<ActiveWorkspace> => {
    const source = requestHeaders ?? (await headers());
    const session = await auth.api.getSession({ headers: source });
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    const person = {
      id: session.user.id as string,
      name: session.user.name as string | null,
      email: session.user.email as string,
    };
    const sessionWorkspaceId: string | null =
      session.session?.activeOrganizationId ?? null;

    // Pages under /dashboard/<slug> (and the server actions they post) name
    // their workspace; proxy.ts puts it in this header. A slug the user
    // isn't a member of is a 404, never a quiet fallback to another
    // workspace, so nothing is ever created in the wrong one.
    const slug = source.get(WORKSPACE_HEADER);
    const workspace = slug
      ? await findWorkspaceBySlug(person.id, slug)
      : await defaultWorkspace(person, sessionWorkspaceId);
    if (!workspace) throw new WorkspaceNotFoundError();

    return {
      scope: {
        userId: person.id,
        organizationId: workspace.id,
        role: workspace.role,
      },
      workspace,
      user: person,
      sessionWorkspaceId,
    };
  },
);

/**
 * The signed-in user's workspace: the one in the URL (/dashboard/<slug>/...),
 * else their default (the session's, else their own). Throws
 * UnauthorizedError when signed out and WorkspaceNotFoundError for a slug
 * they can't open.
 */
export async function getActiveWorkspace(
  requestHeaders?: Headers,
): Promise<ActiveWorkspace> {
  return resolve(requestHeaders);
}

export async function getActiveScope(
  requestHeaders?: Headers,
): Promise<ActiveScope> {
  return (await resolve(requestHeaders)).scope;
}

/**
 * The slug of the workspace whose page is rendering (from its URL, via
 * proxy.ts), for building links; null outside /dashboard/<slug>. The
 * [workspace] layout has already checked membership.
 */
export async function requestWorkspaceSlug(): Promise<string | null> {
  return (await headers()).get(WORKSPACE_HEADER);
}

/** True when a row (qr_code, brand_kit, custom_domain, ...) belongs to the scope. */
export function isInScope(
  scope: Pick<ActiveScope, "organizationId">,
  row: { organizationId: string | null },
): boolean {
  return row.organizationId === scope.organizationId;
}
