import type { BetterAuthPlugin } from "better-auth";
import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";

// Team and workspace changes for the workspace audit log
// (apps/app/ee/audit-log). Every change to a workspace's people and name
// goes through the organization plugin's endpoints, called over HTTP
// (/api/auth/organization/*) or by the app's server actions (auth.api.*).
// Both run the same hook pipeline, so this plugin's after-hooks see each
// change exactly once, whichever way it came, and only once it succeeded.
//
// This package has no audit log of its own: the app registers how a change
// is recorded (registerWorkspaceChangeRecorder, like the sign-in code
// sender in ./email-otp.ts). The recorder must not throw and returns at
// once; the app writes after the response.
//
// Who made the change is the request's session (the organization plugin
// passes the person changed, not the person changing). A server-side call
// without a session (the join link's addMember) acts as the person added.

type Role = string;

export type WorkspaceChange =
  | {
      kind: "invited";
      organizationId: string;
      actorUserId: string | null;
      invitation: { id: string; email: string; role: Role };
    }
  | {
      kind: "invitation_cancelled";
      organizationId: string;
      actorUserId: string | null;
      invitation: { id: string; email: string; role: Role };
    }
  | {
      /**
       * accept-invitation, add-member (server-only: the join link), or a
       * single sign-on that adds the person (./ee/sso.ts)
       */
      kind: "joined";
      organizationId: string;
      userId: string;
      role: Role;
      via: "invitation" | "added" | "sso";
    }
  | {
      kind: "role_changed";
      organizationId: string;
      actorUserId: string | null;
      userId: string;
      from: Role | null;
      to: Role;
    }
  | {
      kind: "removed";
      organizationId: string;
      actorUserId: string | null;
      userId: string;
      role: Role;
    }
  | { kind: "left"; organizationId: string; userId: string; role: Role }
  | {
      kind: "updated";
      organizationId: string;
      actorUserId: string | null;
      before: { name: string; slug: string } | null;
      after: { name: string; slug: string };
    }
  | { kind: "deleted"; organizationId: string; actorUserId: string | null };

export type WorkspaceChangeRecorder = (change: WorkspaceChange) => void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the recorder the app registered.
const RECORDER = Symbol.for("@repo/auth/workspace-change-recorder");
type RecorderSlot = Record<symbol, WorkspaceChangeRecorder | undefined>;

export function registerWorkspaceChangeRecorder(
  recorder: WorkspaceChangeRecorder
): void {
  (globalThis as unknown as RecorderSlot)[RECORDER] = recorder;
}

let warnedUnregistered = false;

/**
 * Hands a change made outside the organization plugin's endpoints (a member
 * added by single sign-on) to the app's recorder. Never throws.
 */
export function emitWorkspaceChange(change: WorkspaceChange): void {
  emit(change);
}

// No ids, emails or names in these logs.
function emit(change: WorkspaceChange): void {
  const recorder = (globalThis as unknown as RecorderSlot)[RECORDER];
  if (!recorder) {
    if (!warnedUnregistered) {
      warnedUnregistered = true;
      console.error(
        JSON.stringify({
          event: "auth.workspace_change",
          outcome: "no_recorder",
          kind: change.kind,
        })
      );
    }
    return;
  }
  try {
    recorder(change);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "auth.workspace_change",
        outcome: "failed",
        kind: change.kind,
        error: error instanceof Error ? error.name : "unknown",
      })
    );
  }
}

const PATHS = {
  invite: "/organization/invite-member",
  cancel: "/organization/cancel-invitation",
  accept: "/organization/accept-invitation",
  add: "/organization/add-member",
  role: "/organization/update-member-role",
  remove: "/organization/remove-member",
  leave: "/organization/leave",
  update: "/organization/update",
  delete: "/organization/delete",
} as const;

const WATCHED = new Set<string>(Object.values(PATHS));

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type Row = Record<string, unknown>;

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const asRow = (value: unknown): Row | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;

/**
 * What a change replaces, read before it runs: a member's role, a
 * workspace's name and URL. Keyed by the call's body, which the before- and
 * after-hooks of one call share.
 */
const previous = new WeakMap<object, Row>();

async function findOne(
  ctx: HookContext,
  model: "member" | "organization",
  id: string
): Promise<Row | null> {
  const row = await ctx.context.adapter.findOne<Row>({
    model,
    where: [{ field: "id", value: id }],
  });
  return row ?? null;
}

async function actorId(ctx: HookContext): Promise<string | null> {
  const session = await getSessionFromCtx(ctx).catch(() => null);
  return session?.user?.id ?? null;
}

async function snapshot(ctx: HookContext): Promise<void> {
  const body = asRow(ctx.body);
  if (!body) return;
  if (ctx.path === PATHS.role) {
    const memberId = str(body.memberId);
    const member = memberId ? await findOne(ctx, "member", memberId) : null;
    if (member) previous.set(body, member);
    return;
  }
  // /organization/update: the body's workspace, else the session's.
  let organizationId = str(body.organizationId);
  if (!organizationId) {
    const session = await getSessionFromCtx(ctx).catch(() => null);
    organizationId = str(
      (session?.session as Row | undefined)?.activeOrganizationId
    );
  }
  const organization = organizationId
    ? await findOne(ctx, "organization", organizationId)
    : null;
  if (organization) previous.set(body, organization);
}

/** The change a successful call made, or null when it isn't one. */
async function changeOf(ctx: HookContext): Promise<WorkspaceChange | null> {
  const returned = asRow(ctx.context.returned);
  if (!returned) return null;
  switch (ctx.path) {
    case PATHS.invite:
    case PATHS.cancel: {
      const organizationId = str(returned.organizationId);
      const id = str(returned.id);
      if (!(organizationId && id)) return null;
      return {
        kind: ctx.path === PATHS.invite ? "invited" : "invitation_cancelled",
        organizationId,
        actorUserId: await actorId(ctx),
        invitation: {
          id,
          email: str(returned.email) ?? "",
          role: str(returned.role) ?? "member",
        },
      };
    }
    case PATHS.accept:
    case PATHS.add: {
      const member = asRow(returned.member) ?? returned;
      const organizationId = str(member.organizationId);
      const userId = str(member.userId);
      if (!(organizationId && userId)) return null;
      return {
        kind: "joined",
        organizationId,
        userId,
        role: str(member.role) ?? "member",
        via: ctx.path === PATHS.accept ? "invitation" : "added",
      };
    }
    case PATHS.role: {
      const organizationId = str(returned.organizationId);
      const userId = str(returned.userId);
      if (!(organizationId && userId)) return null;
      const body = asRow(ctx.body);
      const before = body ? previous.get(body) : undefined;
      return {
        kind: "role_changed",
        organizationId,
        actorUserId: await actorId(ctx),
        userId,
        from: str(before?.role),
        to: str(returned.role) ?? "member",
      };
    }
    case PATHS.remove:
    case PATHS.leave: {
      const member = asRow(returned.member) ?? returned;
      const organizationId = str(member.organizationId);
      const userId = str(member.userId);
      if (!(organizationId && userId)) return null;
      const role = str(member.role) ?? "member";
      return ctx.path === PATHS.leave
        ? { kind: "left", organizationId, userId, role }
        : {
            kind: "removed",
            organizationId,
            actorUserId: await actorId(ctx),
            userId,
            role,
          };
    }
    case PATHS.update: {
      const organizationId = str(returned.id);
      if (!organizationId) return null;
      const body = asRow(ctx.body);
      const before = body ? previous.get(body) : undefined;
      const after = {
        name: String(returned.name ?? ""),
        slug: String(returned.slug ?? ""),
      };
      // Only a new name or URL is a change here: settings (metadata) and
      // the logo are recorded, if at all, by the app code that sets them.
      if (before && before.name === after.name && before.slug === after.slug) {
        return null;
      }
      return {
        kind: "updated",
        organizationId,
        actorUserId: await actorId(ctx),
        before:
          before && str(before.name) !== null
            ? { name: String(before.name), slug: String(before.slug ?? "") }
            : null,
        after,
      };
    }
    case PATHS.delete: {
      const organizationId = str(returned.id);
      if (!organizationId) return null;
      return {
        kind: "deleted",
        organizationId,
        actorUserId: await actorId(ctx),
      };
    }
    default:
      return null;
  }
}

export function workspaceAudit() {
  return {
    id: "qrdx-workspace-audit",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path === PATHS.role || ctx.path === PATHS.update,
          handler: createAuthMiddleware(async (ctx) => {
            try {
              await snapshot(ctx);
            } catch {
              // The change still runs; its row lacks the old value.
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => WATCHED.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) return;
            try {
              const change = await changeOf(ctx);
              if (change) emit(change);
            } catch (error) {
              console.error(
                JSON.stringify({
                  event: "auth.workspace_change",
                  outcome: "failed",
                  path: ctx.path,
                  error: error instanceof Error ? error.name : "unknown",
                })
              );
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
