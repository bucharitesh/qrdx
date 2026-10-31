import "server-only";

import {
  database as db,
  oauthApp,
  oauthToken,
  organization,
} from "@repo/database";
import cuid from "cuid";
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  gt,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { HttpError } from "@/lib/error-response";
import { isOAuthScope, type OAuthScope } from "@/lib/oauth-scopes";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { canManageOAuthApps, isAppInScope } from "./access";
import { createClientSecret, generateClientId } from "./secrets";
import type { OAuthAppValues } from "./validation";

/**
 * Self-serve OAuth apps (Settings → Developers). An app belongs to the
 * workspace it was created in: the creator's personal workspace or the open
 * team. Owners manage apps; plan limits cap how many a workspace has.
 */

export interface OAuthAppView {
  id: string;
  name: string;
  description: string | null;
  clientId: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  redirectUris: string[];
  scopes: OAuthScope[];
  pkceRequired: boolean;
  verified: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  secretRotatedAt: Date | null;
  /** People with a live grant (an unrevoked, unexpired token) */
  userCount: number;
}

type AppRow = typeof oauthApp.$inferSelect;

/** Never exposes client_secret_hash. */
export function toOAuthAppView(row: AppRow, userCount = 0): OAuthAppView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    clientId: row.clientId,
    logoUrl: row.logoUrl,
    websiteUrl: row.websiteUrl,
    redirectUris: Array.isArray(row.redirectUris) ? row.redirectUris : [],
    scopes: (Array.isArray(row.scopes) ? row.scopes : []).filter(isOAuthScope),
    pkceRequired: row.pkceRequired,
    verified: row.verified,
    active: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    secretRotatedAt: row.secretRotatedAt,
    userCount,
  };
}

const notFound = () => new HttpError(404, "NOT_FOUND", "App not found.");

function assertManager(scope: ActiveScope) {
  if (!canManageOAuthApps(scope)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners can create or change the team's OAuth apps.",
    );
  }
}

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(oauthApp.organizationId, scope.organizationId)
    : (and(
        eq(oauthApp.ownerUserId, scope.userId),
        isNull(oauthApp.organizationId),
      ) as SQL);
}

async function findInScope(scope: ActiveScope, id: string): Promise<AppRow> {
  const [row] = await db
    .select()
    .from(oauthApp)
    .where(eq(oauthApp.id, id))
    .limit(1);
  // Apps of other workspaces look exactly like missing ones.
  if (!(row && isAppInScope(scope, row))) throw notFound();
  return row;
}

/** Distinct people per app with a token that is still usable. */
async function userCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const now = new Date();
  const rows = await db
    .select({
      appId: oauthToken.appId,
      total: countDistinct(oauthToken.userId),
    })
    .from(oauthToken)
    .where(
      and(
        inArray(oauthToken.appId, ids),
        isNull(oauthToken.revokedAt),
        or(
          gt(oauthToken.accessTokenExpiresAt, now),
          gt(oauthToken.refreshTokenExpiresAt, now),
        ),
      ),
    )
    .groupBy(oauthToken.appId);
  return new Map(rows.map((row) => [row.appId, row.total]));
}

export async function oauthAppLimit(scope: ActiveScope): Promise<{
  plan: Plan;
  limit: number;
}> {
  const plan = await getPlanForScope(scope);
  return { plan, limit: getPlanLimits(plan).oauthApps };
}

export async function listOAuthApps(
  scope: ActiveScope,
): Promise<OAuthAppView[]> {
  const rows = await db
    .select()
    .from(oauthApp)
    .where(scopeWhere(scope))
    .orderBy(asc(oauthApp.createdAt), asc(oauthApp.id));
  const counts = await userCounts(rows.map((row) => row.id));
  return rows.map((row) => toOAuthAppView(row, counts.get(row.id) ?? 0));
}

export async function getOAuthApp(
  scope: ActiveScope,
  id: string,
): Promise<OAuthAppView> {
  const row = await findInScope(scope, id);
  const counts = await userCounts([row.id]);
  return toOAuthAppView(row, counts.get(row.id) ?? 0);
}

export interface OAuthAppsOverview {
  plan: Plan;
  limit: number;
  canManage: boolean;
  /** "Personal workspace" or the team's name */
  workspaceName: string;
  isTeam: boolean;
  apps: OAuthAppView[];
}

export async function getOAuthAppsOverview(
  scope: ActiveScope,
): Promise<OAuthAppsOverview> {
  const [{ plan, limit }, apps, team] = await Promise.all([
    oauthAppLimit(scope),
    listOAuthApps(scope),
    scope.organizationId
      ? db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, scope.organizationId))
          .limit(1)
          .then(([row]) => row ?? null)
      : null,
  ]);
  return {
    plan,
    limit,
    canManage: canManageOAuthApps(scope),
    workspaceName: team?.name ?? "Personal workspace",
    isTeam: Boolean(scope.organizationId),
    apps,
  };
}

export function appLimitError(limit: number, isTeam: boolean): HttpError {
  const apps = limit === 1 ? "1 OAuth app" : `${limit} OAuth apps`;
  return new HttpError(
    402,
    "LIMIT_REACHED",
    isTeam
      ? `This team's plan includes ${apps}. Delete one, or ask a team owner to upgrade.`
      : `Your plan includes ${apps}. Delete one or upgrade to add more.`,
  );
}

/** Returns the client secret once; only its hash is stored. */
export async function createOAuthApp(
  scope: ActiveScope,
  values: OAuthAppValues,
): Promise<{ app: OAuthAppView; clientSecret: string }> {
  assertManager(scope);
  const [{ limit }, [{ total } = { total: 0 }]] = await Promise.all([
    oauthAppLimit(scope),
    db.select({ total: count() }).from(oauthApp).where(scopeWhere(scope)),
  ]);
  if (total >= limit) {
    throw appLimitError(limit, Boolean(scope.organizationId));
  }

  const { secret, hash } = await createClientSecret();
  const now = new Date();
  const [row] = await db
    .insert(oauthApp)
    .values({
      id: cuid(),
      name: values.name,
      description: values.description,
      clientId: generateClientId(),
      clientSecretHash: hash,
      redirectUris: values.redirectUris,
      scopes: values.scopes,
      isActive: true,
      ownerUserId: scope.userId,
      organizationId: scope.organizationId,
      logoUrl: values.logoUrl,
      websiteUrl: values.websiteUrl,
      verified: false,
      pkceRequired: values.pkceRequired,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("OAuth app insert returned no row");
  return { app: toOAuthAppView(row), clientSecret: secret };
}

/**
 * Changing what people see on the consent screen (name, logo, website) drops
 * the verified badge until the QRdx team reviews the app again.
 */
export function keepsVerification(
  current: Pick<AppRow, "name" | "logoUrl" | "websiteUrl">,
  next: Pick<OAuthAppValues, "name" | "logoUrl" | "websiteUrl">,
): boolean {
  return (
    current.name === next.name &&
    current.logoUrl === next.logoUrl &&
    current.websiteUrl === next.websiteUrl
  );
}

export async function updateOAuthApp(
  scope: ActiveScope,
  id: string,
  values: OAuthAppValues,
): Promise<OAuthAppView> {
  assertManager(scope);
  const current = await findInScope(scope, id);
  const [row] = await db
    .update(oauthApp)
    .set({
      name: values.name,
      description: values.description,
      logoUrl: values.logoUrl,
      websiteUrl: values.websiteUrl,
      redirectUris: values.redirectUris,
      scopes: values.scopes,
      pkceRequired: values.pkceRequired,
      verified: current.verified && keepsVerification(current, values),
      updatedAt: new Date(),
    })
    .where(and(eq(oauthApp.id, id), scopeWhere(scope)))
    .returning();
  if (!row) throw notFound();
  return getOAuthApp(scope, row.id);
}

/** Pausing an app stops new authorizations and every token it issued. */
export async function setOAuthAppActive(
  scope: ActiveScope,
  id: string,
  active: boolean,
): Promise<{ id: string; active: boolean }> {
  assertManager(scope);
  await findInScope(scope, id);
  const [row] = await db
    .update(oauthApp)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(oauthApp.id, id), scopeWhere(scope)))
    .returning({ id: oauthApp.id, active: oauthApp.isActive });
  if (!row) throw notFound();
  return row;
}

/**
 * The old secret stops working at once. Tokens already issued keep working;
 * they don't depend on the secret.
 */
export async function regenerateOAuthAppSecret(
  scope: ActiveScope,
  id: string,
): Promise<{ clientSecret: string; secretRotatedAt: Date }> {
  assertManager(scope);
  await findInScope(scope, id);
  const { secret, hash } = await createClientSecret();
  const now = new Date();
  const [row] = await db
    .update(oauthApp)
    .set({ clientSecretHash: hash, secretRotatedAt: now, updatedAt: now })
    .where(and(eq(oauthApp.id, id), scopeWhere(scope)))
    .returning({ id: oauthApp.id });
  if (!row) throw notFound();
  return { clientSecret: secret, secretRotatedAt: now };
}

/** Its authorization codes and tokens are deleted with it (FK cascade). */
export async function deleteOAuthApp(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string }> {
  assertManager(scope);
  const deleted = await db
    .delete(oauthApp)
    .where(and(eq(oauthApp.id, id), scopeWhere(scope)))
    .returning({ id: oauthApp.id });
  if (deleted.length === 0) throw notFound();
  return { id };
}
