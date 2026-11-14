import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import {
  fieldHoldsRole,
  INVALID_ROLE,
  isWorkspaceRoleName,
  rolesInField,
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
//
// The gate also keeps the owner and billing roles, which decide who pays, to
// owners (apps/app/lib/permissions.ts canAssignRole): the plugin only
// reserves the owner role, so over HTTP an admin could otherwise give or
// take away billing, or remove a billing member. The app's actions check
// this first, with their own words.

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

const INVITE_PATH = "/organization/invite-member";
const UPDATE_ROLE_PATH = "/organization/update-member-role";
const REMOVE_PATH = "/organization/remove-member";

/** The endpoints that take a role in their body. */
export const ROLE_REQUEST_PATHS: readonly string[] = [
  INVITE_PATH,
  UPDATE_ROLE_PATH,
];

/** The code a role change only an owner may make carries. */
export const OWNERS_ONLY_ROLE = "OWNERS_ONLY_ROLE";

/** Roles only owners give or take away: they decide who pays. */
const OWNERS_ONLY: readonly WorkspaceRoleName[] = ["owner", "billing"];

/**
 * Whether giving `role` (to someone who held `previous`, or to a new
 * invitee when null; removing them when `role` is null) is a change only an
 * owner may make.
 */
export function ownersOnlyChange(
  role: string | null,
  previous: string | null
): boolean {
  return [role, previous].some((field) =>
    rolesInField(field).some((name) => OWNERS_ONLY.includes(name))
  );
}

function ownersOnlyError(): APIError {
  return new APIError("FORBIDDEN", {
    code: OWNERS_ONLY_ROLE,
    message:
      "Only owners can give or take away the owner and billing roles, since they decide who pays for the workspace.",
  });
}

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

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Refuses giving, taking away or removing owner or billing by someone who
 * isn't an owner of the workspace. Anything it can't resolve (signed out,
 * not a member, no such member) is left to the endpoint, which refuses it.
 */
async function checkOwnersOnly(ctx: HookContext): Promise<void> {
  const found = await getSessionFromCtx(ctx);
  if (!found) return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const organizationId =
    text(body.organizationId) ?? found.session.activeOrganizationId ?? null;
  if (!organizationId) return;
  const member = (where: { field: string; value: string }[]) =>
    ctx.context.adapter.findOne<{ role: string; organizationId: string }>({
      model: "member",
      where,
    });
  const role = ctx.path === REMOVE_PATH ? null : text(body.role);
  let previous: string | null = null;
  if (ctx.path !== INVITE_PATH) {
    // The member changed or removed, by id (or, removing, by email).
    const ref = text(
      ctx.path === REMOVE_PATH ? body.memberIdOrEmail : body.memberId
    );
    if (!ref) return;
    let target: { role: string; organizationId: string } | null;
    if (ref.includes("@")) {
      const person = await ctx.context.internalAdapter.findUserByEmail(ref);
      if (!person) return;
      target = await member([
        { field: "organizationId", value: organizationId },
        { field: "userId", value: person.user.id },
      ]);
    } else {
      target = await member([{ field: "id", value: ref }]);
    }
    if (!target || target.organizationId !== organizationId) return;
    previous = target.role;
  }
  if (!ownersOnlyChange(role, previous)) return;
  const actor = await member([
    { field: "organizationId", value: organizationId },
    { field: "userId", value: found.user.id },
  ]);
  if (!actor) return;
  if (!fieldHoldsRole(actor.role, "owner")) throw ownersOnlyError();
}

export const workspaceRoleGate = () =>
  ({
    id: "qrdx-workspace-roles",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            [...ROLE_REQUEST_PATHS, REMOVE_PATH].includes(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            checkRoleRequest(ctx.path, ctx.body);
            await checkOwnersOnly(ctx);
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
