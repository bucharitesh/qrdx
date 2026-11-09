import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  INVALID_ROLE,
  isWorkspaceRoleName,
  type WorkspaceRoleName,
} from "./workspace-role-rules";

// Only exact role names get written (./workspace-role-rules.ts says why).
// Two layers, both on every call, over HTTP and through auth.api:
//
// - workspaceRoleGate() reads the role a request sends to invite someone or
//   change a role, before the plugin trims it or splits a list;
// - workspaceRoleHooks run inside the plugin on what it's about to store:
//   an invitation, a member added from a join link, a role change. Accepting
//   an invitation checks the stored role too, so an invitation saved before
//   this check can't make anyone a member.
//
// The app's own server actions only ever send one of the five names, so
// neither layer changes anything they do.

const REFUSALS = {
  write: "That isn't one of the workspace's roles.",
  accept:
    "This invitation can't be used. Ask the workspace to invite you again.",
  join: "This join link can't be used. Ask the workspace for a new one.",
} as const;

export function invalidRoleError(
  kind: keyof typeof REFUSALS = "write"
): APIError {
  return new APIError("BAD_REQUEST", {
    code: INVALID_ROLE,
    message: REFUSALS[kind],
  });
}

/** Throws INVALID_ROLE unless `role` is exactly one role name, as a string. */
export function assertWorkspaceRole(
  role: unknown,
  kind: keyof typeof REFUSALS = "write"
): asserts role is WorkspaceRoleName {
  if (!isWorkspaceRoleName(role)) throw invalidRoleError(kind);
}

/** The endpoints that take a role in their body. */
export const ROLE_REQUEST_PATHS: readonly string[] = [
  "/organization/invite-member",
  "/organization/update-member-role",
];

export function checkRoleRequest(path: string, body: unknown): void {
  if (!ROLE_REQUEST_PATHS.includes(path)) return;
  const role =
    body && typeof body === "object"
      ? (body as { role?: unknown }).role
      : undefined;
  assertWorkspaceRole(role);
}

/** The organization plugin's hooks for what it stores (see ./server.ts). */
export const workspaceRoleHooks = {
  beforeCreateInvitation: ({
    invitation,
  }: {
    invitation: { role: string };
  }): Promise<void> => {
    assertWorkspaceRole(invitation.role);
    return Promise.resolve();
  },
  beforeAcceptInvitation: ({
    invitation,
  }: {
    invitation: { role: string };
  }): Promise<void> => {
    assertWorkspaceRole(invitation.role, "accept");
    return Promise.resolve();
  },
  beforeAddMember: ({
    member,
  }: {
    member: { role: string };
  }): Promise<void> => {
    assertWorkspaceRole(member.role, "join");
    return Promise.resolve();
  },
  beforeUpdateMemberRole: ({ newRole }: { newRole: string }): Promise<void> => {
    assertWorkspaceRole(newRole);
    return Promise.resolve();
  },
};

export const workspaceRoleGate = () =>
  ({
    id: "qrdx-workspace-roles",
    hooks: {
      before: [
        {
          matcher: (ctx) => ROLE_REQUEST_PATHS.includes(ctx.path ?? ""),
          handler: createAuthMiddleware((ctx) => {
            checkRoleRequest(ctx.path, ctx.body);
            return Promise.resolve();
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
