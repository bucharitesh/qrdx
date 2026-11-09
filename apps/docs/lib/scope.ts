import "server-only";

import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { cache } from "react";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";
import {
  defaultWorkspace,
  findWorkspaceBySlug,
  shutsOut,
  TwoFactorRequiredError,
  type Workspace,
  WorkspaceNotFoundError,
  type WorkspaceRole,
  type WorkspaceUser,
} from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

export {
  TwoFactorRequiredError,
  WorkspaceNotFoundError,
} from "@/lib/workspaces";

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

/** The resolved workspace, and whether it shuts this person out. */
interface Resolved {
  active: ActiveWorkspace;
  /**
   * The workspace requires two-step verification and this person hasn't
   * turned it on (packages/auth/workspace-two-factor.ts).
   */
  shutOut: boolean;
}

const resolve = cache(
  async (requestHeaders: Headers | undefined): Promise<Resolved> => {
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
    //
    // A workspace that requires two-step verification shuts out members who
    // haven't turned it on: named in the URL, it's refused (the getters
    // below throw); as the default, the next one they can open is used.
    const slug = source.get(WORKSPACE_HEADER);
    let workspace: Workspace;
    let shutOut: boolean;
    if (slug) {
      const found = await findWorkspaceBySlug(person.id, slug);
      if (!found) throw new WorkspaceNotFoundError();
      workspace = found;
      shutOut = await shutsOut(person.id, found);
    } else {
      ({ workspace, shutOut } = await defaultWorkspace(
        person,
        sessionWorkspaceId,
      ));
    }

    return {
      active: {
        scope: {
          userId: person.id,
          organizationId: workspace.id,
          role: workspace.role,
        },
        workspace,
        user: person,
        sessionWorkspaceId,
      },
      shutOut,
    };
  },
);

// Only sessions are refused. API keys and OAuth tokens (app/api/v1, the MCP
// server) don't come through here and keep working for a member without
// two-step verification: two-step verification protects signing in, and a
// key or token is a credential of its own that no sign-in step would guard.
// A new one can't be made for the workspace without passing this guard (and
// "Confirm it's you"), a key's secret is never shown again, and the
// workspace's admins see and can revoke everyone's keys (Settings →
// Developers). Refusing them would quietly break the workspace's
// integrations instead.

/**
 * The signed-in user's workspace: the one in the URL (/dashboard/<slug>/...),
 * else their default (the session's, else their own). Throws
 * UnauthorizedError when signed out, WorkspaceNotFoundError for a slug they
 * can't open, and TwoFactorRequiredError for a workspace that requires
 * two-step verification they haven't turned on.
 */
export async function getActiveWorkspace(
  requestHeaders?: Headers,
): Promise<ActiveWorkspace> {
  const { active, shutOut } = await resolve(requestHeaders);
  if (shutOut) throw new TwoFactorRequiredError();
  return active;
}

export async function getActiveScope(
  requestHeaders?: Headers,
): Promise<ActiveScope> {
  return (await getActiveWorkspace(requestHeaders)).scope;
}

/**
 * Like getActiveWorkspace, but a workspace that requires two-step
 * verification the person hasn't turned on comes back with `shutOut` instead
 * of throwing. Only for telling them so (the [workspace] layout) and sending
 * them there (/dashboard): never read or change the workspace's contents
 * with it.
 */
export async function peekActiveWorkspace(
  requestHeaders?: Headers,
): Promise<ActiveWorkspace & { shutOut: boolean }> {
  const { active, shutOut } = await resolve(requestHeaders);
  return { ...active, shutOut };
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
