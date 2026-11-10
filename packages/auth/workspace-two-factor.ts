import { database } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { workspacePlanTier } from "./plan";
import {
  organizationPathActsOnWorkspace,
  TWO_FACTOR_REQUIRED,
  TWO_FACTOR_REQUIRED_MESSAGE,
  twoFactorRequiredIn,
} from "./workspace-two-factor-rules";

// "Require two-step verification" on the server (./workspace-two-factor-rules.ts
// has the rules). The app asks lacksRequiredTwoFactor before it opens a
// workspace for a session (apps/docs/lib/scope.ts). Better Auth's own
// workspace endpoints are open over HTTP too, where a session alone could
// read or manage the workspace; the plugin below refuses those requests the
// same way.
//
// The requirement applies while the setting is on and the workspace is on
// Business: the best plan among its owners and billing members, as for SSO
// (./plan.ts; apps/docs/lib/plans.ts `requireTwoFactor` says the same).

async function workspaceMetadata(organizationId: string): Promise<unknown> {
  const row = await database.query.organization.findFirst({
    columns: { metadata: true },
    where: (table, { eq }) => eq(table.id, organizationId),
  });
  return row?.metadata ?? null;
}

/**
 * Whether two-step verification is on, read from the database (never the
 * session's copy, which a cookie cache could serve stale).
 */
export async function twoFactorOnFor(userId: string): Promise<boolean> {
  const row = await database.query.user.findFirst({
    columns: { twoFactorEnabled: true },
    where: (table, { eq }) => eq(table.id, userId),
  });
  return row?.twoFactorEnabled === true;
}

/**
 * Whether the workspace requires two-step verification right now: its
 * setting is on and it's on Business. `setting` is the setting when the
 * caller has already read the workspace's metadata.
 */
export async function workspaceRequiresTwoFactor(
  organizationId: string,
  setting?: boolean
): Promise<boolean> {
  const on =
    setting ?? twoFactorRequiredIn(await workspaceMetadata(organizationId));
  if (!on) return false;
  return (await workspacePlanTier(organizationId)) === "business";
}

/**
 * True when the workspace requires two-step verification and `userId` hasn't
 * turned it on: they can't open the workspace or act in it with a session.
 * Cheapest first: one read of the setting, which is off for most
 * workspaces; then the person's switch; then the plan.
 */
export async function lacksRequiredTwoFactor(
  userId: string,
  organizationId: string,
  setting?: boolean
): Promise<boolean> {
  const on =
    setting ?? twoFactorRequiredIn(await workspaceMetadata(organizationId));
  if (!on) return false;
  if (await twoFactorOnFor(userId)) return false;
  return workspaceRequiresTwoFactor(organizationId, true);
}

export function twoFactorRequiredError(): APIError {
  return new APIError("FORBIDDEN", {
    code: TWO_FACTOR_REQUIRED,
    message: TWO_FACTOR_REQUIRED_MESSAGE,
  });
}

/** Workspace settings live in its metadata and change only through the app. */
export const WORKSPACE_SETTINGS_IN_APP = "WORKSPACE_SETTINGS_IN_APP";

function workspaceSettingsInAppError(): APIError {
  return new APIError("FORBIDDEN", {
    code: WORKSPACE_SETTINGS_IN_APP,
    message: "Change workspace settings in the workspace's Settings in QRdx.",
  });
}

interface SignedIn {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
}

export interface GateLookups {
  /** The person is a member the workspace shuts out (lacksRequiredTwoFactor). */
  shutOut: (userId: string, organizationId: string) => Promise<boolean>;
  organizationIdForSlug: (slug: string) => Promise<string | null>;
  organizationIdForInvitation: (invitationId: string) => Promise<string | null>;
}

const defaultLookups: GateLookups = {
  shutOut: async (userId, organizationId) => {
    if (!(await lacksRequiredTwoFactor(userId, organizationId))) return false;
    // Only members are told: anyone else gets the endpoint's own refusal,
    // so a workspace's id never reveals its setting.
    const member = await database.query.member.findFirst({
      columns: { id: true },
      where: (table, { and, eq }) =>
        and(eq(table.organizationId, organizationId), eq(table.userId, userId)),
    });
    return Boolean(member);
  },
  organizationIdForSlug: async (slug) => {
    const row = await database.query.organization.findFirst({
      columns: { id: true },
      where: (table, { eq }) => eq(table.slug, slug),
    });
    return row?.id ?? null;
  },
  organizationIdForInvitation: async (invitationId) => {
    const row = await database.query.invitation.findFirst({
      columns: { organizationId: true },
      where: (table, { eq }) => eq(table.id, invitationId),
    });
    return row?.organizationId ?? null;
  },
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * The workspaces a request to a Better Auth workspace endpoint acts on: the
 * ones it names (by id, slug or invitation), else the session's, which is
 * what the endpoints fall back to.
 */
export async function targetWorkspaces(
  request: { body: unknown; query: unknown },
  activeOrganizationId: string | null | undefined,
  lookups: Pick<
    GateLookups,
    "organizationIdForSlug" | "organizationIdForInvitation"
  > = defaultLookups
): Promise<string[]> {
  const ids = new Set<string>();
  let named = false;
  const body = record(request.body);
  for (const source of [body, record(request.query)]) {
    const id = text(source.organizationId);
    if (id) {
      named = true;
      ids.add(id);
    }
    const slug = text(source.organizationSlug);
    if (slug) {
      named = true;
      const found = await lookups.organizationIdForSlug(slug);
      if (found) ids.add(found);
    }
  }
  const invitationId = text(body.invitationId);
  if (invitationId) {
    named = true;
    const found = await lookups.organizationIdForInvitation(invitationId);
    if (found) ids.add(found);
  }
  if (!named && activeOrganizationId) ids.add(activeOrganizationId);
  return [...ids];
}

/**
 * Settings that change only through the app's own actions, which check them
 * first: metadata (this requirement among the settings in it) and the logo
 * (apps/docs/actions/workspace-logo.ts accepts only an upload of this
 * workspace or a public https image URL; Better Auth stores any string).
 */
const APP_ONLY_FIELDS = ["metadata", "logo"] as const;

/**
 * True for a request that sets a workspace's metadata or logo: updating
 * one, or making one with them (a new workspace starts without either).
 */
export function setsWorkspaceSettings(path: string, body: unknown): boolean {
  const fields = record(body);
  const sent =
    path === "/organization/update"
      ? record(fields.data)
      : path === "/organization/create"
        ? fields
        : null;
  return (
    sent !== null && APP_ONLY_FIELDS.some((field) => sent[field] !== undefined)
  );
}

/**
 * The hook's decision for an HTTP request to a Better Auth workspace
 * endpoint. Throws for metadata or a logo sent over HTTP (they change only
 * through the app's checks), and
 * TWO_FACTOR_REQUIRED for a request acting on a workspace that shuts the
 * person out. Anything else passes; signed out, the endpoint refuses it on
 * its own. Server-side auth.api calls aren't checked: the app's actions
 * resolve the workspace through lib/scope.ts first.
 */
export async function checkWorkspaceTwoFactorGate(
  request: { http: boolean; path: string; body: unknown; query: unknown },
  signedIn: () => Promise<SignedIn | null>,
  lookups: GateLookups = defaultLookups
): Promise<void> {
  if (!request.http) return;
  if (setsWorkspaceSettings(request.path, request.body)) {
    throw workspaceSettingsInAppError();
  }
  if (!organizationPathActsOnWorkspace(request.path)) return;
  const found = await signedIn();
  if (!found) return;
  const targets = await targetWorkspaces(
    request,
    found.session.activeOrganizationId,
    lookups
  );
  for (const organizationId of targets) {
    if (await lookups.shutOut(found.user.id, organizationId)) {
      throw twoFactorRequiredError();
    }
  }
}

export const workspaceTwoFactorGate = () =>
  ({
    id: "qrdx-workspace-two-factor",
    hooks: {
      before: [
        {
          matcher: (ctx) => (ctx.path ?? "").startsWith("/organization/"),
          handler: createAuthMiddleware((ctx) =>
            checkWorkspaceTwoFactorGate(
              {
                http: ctx.request instanceof Request,
                path: ctx.path,
                body: ctx.body,
                query: ctx.query,
              },
              async () =>
                (await getSessionFromCtx(ctx)) as unknown as SignedIn | null
            )
          ),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
