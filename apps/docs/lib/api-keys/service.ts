import "server-only";

import { apiKey, database as db, member, user } from "@repo/database";
import cuid from "cuid";
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNull,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { HttpError } from "@/lib/error-response";
import { isBanActive } from "@/lib/oauth";
import { isOAuthScope, type OAuthScope } from "@/lib/oauth-scopes";
import { assertCan } from "@/lib/permissions-server";
import type { ActiveScope, ScopeRole } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { canRevokeKey, canSeeAllKeys, roleFromMembership } from "./access";
import { generateApiKey, hashApiKey, sameHash } from "./crypto";
import {
  type ApiKeyExpiryDays,
  expiryDate,
  isApiKeyFormat,
  MAX_API_KEYS,
} from "./shared";

/**
 * API keys (Settings → Developers). A key belongs to the workspace it was
 * created in and acts as its creator there: with their role at the time of
 * each request (so it never does more than they can), narrowed by its
 * scopes, against the workspace's plan and daily quota. A team key stops
 * working when its creator leaves the team, is banned, or deletes their
 * account; deleting the team deletes its keys.
 *
 * Until packages/database/manual-sql/0011_api_key.sql is applied there is no
 * api_key table: keys then authenticate nothing (401, never a 500) and the
 * settings page says keys aren't available.
 */

export interface ApiKeyView {
  id: string;
  name: string;
  /** `qrdx_aB3dE5`, the part kept in clear */
  start: string;
  scopes: OAuthScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  expired: boolean;
  creator: { id: string; name: string };
  mine: boolean;
  canRevoke: boolean;
}

/** The workspace's keys can't be read: the api_key table isn't there yet. */
export class ApiKeysUnavailableError extends Error {
  constructor() {
    super("API keys aren't available on this deployment yet.");
    this.name = "ApiKeysUnavailableError";
  }
}

/**
 * Postgres's "undefined table" (42P01), however deeply the driver error is
 * wrapped (drizzle puts it in DrizzleQueryError.cause).
 */
export function isMissingTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

let missingTableLogged = false;
function reportMissingTable(error: unknown) {
  if (missingTableLogged) return;
  missingTableLogged = true;
  logError(error as Error, {
    action: "api-keys",
    hint: "Apply packages/database/manual-sql/0011_api_key.sql",
  });
}

/** Runs a key query; a missing table becomes ApiKeysUnavailableError. */
async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error)) {
      reportMissingTable(error);
      throw new ApiKeysUnavailableError();
    }
    throw error;
  }
}

/** Keys of the scope's workspace: the team's, or the user's personal ones. */
function workspaceWhere(scope: Pick<ActiveScope, "userId" | "organizationId">) {
  return scope.organizationId
    ? eq(apiKey.organizationId, scope.organizationId)
    : (and(
        eq(apiKey.userId, scope.userId),
        isNull(apiKey.organizationId),
      ) as SQL);
}

const notFound = () => new HttpError(404, "NOT_FOUND", "API key not found.");

const isExpired = (expiresAt: Date | null, now: Date) =>
  expiresAt !== null && expiresAt.getTime() <= now.getTime();

/** Never includes the hash. */
function toView(
  scope: ActiveScope,
  row: {
    id: string;
    name: string;
    start: string;
    scopes: unknown;
    userId: string;
    creatorName: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
  },
  now: Date,
): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    start: row.start,
    scopes: (Array.isArray(row.scopes) ? row.scopes : []).filter(isOAuthScope),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    expired: isExpired(row.expiresAt, now),
    creator: { id: row.userId, name: row.creatorName },
    mine: row.userId === scope.userId,
    canRevoke: canRevokeKey(scope, row),
  };
}

const viewColumns = {
  id: apiKey.id,
  name: apiKey.name,
  start: apiKey.start,
  scopes: apiKey.scopes,
  userId: apiKey.userId,
  creatorName: user.name,
  createdAt: apiKey.createdAt,
  lastUsedAt: apiKey.lastUsedAt,
  expiresAt: apiKey.expiresAt,
};

/**
 * The workspace's unrevoked keys, newest first: all of them for owners and
 * admins, only their own for team members. Throws ApiKeysUnavailableError
 * before the table exists.
 */
export async function listApiKeys(
  scope: ActiveScope,
  now: Date = new Date(),
): Promise<ApiKeyView[]> {
  const conditions: SQL[] = [workspaceWhere(scope), isNull(apiKey.revokedAt)];
  if (!canSeeAllKeys(scope)) conditions.push(eq(apiKey.userId, scope.userId));
  const rows = await guarded(() =>
    db
      .select(viewColumns)
      .from(apiKey)
      .innerJoin(user, eq(user.id, apiKey.userId))
      .where(and(...conditions))
      .orderBy(desc(apiKey.createdAt), desc(apiKey.id)),
  );
  return rows.map((row) => toView(scope, row, now));
}

/** Keys that still work: neither revoked nor expired. */
async function countActiveKeys(scope: ActiveScope, now: Date) {
  const [row] = await guarded(() =>
    db
      .select({ total: count() })
      .from(apiKey)
      .where(
        and(
          workspaceWhere(scope),
          eq(apiKey.userId, scope.userId),
          isNull(apiKey.revokedAt),
          or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, now)),
        ),
      ),
  );
  return row?.total ?? 0;
}

export function keyLimitError(): HttpError {
  return new HttpError(
    403,
    "LIMIT_REACHED",
    `You have ${MAX_API_KEYS} active API keys in this workspace. Revoke one to create another.`,
  );
}

/**
 * Creates a key in the scope's workspace for the signed-in user. Returns the
 * key itself, which is never stored and can't be shown again.
 */
export async function createApiKey(
  scope: ActiveScope,
  input: {
    name: string;
    scopes: OAuthScope[];
    expiresInDays: ApiKeyExpiryDays | null;
  },
  now: Date = new Date(),
): Promise<{ key: string; apiKey: ApiKeyView }> {
  // A key acts with its creator's role, so read-only roles get none.
  assertCan(scope, "apiKeys.create");
  if ((await countActiveKeys(scope, now)) >= MAX_API_KEYS) {
    throw keyLimitError();
  }
  const generated = generateApiKey();
  const row = {
    id: cuid(),
    name: input.name,
    keyHash: generated.hash,
    start: generated.start,
    userId: scope.userId,
    organizationId: scope.organizationId,
    scopes: input.scopes,
    expiresAt: expiryDate(input.expiresInDays, now),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await guarded(() => db.insert(apiKey).values(row));
  // Name, scopes and expiry only: the key itself is never recorded.
  recordAuditEvent(scope, {
    action: "api_key.created",
    target: { type: "api_key", id: row.id, label: row.name },
    metadata: { scopes: row.scopes, expiresInDays: input.expiresInDays },
  });

  const [creator] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, scope.userId))
    .limit(1);
  return {
    key: generated.key,
    apiKey: toView(scope, { ...row, creatorName: creator?.name ?? "" }, now),
  };
}

/**
 * Revokes a key: requests with it fail from now on. Its creator and, in a
 * team, owners and admins may revoke it. Keys a caller can't see (another
 * workspace's, or a teammate's for a member) are reported as missing.
 */
export async function revokeApiKey(
  scope: ActiveScope,
  id: string,
  now: Date = new Date(),
): Promise<{ id: string }> {
  const [row] = await guarded(() =>
    db
      .select({
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        scopes: apiKey.scopes,
      })
      .from(apiKey)
      .where(
        and(eq(apiKey.id, id), workspaceWhere(scope), isNull(apiKey.revokedAt)),
      )
      .limit(1),
  );
  if (!(row && canRevokeKey(scope, row))) throw notFound();
  await db
    .update(apiKey)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(apiKey.id, row.id), isNull(apiKey.revokedAt)));
  recordAuditEvent(scope, {
    action: "api_key.revoked",
    target: { type: "api_key", id: row.id, label: row.name },
    metadata: { scopes: Array.isArray(row.scopes) ? row.scopes : [] },
  });
  return { id: row.id };
}

// ─── Authentication ──────────────────────────────────────────────────────────

/** Who a valid key acts as, and what it may do. */
export interface ApiKeyCaller {
  keyId: string;
  userId: string;
  /** null = a key from before workspaces: it acts on the creator's own workspace */
  organizationId: string | null;
  /** The creator's role in the workspace now ("owner" in a personal one) */
  role: ScopeRole;
  scopes: string[];
}

/** lastUsedAt is written at most once a minute per key. */
const LAST_USED_RESOLUTION_MS = 60_000;

async function touchLastUsed(id: string, lastUsedAt: Date | null, now: Date) {
  if (
    lastUsedAt &&
    now.getTime() - lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS
  ) {
    return;
  }
  try {
    await db
      .update(apiKey)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiKey.id, id),
          or(
            isNull(apiKey.lastUsedAt),
            lt(
              apiKey.lastUsedAt,
              new Date(now.getTime() - LAST_USED_RESOLUTION_MS),
            ),
          ),
        ),
      );
  } catch (error) {
    // Bookkeeping only: never fail the request over it.
    logError(error as Error, { action: "api-keys.last-used" });
  }
}

/**
 * The caller behind an API key, or null when the key is malformed, unknown,
 * revoked or expired, its creator is banned, or (for a team key) its creator
 * is no longer a member of the team. Also null before the api_key table
 * exists, so the API answers 401 rather than 500.
 */
export async function authenticateApiKey(
  token: string,
  now: Date = new Date(),
): Promise<ApiKeyCaller | null> {
  if (!isApiKeyFormat(token)) return null;
  const hash = hashApiKey(token);

  let record:
    | {
        id: string;
        keyHash: string;
        userId: string;
        organizationId: string | null;
        scopes: unknown;
        expiresAt: Date | null;
        lastUsedAt: Date | null;
        banned: boolean | null;
        banExpires: Date | null;
        memberRole: string | null;
      }
    | undefined;
  try {
    [record] = await guarded(() =>
      db
        .select({
          id: apiKey.id,
          keyHash: apiKey.keyHash,
          userId: apiKey.userId,
          organizationId: apiKey.organizationId,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
          lastUsedAt: apiKey.lastUsedAt,
          banned: user.banned,
          banExpires: user.banExpires,
          memberRole: member.role,
        })
        .from(apiKey)
        .innerJoin(user, eq(user.id, apiKey.userId))
        .leftJoin(
          member,
          and(
            eq(member.organizationId, apiKey.organizationId),
            eq(member.userId, apiKey.userId),
          ),
        )
        .where(and(eq(apiKey.keyHash, hash), isNull(apiKey.revokedAt)))
        .limit(1),
    );
  } catch (error) {
    if (error instanceof ApiKeysUnavailableError) return null;
    throw error;
  }

  // The lookup matched on the hash; compare again in constant time so the
  // decision never rests on how the database compared strings.
  if (!(record && sameHash(record.keyHash, hash))) return null;
  if (isExpired(record.expiresAt, now)) return null;
  if (isBanActive(record, now)) return null;

  let role: ScopeRole = "owner";
  if (record.organizationId) {
    // The creator left the team: the key goes with them.
    if (!record.memberRole) return null;
    role = roleFromMembership(record.memberRole);
  }

  await touchLastUsed(record.id, record.lastUsedAt, now);
  return {
    keyId: record.id,
    userId: record.userId,
    organizationId: record.organizationId,
    role,
    scopes: Array.isArray(record.scopes) ? (record.scopes as string[]) : [],
  };
}
